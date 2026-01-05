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

class Comment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    userName: str
    userAvatar: Optional[str] = None
    text: str
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CommentRequest(BaseModel):
    text: str

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
    isBNIS: bool = False
    comments: List[Comment] = []

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

# --- Auth Imports & Setup ---
import uuid
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from fastapi import Response, Cookie
import httpx

# Auth Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Models for Auth
class UserSession(BaseModel):
    session_token: str
    user_id: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EmailRegisterRequest(BaseModel):
    email: str
    password: str
    displayName: str

class EmailLoginRequest(BaseModel):
    email: str
    password: str

class EmergentSessionRequest(BaseModel):
    session_id: str

# Helper functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

async def create_session(user_id: str, response: Response):
    session_token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    session_doc = {
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc)
    }
    await db.user_sessions.insert_one(session_doc)
    
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        expires=7 * 24 * 60 * 60
    )
    return session_token

# --- Auth Routes ---

@api_router.post("/auth/register-email")
async def register_email(req: EmailRegisterRequest, response: Response):
    # Check existing
    existing = await db.users.find_one({"email": req.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    hashed_pw = get_password_hash(req.password)
    
    user_doc = {
        "id": user_id,
        "displayName": req.displayName,
        "email": req.email,
        "password_hash": hashed_pw,
        "auth_provider": "email",
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    
    await create_session(user_id, response)
    
    # Return user without sensitive data
    user_doc.pop('password_hash')
    user_doc.pop('_id')
    return {"user": user_doc, "status": "success"}

@api_router.post("/auth/login-email")
async def login_email(req: EmailLoginRequest, response: Response):
    user = await db.users.find_one({"email": req.email})
    if not user or not user.get('password_hash'):
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    if not verify_password(req.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    await create_session(user['id'], response)
    
    user_data = {k:v for k,v in user.items() if k not in ['_id', 'password_hash']}
    return {"user": user_data, "status": "success"}

@api_router.post("/auth/exchange-session")
async def exchange_emergent_session(req: EmergentSessionRequest, response: Response):
    # Call Emergent API
    emergent_url = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
    headers = {"X-Session-ID": req.session_id}
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(emergent_url, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google Session")
        data = resp.json()
            
    # Data has {id, email, name, picture, session_token}
    email = data.get('email')
    
    user = await db.users.find_one({"email": email})
    if not user:
        # Create user
        user_id = str(uuid.uuid4())
        user_doc = {
            "id": user_id,
            "displayName": data.get('name', 'User'),
            "email": email,
            "picture": data.get('picture'),
            "auth_provider": "google",
            "createdAt": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user_doc)
        user = user_doc
    
    # Create local session
    await create_session(user['id'], response)
    
    user_data = {k:v for k,v in user.items() if k not in ['_id', 'password_hash']}
    return {"user": user_data, "status": "success"}

@api_router.get("/auth/me")
async def get_current_user(request: Request):
    token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    session = await db.user_sessions.find_one({"session_token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
        
    # Check expiry
    expires = session['expires_at']
    if isinstance(expires, str):
         try:
            expires = datetime.fromisoformat(expires)
         except: pass
         
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
        
    if expires < datetime.now(timezone.utc):
        await db.user_sessions.delete_one({"session_token": token})
        raise HTTPException(status_code=401, detail="Session expired")
        
    user = await db.users.find_one({"id": session['user_id']}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
        
    return user

@api_router.post("/auth/logout")
async def logout(response: Response, request: Request):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    
    response.delete_cookie("session_token")
    return {"status": "success"}

class UserUpdate(BaseModel):
    displayName: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    facebookLink: Optional[str] = None
    password: Optional[str] = None
    image: Optional[str] = None # Base64 for avatar

@api_router.put("/auth/profile")
async def update_profile(update: UserUpdate, request: Request):
    token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    session = await db.user_sessions.find_one({"session_token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
        
    user_id = session['user_id']
    
    update_data = {}
    if update.displayName: update_data['displayName'] = update.displayName
    if update.email: 
        # Check if email taken by someone else
        existing = await db.users.find_one({"email": update.email, "id": {"$ne": user_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        update_data['email'] = update.email
        
    if update.phone: update_data['phone'] = update.phone
    if update.facebookLink: update_data['facebookLink'] = update.facebookLink
    
    if update.password:
        update_data['password_hash'] = get_password_hash(update.password)
        
    if update.image:
        update_data['picture'] = update.image # Update avatar
        
    if not update_data:
        return {"status": "no changes"}
        
    await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    # Return updated user
    updated_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return updated_user

# Auth
@api_router.post("/auth/login-legacy", response_model=AuthResponse)
async def login(req: AuthRequest):
    user = await db.users.find_one({"displayName": req.displayName})
    if not user:
        user_obj = User(displayName=req.displayName)
        doc = user_obj.model_dump()
        doc['createdAt'] = doc['createdAt'].isoformat()
        await db.users.insert_one(doc)
        user_data = user_obj
from fastapi_sso.sso.facebook import FacebookSSO
from fastapi.responses import RedirectResponse

# Facebook Configuration
FB_CLIENT_ID = os.environ.get("FACEBOOK_APP_ID", "YOUR_FB_APP_ID_PLACEHOLDER")
FB_CLIENT_SECRET = os.environ.get("FACEBOOK_APP_SECRET", "YOUR_FB_APP_SECRET_PLACEHOLDER")
# Important: This URL must match exactly what you register in Facebook
# In production, this must be HTTPS
FB_REDIRECT_URI = os.environ.get("FACEBOOK_REDIRECT_URI", "http://localhost:8001/api/auth/facebook/callback")

facebook_sso = FacebookSSO(
    client_id=FB_CLIENT_ID,
    client_secret=FB_CLIENT_SECRET,
    redirect_uri=FB_REDIRECT_URI,
    allow_insecure_http=True # Allow localhost
)

@api_router.get("/auth/facebook/login")
async def facebook_login():
    """Redirect user to Facebook Login"""
    return await facebook_sso.get_login_redirect()

@api_router.get("/auth/facebook/callback")
async def facebook_callback(request: Request):
    """Handle Facebook Callback"""
    try:
        user_sso = await facebook_sso.verify_and_process(request)
        
        # Check if user exists
        user = await db.users.find_one({"email": user_sso.email})
        if not user:
            # Create user
            user_id = str(uuid.uuid4())
            user_doc = {
                "id": user_id,
                "displayName": user_sso.display_name or "Facebook User",
                "email": user_sso.email,
                "picture": user_sso.picture,
                "auth_provider": "facebook",
                "provider_id": user_sso.id,
                "createdAt": datetime.now(timezone.utc).isoformat()
            }
            await db.users.insert_one(user_doc)
            user = user_doc
        
        # Redirect to Frontend
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
        redirect = RedirectResponse(url=f"{frontend_url}", status_code=302)
        
        # Create Session & Set Cookie directly on the redirect response
        session_token = str(uuid.uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        
        session_doc = {
            "session_token": session_token,
            "user_id": user['id'],
            "expires_at": expires_at,
            "created_at": datetime.now(timezone.utc)
        }
        await db.user_sessions.insert_one(session_doc)
        
        redirect.set_cookie(
            key="session_token",
            value=session_token,
            httponly=True,
            secure=True,
            samesite="none",
            expires=7 * 24 * 60 * 60
        )
        
        return redirect
        
    except Exception as e:
        logger.error(f"Facebook Auth Error: {e}")
        # Redirect to login with error
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
        return RedirectResponse(url=f"{frontend_url}/login?error=FacebookAuthFailed", status_code=302)

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
    
    # Enrich listings with seller contact info
    seller_ids = list(set(l['sellerId'] for l in listings if l.get('sellerId')))
    if seller_ids:
        users_cursor = db.users.find({"id": {"$in": seller_ids}}, {"_id": 0, "password_hash": 0})
        users_list = await users_cursor.to_list(length=None)
        users_map = {u['id']: u for u in users_list}
        
        for l in listings:
            seller = users_map.get(l.get('sellerId'))
            if seller:
                l['sellerName'] = seller.get('displayName')
                l['sellerPhone'] = seller.get('phone')
                l['sellerFb'] = seller.get('facebookLink')
                l['sellerAvatar'] = seller.get('picture') or seller.get('image')

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
@api_router.post("/listings/{id}/comments")
async def add_comment(id: str, comment: CommentRequest, request: Request):
    token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
        
    user = await db.users.find_one({"id": session['user_id']})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    new_comment = Comment(
        userId=user['id'],
        userName=user['displayName'],
        userAvatar=user.get('picture') or user.get('image'),
        text=comment.text
    )
    
    comment_doc = new_comment.model_dump()
    comment_doc['createdAt'] = comment_doc['createdAt'].isoformat()
    
    result = await db.listings.update_one(
        {"id": id},
        {"$push": {"comments": comment_doc}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Listing not found")
        
    return comment_doc

@api_router.delete("/listings/{id}/comments/{commentId}")
async def delete_comment(id: str, commentId: str, request: Request):
    token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
        
    # Remove comment only if user matches
    result = await db.listings.update_one(
        {"id": id},
        {"$pull": {"comments": {"id": commentId, "userId": session['user_id']}}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Comment not found or unauthorized")
        
    return {"status": "success"}

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
