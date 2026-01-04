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
import html
from bs4 import BeautifulSoup

# Emergent Integration
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
if not mongo_url:
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

def get_bgg_session():
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://boardgamegeek.com/",
        "Connection": "keep-alive"
    })
    return s

def scrape_bgg_search(q: str):
    try:
        url = f"https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q={q}"
        s = get_bgg_session()
        res = s.get(url, timeout=10)
        if res.status_code != 200:
            return []
        
        soup = BeautifulSoup(res.text, 'html.parser')
        rows = soup.select('#collectionitems tr')
        results = []
        for row in rows[1:6]: # Skip header, limit 5
            try:
                # Title & ID
                title_link = row.select_one('.collection_objectname a.primary')
                if not title_link: continue
                
                title = title_link.text.strip()
                href = title_link['href'] # /boardgame/13/catan
                bgg_id = href.split('/')[2]
                
                # Year
                year_span = row.select_one('.collection_objectname .smallerfont')
                year = year_span.text.strip('()') if year_span else ""
                
                # Thumbnail
                img_tag = row.select_one('.collection_thumbnail img')
                thumbnail = img_tag['src'] if img_tag else ""
                
                results.append({
                    "id": bgg_id,
                    "title": title,
                    "year": year,
                    "thumbnail": thumbnail,
                    "image": thumbnail # Fallback
                })
            except: continue
        return results
    except Exception as e:
        logging.error(f"Scrape Search Error: {e}")
        return []

def scrape_bgg_details(bgg_id: str):
    try:
        url = f"https://boardgamegeek.com/boardgame/{bgg_id}"
        s = get_bgg_session()
        res = s.get(url, timeout=10)
        if res.status_code != 200:
            return {}
            
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # Image - Try meta tags first
        image = ""
        og_image = soup.select_one('meta[property="og:image"]')
        if og_image:
            image = og_image['content']
            
        # Description
        desc = ""
        desc_meta = soup.select_one('meta[name="description"]') # Often short
        # Or find the angular description block if possible, but meta is safer for now
        if desc_meta:
            desc = desc_meta['content']
            
        return {"image": image, "description": desc}
    except Exception as e:
        logging.error(f"Scrape Details Error: {e}")
        return {}

# --- Routes ---

@api_router.get("/")
async def root():
    return {"message": "Pasar Malam API"}

# Auth
@api_router.post("/auth/login", response_model=AuthResponse)
async def login(req: AuthRequest):
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
    
    cursor = db.listings.find(query, {"_id": 0}).sort("createdAt", -1).limit(100)
    listings = await cursor.to_list(length=100)
    
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
    
    # Optimization: Batch fetch users
    seller_ids = list(set(item.sellerId for item in items if item.sellerId))
    users_cursor = db.users.find({"id": {"$in": seller_ids}})
    users_list = await users_cursor.to_list(length=None)
    users_map = {u['id']: u['displayName'] for u in users_list}

    for item in items:
        if item.sellerId in users_map:
            item.sellerName = users_map[item.sellerId]
            
        doc = item.model_dump()
        doc['createdAt'] = doc['createdAt'].isoformat()
        if doc['updatedAt']:
            doc['updatedAt'] = doc['updatedAt'].isoformat()
        
        docs.append(doc)
        created_items.append(doc)

    if docs:
        await db.listings.insert_many(docs)
        
    for d in created_items:
        if '_id' in d:
            del d['_id']
            
    return created_items

@api_router.put("/listings/{id}")
async def update_listing(id: str, update_data: dict = Body(...)):
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

# Seed endpoint removed

# Integrations

@api_router.post("/ai/scan-image")
async def scan_image(req: ScanImageRequest):
    try:
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=f"scan-{uuid.uuid4()}",
            system_message="You are a board game expert."
        ).with_model("gemini", "gemini-2.5-flash")

        prompt = """Look at this image of boardgames. Identify ALL boardgames visible. 
        Return a JSON ARRAY of objects. Each object must have: 
        - 'title' (string)
        - 'price' (number, guess 0 if not visible)
        - 'condition' (number 1.0 to 10.0, estimate based on wear, default 8.0)
        - 'description' (short text)
        Strictly JSON array only. Do not wrap in markdown."""
        
        b64_data = req.image
        if "base64," in b64_data:
            b64_data = b64_data.split("base64,")[1]

        image_content = ImageContent(image_base64=b64_data)
        
        user_msg = UserMessage(text=prompt, file_contents=[image_content])
        response = await chat.send_message(user_msg)
        
        text = response.replace("```json", "").replace("```", "").strip()
        try:
            data = json.loads(text)
            return data
        except:
            return []
            
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
    
    results = []
    
    # 1. Try XML API
    try:
        url = f"https://boardgamegeek.com/xmlapi2/search?query={q}&type=boardgame"
        s = get_bgg_session()
        res = s.get(url, timeout=5)
        
        if res.status_code == 200 and res.content:
            data = xmltodict.parse(res.content)
            items = data.get('items', {}).get('item', [])
            if isinstance(items, dict): items = [items]
            
            for item in items[:5]:
                name_val = item.get('name', {}).get('@value')
                if not name_val and isinstance(item.get('name'), list):
                     name_val = item.get('name')[0].get('@value')
                     
                results.append({
                    "id": item.get('@id'),
                    "title": name_val,
                    "year": item.get('yearpublished', {}).get('@value')
                })
    except Exception as e:
        logging.warning(f"BGG XML Search failed, trying scrape: {e}")

    # 2. Fallback to Scrape if no results (likely blocked)
    if not results:
        results = scrape_bgg_search(q)
        
    # 3. Enhance with images/descriptions
    # For XML API results, we still need details. 
    # For Scrape results, we have thumbnails but no description/full-image.
    
    # We will try to fetch details for the top results.
    for r in results[:5]:
        # Try XML details first
        try:
             url = f"https://boardgamegeek.com/xmlapi2/thing?id={r['id']}"
             s = get_bgg_session()
             res = s.get(url, timeout=5)
             if res.status_code == 200:
                d_data = xmltodict.parse(res.content)
                item = d_data.get('items', {}).get('item', {})
                if item:
                    r['image'] = item.get('image', r.get('image', ''))
                    r['thumbnail'] = item.get('thumbnail', r.get('thumbnail', ''))
                    raw_desc = item.get('description', '')
                    r['description'] = html.unescape(raw_desc) if raw_desc else ""
             else:
                 raise Exception("XML Details blocked")
        except:
            # Fallback Scrape Details
            details = scrape_bgg_details(r['id'])
            if details.get('image'): r['image'] = details['image']
            if details.get('description'): r['description'] = details['description']
            
    return results

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
