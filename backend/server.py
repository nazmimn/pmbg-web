from fastapi import FastAPI, APIRouter, HTTPException, Request, Body
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Any
import uuid
from datetime import datetime, timezone
import requests
import xmltodict
import json
import asyncio

# Emergent Integration
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
if not mongo_url:
    # Fallback/Default for safety if env not set correctly, though environment setup guarantees it.
    mongo_url = "mongodb://localhost:27017" 

client = AsyncIOMotorClient(mongo_url)
db_name = os.environ.get('DB_NAME', 'app_db')
db = client[db_name]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# --- Models ---

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    displayName: str
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Listing(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # WTS, WTB, WTT, WTL
    title: str
    price: Optional[float] = None
    condition: Optional[float] = 8.0
    description: Optional[str] = ""
    images: List[str] = []  # Base64 strings
    image: Optional[str] = "" # Main cover image
    status: str = "active" # active, sold
    sellerId: str
    sellerName: Optional[str] = "" # Denormalized for easier display
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updatedAt: Optional[datetime] = None
    
    # Auction specific
    currentBid: Optional[float] = 0
    bidCount: Optional[int] = 0
    lastBidderId: Optional[str] = None
    
    # Metadata
    bggId: Optional[str] = None
    openForTrade: bool = False

class AuthRequest(BaseModel):
    displayName: str

class AuthResponse(BaseModel):
    user: User
    token: str # Just UUID for this simple app

class ScanImageRequest(BaseModel):
    image: str # Base64

class ParseTextRequest(BaseModel):
    text: str
    type: Optional[str] = "WTS"

class BidRequest(BaseModel):
    bidAmount: float
    userId: str

# --- Helpers ---

def serialize_doc(doc):
    if not doc:
        return None
    doc['id'] = doc.get('id') or str(doc.get('_id'))
    if '_id' in doc:
        del doc['_id']
    for k, v in doc.items():
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc

# --- Routes ---

@api_router.get("/")
async def root():
    return {"message": "Pasar Malam API"}

# Auth
@api_router.post("/auth/login", response_model=AuthResponse)
async def login(req: AuthRequest):
    # Check if user exists by name (simple logic) or create new
    # In a real app we'd need passwords/social auth. 
    # For this MVP "Join/Login", we check if name exists, else create.
    # Actually, simpler: just create a new user or find existing one? 
    # Let's trust the client ID if provided, otherwise create new.
    # The frontend logic was "signInAnonymously" then "updateProfile".
    # We'll just create a user if they don't have an ID, or return success.
    
    # For simplicity, we just create a new user session or return a mock token
    # If the user wants persistent identity they rely on localStorage ID.
    
    user = await db.users.find_one({"displayName": req.displayName})
    if not user:
        user_obj = User(displayName=req.displayName)
        doc = user_obj.model_dump()
        doc['createdAt'] = doc['createdAt'].isoformat()
        await db.users.insert_one(doc)
        user_data = user_obj
    else:
        user_data = User(**user)
        
    return {"user": user_data, "token": user_data.id}

# Listings
@api_router.get("/listings", response_model=List[dict])
async def get_listings(type: Optional[str] = None, sellerId: Optional[str] = None):
    query = {}
    if type and type != 'ALL':
        query['type'] = type
    if sellerId:
        query['sellerId'] = sellerId
    
    # Limit content for list view (exclude huge images array if needed, but keep main image)
    # For MVP we just return everything, but maybe limit 100
    cursor = db.listings.find(query, {"_id": 0}).sort("createdAt", -1).limit(100)
    listings = await cursor.to_list(length=100)
    
    # Deserialize dates
    for l in listings:
        if isinstance(l.get('createdAt'), str):
            try:
                l['createdAt'] = datetime.fromisoformat(l['createdAt'])
            except: pass
            
    return listings

@api_router.post("/listings", response_model=List[dict])
async def create_listings(items: List[Listing]):
    if not items:
        return []
    
    docs = []
    created_items = []
    for item in items:
        # Validate seller exists (optional)
        user = await db.users.find_one({"id": item.sellerId})
        if user:
            item.sellerName = user['displayName']
            
        doc = item.model_dump()
        doc['createdAt'] = doc['createdAt'].isoformat()
        if doc['updatedAt']:
            doc['updatedAt'] = doc['updatedAt'].isoformat()
        
        docs.append(doc)
        created_items.append(doc)

    if docs:
        await db.listings.insert_many(docs)
        
    # Remove _id from response
    for d in created_items:
        if '_id' in d:
            del d['_id']
            
    return created_items

@api_router.put("/listings/{id}")
async def update_listing(id: str, update_data: dict = Body(...)):
    # Remove immutable fields if present
    update_data.pop('id', None)
    update_data.pop('createdAt', None)
    update_data['updatedAt'] = datetime.now(timezone.utc).isoformat()
    
    result = await db.listings.update_one({"id": id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Listing not found")
    
    updated = await db.listings.find_one({"id": id}, {"_id": 0})
    return updated

@api_router.delete("/listings/{id}")
async def delete_listing(id: str):
    result = await db.listings.delete_one({"id": id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Listing not found")
    return {"status": "success"}

@api_router.post("/listings/{id}/bid")
async def place_bid(id: str, bid: BidRequest):
    listing = await db.listings.find_one({"id": id})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    
    if bid.bidAmount <= (listing.get('currentBid') or 0):
        raise HTTPException(status_code=400, detail="Bid must be higher than current")

    update_data = {
        "currentBid": bid.bidAmount,
        "lastBidderId": bid.userId,
        "bidCount": (listing.get('bidCount') or 0) + 1,
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    
    await db.listings.update_one({"id": id}, {"$set": update_data})
    return {"status": "success", "newBid": bid.bidAmount}

# Seed
@api_router.post("/seed")
async def seed_data(req: Request):
    # Dummy seed logic if needed, but frontend has seed logic
    return {"status": "ok"}

# Integrations

@api_router.post("/ai/scan-image")
async def scan_image(req: ScanImageRequest):
    try:
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=f"scan-{uuid.uuid4()}",
            system_message="You are a board game expert."
        ).with_model("gemini", "gemini-2.5-flash") # Use flash for speed/vision

        prompt = """Look at this image of board games. Identify ALL board games visible. 
        Return a JSON ARRAY of objects. Each object must have: 
        - 'title' (string)
        - 'price' (number, guess 0 if not visible)
        - 'condition' (number 1.0 to 10.0, estimate based on wear, default 8.0)
        - 'description' (short text)
        Strictly JSON array only. Do not wrap in markdown."""
        
        # Handle base64
        # ImageContent expects raw base64 without data prefix usually, but let's check lib
        # The frontend sends "data:image/jpeg;base64,..."
        b64_data = req.image
        if "base64," in b64_data:
            b64_data = b64_data.split("base64,")[1]

        image_content = ImageContent(image_base64=b64_data)
        
        user_msg = UserMessage(text=prompt, file_contents=[image_content])
        response = await chat.send_message(user_msg)
        
        # Clean response
        text = response.replace("```json", "").replace("```", "").strip()
        try:
            data = json.loads(text)
            return data
        except:
            return [] # Fallback
            
    except Exception as e:
        logging.error(f"AI Scan Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/ai/parse-text")
async def parse_text(req: ParseTextRequest):
    try:
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=f"parse-{uuid.uuid4()}",
            system_message="You are a board game marketplace assistant."
        ).with_model("gemini", "gemini-2.5-flash")

        prompt = f"""Analyze this selling post. Extract ALL listed items into a JSON ARRAY.
        Each object keys: title, price (number only), condition (number 1.0-10.0), description.
        Text: "{req.text}"
        Strictly JSON array only. Do not wrap in markdown."""
        
        user_msg = UserMessage(text=prompt)
        response = await chat.send_message(user_msg)
        
        text = response.replace("```json", "").replace("```", "").strip()
        try:
            data = json.loads(text)
            return data
        except:
            return []
            
    except Exception as e:
        logging.error(f"AI Parse Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/bgg/search")
async def bgg_search(q: str):
    if not q or len(q) < 3:
        return []
    
    try:
        # Use allorigins proxy to bypass potential blocks/CORS (though CORS isn't issue for backend, IP block might be)
        target_url = f"https://boardgamegeek.com/xmlapi2/search?query={q}&type=boardgame"
        url = f"https://api.allorigins.win/raw?url={requests.utils.quote(target_url)}"
        
        headers = {'User-Agent': 'PasarMalamApp/1.0'}
        res = requests.get(url, headers=headers, timeout=10)
        
        # BGG often returns 202 if processing, need to handle or just retry/fail
        if res.status_code == 202:
             return []
             
        data = xmltodict.parse(res.content)
        
        items = data.get('items', {}).get('item', [])
        if isinstance(items, dict): items = [items] # Handle single result
        
        results = []
        for item in items[:5]: # Limit 5
            name_val = item.get('name', {}).get('@value')
            if not name_val and isinstance(item.get('name'), list):
                 name_val = item.get('name')[0].get('@value')
                 
            results.append({
                "id": item.get('@id'),
                "title": name_val,
                "year": item.get('yearpublished', {}).get('@value')
            })
            
        # Detail fetch for images (simple logic)
        if results:
            ids = ",".join([r['id'] for r in results])
            detail_url = f"https://boardgamegeek.com/xmlapi2/thing?id={ids}"
            d_res = requests.get(detail_url, timeout=10)
            d_data = xmltodict.parse(d_res.content)
            d_items = d_data.get('items', {}).get('item', [])
            if isinstance(d_items, dict): d_items = [d_items]
            
            for r in results:
                match = next((i for i in d_items if i.get('@id') == r['id']), None)
                if match:
                    r['image'] = match.get('image', '')
                    r['thumbnail'] = match.get('thumbnail', '')
                    r['description'] = match.get('description', '')
                    
        return results
    except Exception as e:
        logging.error(f"BGG Error: {e}")
        return []

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
