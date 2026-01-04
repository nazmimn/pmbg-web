import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

async def clear_data():
    mongo_url = os.environ.get('MONGO_URL', "mongodb://localhost:27017")
    db_name = os.environ.get('DB_NAME', 'app_db')
    
    print(f"Connecting to {mongo_url}...")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Delete all listings
    result = await db.listings.delete_many({})
    print(f"Deleted {result.deleted_count} listings.")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(clear_data())
