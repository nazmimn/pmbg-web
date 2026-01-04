#!/usr/bin/env python3
"""
Backend API Testing Script for Pasar Malam
Tests Authentication, Listings CRUD, BGG Search, and AI Text Parsing
"""

import requests
import json
import uuid
from datetime import datetime
import sys

# Get backend URL from frontend .env
BACKEND_URL = "https://code-from-repo.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.user_token = None
        self.user_id = None
        self.created_listing_id = None
        self.test_results = {
            "auth": {"status": "pending", "details": []},
            "auth_email": {"status": "pending", "details": []},
            "profile_update": {"status": "pending", "details": []},
            "listings_enrichment": {"status": "pending", "details": []},
            "listings_crud": {"status": "pending", "details": []},
            "bgg_search": {"status": "pending", "details": []},
            "ai_parse": {"status": "pending", "details": []}
        }

    def log_result(self, category, success, message, details=None):
        """Log test result"""
        result = {
            "success": success,
            "message": message,
            "timestamp": datetime.now().isoformat()
        }
        if details:
            result["details"] = details
        
        self.test_results[category]["details"].append(result)
        if not success and self.test_results[category]["status"] != "failed":
            self.test_results[category]["status"] = "failed"
        elif success and self.test_results[category]["status"] == "pending":
            self.test_results[category]["status"] = "passed"

    def test_email_authentication(self):
        """Test NEW email-based authentication endpoints"""
        print("\n=== Testing Email Authentication ===")
        
        try:
            # Test data as specified in the review request
            test_email = "test@example.com"
            test_password = "password123"
            test_display_name = "Test User"
            
            # 1. Register a new user via POST /api/auth/register-email
            print("\n--- Testing User Registration ---")
            register_data = {
                "email": test_email,
                "password": test_password,
                "displayName": test_display_name
            }
            
            response = self.session.post(f"{BACKEND_URL}/auth/register-email", json=register_data)
            
            if response.status_code == 200:
                data = response.json()
                if "user" in data and "status" in data and data["status"] == "success":
                    self.log_result("auth_email", True, f"Successfully registered user: {test_email}")
                    print(f"✅ Registration successful - User: {test_email}")
                    
                    # Check if session_token cookie is set
                    if 'session_token' in response.cookies:
                        self.log_result("auth_email", True, "Session token cookie set during registration")
                        print(f"✅ Session token cookie set during registration")
                    else:
                        self.log_result("auth_email", False, "Session token cookie not set during registration")
                        print(f"❌ Session token cookie not set during registration")
                        return False
                else:
                    self.log_result("auth_email", False, "Invalid response format for registration", data)
                    print(f"❌ Invalid registration response format: {data}")
                    return False
            elif response.status_code == 400 and "already registered" in response.text:
                # User already exists, continue with login test
                self.log_result("auth_email", True, f"User {test_email} already exists, proceeding to login test")
                print(f"ℹ️ User {test_email} already exists, proceeding to login test")
            else:
                self.log_result("auth_email", False, f"Registration failed: HTTP {response.status_code}: {response.text}")
                print(f"❌ Registration failed: {response.status_code} - {response.text}")
                return False
            
            # 2. Login via POST /api/auth/login-email and check session_token cookie
            print("\n--- Testing User Login ---")
            login_data = {
                "email": test_email,
                "password": test_password
            }
            
            # Clear any existing cookies to test fresh login
            self.session.cookies.clear()
            
            response = self.session.post(f"{BACKEND_URL}/auth/login-email", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                if "user" in data and "status" in data and data["status"] == "success":
                    self.log_result("auth_email", True, f"Successfully logged in user: {test_email}")
                    print(f"✅ Login successful - User: {test_email}")
                    
                    # Check if session_token cookie is set in response headers
                    if 'session_token' in response.cookies:
                        session_token = response.cookies['session_token']
                        self.log_result("auth_email", True, "Session token cookie set during login")
                        print(f"✅ Session token cookie set during login: {session_token[:8]}...")
                    else:
                        self.log_result("auth_email", False, "Session token cookie not set during login")
                        print(f"❌ Session token cookie not set during login")
                        return False
                else:
                    self.log_result("auth_email", False, "Invalid response format for login", data)
                    print(f"❌ Invalid login response format: {data}")
                    return False
            else:
                self.log_result("auth_email", False, f"Login failed: HTTP {response.status_code}: {response.text}")
                print(f"❌ Login failed: {response.status_code} - {response.text}")
                return False
            
            # 3. Call GET /api/auth/me using the session token from login
            print("\n--- Testing /auth/me with Session Token ---")
            
            response = self.session.get(f"{BACKEND_URL}/auth/me")
            
            if response.status_code == 200:
                user_data = response.json()
                if "email" in user_data and user_data["email"] == test_email:
                    self.log_result("auth_email", True, f"Successfully retrieved user data via /auth/me")
                    print(f"✅ /auth/me successful - Retrieved user: {user_data.get('displayName', 'N/A')}")
                else:
                    self.log_result("auth_email", False, "Invalid user data from /auth/me", user_data)
                    print(f"❌ Invalid user data from /auth/me: {user_data}")
                    return False
            else:
                self.log_result("auth_email", False, f"/auth/me failed: HTTP {response.status_code}: {response.text}")
                print(f"❌ /auth/me failed: {response.status_code} - {response.text}")
                return False
            
            # 4. Call POST /api/auth/logout and verify session is invalidated
            print("\n--- Testing Logout ---")
            
            response = self.session.post(f"{BACKEND_URL}/auth/logout")
            
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success":
                    self.log_result("auth_email", True, "Logout successful")
                    print(f"✅ Logout successful")
                    
                    # 5. Verify GET /api/auth/me should fail after logout
                    print("\n--- Verifying Session Invalidation ---")
                    response = self.session.get(f"{BACKEND_URL}/auth/me")
                    
                    if response.status_code == 401:
                        self.log_result("auth_email", True, "Session properly invalidated - /auth/me returns 401")
                        print(f"✅ Session properly invalidated - /auth/me returns 401")
                        return True
                    else:
                        self.log_result("auth_email", False, f"Session not properly invalidated - /auth/me returned {response.status_code}")
                        print(f"❌ Session not properly invalidated - /auth/me returned {response.status_code}")
                        return False
                else:
                    self.log_result("auth_email", False, "Invalid response format for logout", data)
                    print(f"❌ Invalid logout response format: {data}")
                    return False
            else:
                self.log_result("auth_email", False, f"Logout failed: HTTP {response.status_code}: {response.text}")
                print(f"❌ Logout failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_result("auth_email", False, f"Exception during email authentication: {str(e)}")
            print(f"❌ Email authentication error: {e}")
            return False

    def test_authentication(self):
        """Test legacy user authentication/registration"""
        print("\n=== Testing Legacy Authentication ===")
        
        try:
            # Test login/register with new user
            test_user = f"testuser_{uuid.uuid4().hex[:8]}"
            auth_data = {"displayName": test_user}
            
            response = self.session.post(f"{BACKEND_URL}/auth/login-legacy", json=auth_data)
            
            if response.status_code == 200:
                data = response.json()
                if "user" in data and "token" in data:
                    self.user_token = data["token"]
                    self.user_id = data["user"]["id"]
                    self.log_result("auth", True, f"Successfully authenticated user: {test_user}")
                    print(f"✅ Legacy authentication successful - User: {test_user}, Token: {self.user_token[:8]}...")
                    return True
                else:
                    self.log_result("auth", False, "Invalid response format", data)
                    print(f"❌ Invalid response format: {data}")
                    return False
            else:
                self.log_result("auth", False, f"HTTP {response.status_code}: {response.text}")
                print(f"❌ Legacy authentication failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_result("auth", False, f"Exception during authentication: {str(e)}")
            print(f"❌ Legacy authentication error: {e}")
            return False

    def test_listings_crud(self):
        """Test Listings CRUD operations"""
        print("\n=== Testing Listings CRUD ===")
        
        # Use email auth to get a user ID for listings test
        if not self.user_id:
            print("--- Setting up user for listings test ---")
            try:
                # Register/login with email auth to get user ID
                test_email = "listings_test@example.com"
                test_password = "password123"
                test_display_name = "Listings Test User"
                
                register_data = {
                    "email": test_email,
                    "password": test_password,
                    "displayName": test_display_name
                }
                
                # Try to register (might already exist)
                response = self.session.post(f"{BACKEND_URL}/auth/register-email", json=register_data)
                
                if response.status_code == 400 and "already registered" in response.text:
                    # User exists, login instead
                    login_data = {"email": test_email, "password": test_password}
                    response = self.session.post(f"{BACKEND_URL}/auth/login-email", json=login_data)
                
                if response.status_code == 200:
                    data = response.json()
                    if "user" in data:
                        self.user_id = data["user"]["id"]
                        print(f"✅ User setup successful for listings test: {self.user_id[:8]}...")
                    else:
                        self.log_result("listings_crud", False, "Failed to get user ID for listings test")
                        print("❌ Failed to get user ID for listings test")
                        return False
                else:
                    self.log_result("listings_crud", False, f"Failed to setup user for listings test: {response.status_code}")
                    print(f"❌ Failed to setup user for listings test: {response.status_code}")
                    return False
                    
            except Exception as e:
                self.log_result("listings_crud", False, f"Exception setting up user for listings test: {str(e)}")
                print(f"❌ Exception setting up user for listings test: {e}")
                return False

        try:
            # 1. Create WTS listing
            print("\n--- Creating WTS Listing ---")
            wts_listing = {
                "type": "WTS",
                "title": "Catan Board Game",
                "price": 100.0,
                "condition": 9.0,
                "description": "Excellent condition Catan game for sale",
                "sellerId": self.user_id,
                "status": "active"
            }
            
            response = self.session.post(f"{BACKEND_URL}/listings", json=[wts_listing])
            
            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    self.created_listing_id = data[0]["id"]
                    self.log_result("listings_crud", True, "WTS listing created successfully")
                    print(f"✅ WTS listing created: {self.created_listing_id}")
                else:
                    self.log_result("listings_crud", False, "Empty response when creating WTS listing")
                    print("❌ Empty response when creating WTS listing")
                    return False
            else:
                self.log_result("listings_crud", False, f"Failed to create WTS listing: {response.status_code} - {response.text}")
                print(f"❌ Failed to create WTS listing: {response.status_code} - {response.text}")
                return False

            # 2. Create WTB listing
            print("\n--- Creating WTB Listing ---")
            wtb_listing = {
                "type": "WTB",
                "title": "Ticket to Ride",
                "price": 80.0,
                "condition": 8.0,
                "description": "Looking for Ticket to Ride in good condition",
                "sellerId": self.user_id,
                "status": "active"
            }
            
            response = self.session.post(f"{BACKEND_URL}/listings", json=[wtb_listing])
            
            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    self.log_result("listings_crud", True, "WTB listing created successfully")
                    print(f"✅ WTB listing created: {data[0]['id']}")
                else:
                    self.log_result("listings_crud", False, "Empty response when creating WTB listing")
                    print("❌ Empty response when creating WTB listing")
                    return False
            else:
                self.log_result("listings_crud", False, f"Failed to create WTB listing: {response.status_code} - {response.text}")
                print(f"❌ Failed to create WTB listing: {response.status_code} - {response.text}")
                return False

            # 3. Get all listings
            print("\n--- Getting All Listings ---")
            response = self.session.get(f"{BACKEND_URL}/listings")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("listings_crud", True, f"Retrieved {len(data)} listings")
                    print(f"✅ Retrieved {len(data)} listings")
                else:
                    self.log_result("listings_crud", False, "Invalid response format for get listings")
                    print("❌ Invalid response format for get listings")
                    return False
            else:
                self.log_result("listings_crud", False, f"Failed to get listings: {response.status_code} - {response.text}")
                print(f"❌ Failed to get listings: {response.status_code} - {response.text}")
                return False

            # 4. Update listing
            if self.created_listing_id:
                print("\n--- Updating Listing ---")
                update_data = {
                    "price": 90.0,
                    "description": "Updated description - price reduced!"
                }
                
                response = self.session.put(f"{BACKEND_URL}/listings/{self.created_listing_id}", json=update_data)
                
                if response.status_code == 200:
                    data = response.json()
                    if data and data.get("price") == 90.0:
                        self.log_result("listings_crud", True, "Listing updated successfully")
                        print(f"✅ Listing updated successfully")
                    else:
                        self.log_result("listings_crud", False, "Listing update did not reflect changes")
                        print("❌ Listing update did not reflect changes")
                        return False
                else:
                    self.log_result("listings_crud", False, f"Failed to update listing: {response.status_code} - {response.text}")
                    print(f"❌ Failed to update listing: {response.status_code} - {response.text}")
                    return False

            # 5. Delete listing
            if self.created_listing_id:
                print("\n--- Deleting Listing ---")
                response = self.session.delete(f"{BACKEND_URL}/listings/{self.created_listing_id}")
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("status") == "success":
                        self.log_result("listings_crud", True, "Listing deleted successfully")
                        print(f"✅ Listing deleted successfully")
                    else:
                        self.log_result("listings_crud", False, "Unexpected response format for delete")
                        print("❌ Unexpected response format for delete")
                        return False
                else:
                    self.log_result("listings_crud", False, f"Failed to delete listing: {response.status_code} - {response.text}")
                    print(f"❌ Failed to delete listing: {response.status_code} - {response.text}")
                    return False

            return True

        except Exception as e:
            self.log_result("listings_crud", False, f"Exception during listings CRUD: {str(e)}")
            print(f"❌ Listings CRUD error: {e}")
            return False

    def test_bgg_search(self):
        """Test BGG Search functionality"""
        print("\n=== Testing BGG Search ===")
        
        try:
            # Search for "Catan"
            response = self.session.get(f"{BACKEND_URL}/bgg/search", params={"q": "Catan"})
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    if len(data) > 0:
                        # Check if results have expected structure
                        first_result = data[0]
                        if "id" in first_result and "title" in first_result:
                            self.log_result("bgg_search", True, f"BGG search returned {len(data)} results for 'Catan'")
                            print(f"✅ BGG search successful - Found {len(data)} results")
                            print(f"   First result: {first_result.get('title', 'N/A')}")
                            return True
                        else:
                            self.log_result("bgg_search", False, "BGG search results missing required fields")
                            print("❌ BGG search results missing required fields")
                            return False
                    else:
                        self.log_result("bgg_search", True, "BGG search returned empty results (may be valid)")
                        print("⚠️ BGG search returned no results (may be due to BGG blocking)")
                        return True
                else:
                    self.log_result("bgg_search", False, "BGG search returned invalid format")
                    print("❌ BGG search returned invalid format")
                    return False
            else:
                self.log_result("bgg_search", False, f"BGG search failed: {response.status_code} - {response.text}")
                print(f"❌ BGG search failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_result("bgg_search", False, f"Exception during BGG search: {str(e)}")
            print(f"❌ BGG search error: {e}")
            return False

    def test_profile_update_and_listings_enrichment(self):
        """Test Profile Update API and Listings Enrichment functionality"""
        print("\n=== Testing Profile Update & Listings Enrichment ===")
        
        try:
            # Setup: Create a test user and login
            test_email = "profile_test@example.com"
            test_password = "password123"
            test_display_name = "Profile Test User"
            
            print("\n--- Setting up test user ---")
            register_data = {
                "email": test_email,
                "password": test_password,
                "displayName": test_display_name
            }
            
            # Clear any existing session
            self.session.cookies.clear()
            
            # Try to register (might already exist)
            response = self.session.post(f"{BACKEND_URL}/auth/register-email", json=register_data)
            
            if response.status_code == 400 and "already registered" in response.text:
                # User exists, login instead
                login_data = {"email": test_email, "password": test_password}
                response = self.session.post(f"{BACKEND_URL}/auth/login-email", json=login_data)
            
            if response.status_code != 200:
                self.log_result("profile_update", False, f"Failed to setup user: {response.status_code} - {response.text}")
                print(f"❌ Failed to setup user: {response.status_code} - {response.text}")
                return False
                
            user_data = response.json().get("user", {})
            user_id = user_data.get("id")
            
            if not user_id:
                self.log_result("profile_update", False, "Failed to get user ID from login response")
                print("❌ Failed to get user ID from login response")
                return False
                
            print(f"✅ Test user setup successful: {user_id[:8]}...")
            
            # Step 1: Update user profile via PUT /api/auth/profile with phone and facebookLink
            print("\n--- Testing Profile Update ---")
            
            test_phone = "+60123456789"
            test_facebook_link = "https://facebook.com/testuser123"
            
            profile_update = {
                "phone": test_phone,
                "facebookLink": test_facebook_link
            }
            
            response = self.session.put(f"{BACKEND_URL}/auth/profile", json=profile_update)
            
            if response.status_code == 200:
                updated_user = response.json()
                if updated_user.get("phone") == test_phone and updated_user.get("facebookLink") == test_facebook_link:
                    self.log_result("profile_update", True, "Profile updated successfully with phone and facebookLink")
                    print(f"✅ Profile updated successfully")
                    print(f"   Phone: {updated_user.get('phone')}")
                    print(f"   Facebook: {updated_user.get('facebookLink')}")
                else:
                    self.log_result("profile_update", False, "Profile update response missing expected fields", updated_user)
                    print(f"❌ Profile update response missing expected fields: {updated_user}")
                    return False
            else:
                self.log_result("profile_update", False, f"Profile update failed: {response.status_code} - {response.text}")
                print(f"❌ Profile update failed: {response.status_code} - {response.text}")
                return False
            
            # Step 2: Verify user data is updated via GET /api/auth/me
            print("\n--- Verifying Profile Update via /auth/me ---")
            
            response = self.session.get(f"{BACKEND_URL}/auth/me")
            
            if response.status_code == 200:
                current_user = response.json()
                if (current_user.get("phone") == test_phone and 
                    current_user.get("facebookLink") == test_facebook_link and
                    current_user.get("id") == user_id):
                    self.log_result("profile_update", True, "Profile data verified via /auth/me")
                    print(f"✅ Profile data verified via /auth/me")
                    print(f"   User ID: {current_user.get('id', 'N/A')[:8]}...")
                    print(f"   Phone: {current_user.get('phone', 'N/A')}")
                    print(f"   Facebook: {current_user.get('facebookLink', 'N/A')}")
                else:
                    self.log_result("profile_update", False, "Profile data not properly updated in /auth/me", current_user)
                    print(f"❌ Profile data not properly updated in /auth/me")
                    print(f"   Expected phone: {test_phone}, got: {current_user.get('phone')}")
                    print(f"   Expected facebook: {test_facebook_link}, got: {current_user.get('facebookLink')}")
                    return False
            else:
                self.log_result("profile_update", False, f"/auth/me failed after profile update: {response.status_code} - {response.text}")
                print(f"❌ /auth/me failed after profile update: {response.status_code} - {response.text}")
                return False
            
            # Step 3: Create a listing owned by this user
            print("\n--- Creating listing for enrichment test ---")
            
            test_listing = {
                "type": "WTS",
                "title": "Monopoly Board Game",
                "price": 75.0,
                "condition": 8.5,
                "description": "Classic Monopoly game in great condition",
                "sellerId": user_id,
                "status": "active"
            }
            
            response = self.session.post(f"{BACKEND_URL}/listings", json=[test_listing])
            
            if response.status_code == 200:
                created_listings = response.json()
                if created_listings and len(created_listings) > 0:
                    listing_id = created_listings[0]["id"]
                    self.log_result("listings_enrichment", True, "Test listing created successfully")
                    print(f"✅ Test listing created: {listing_id}")
                else:
                    self.log_result("listings_enrichment", False, "Failed to create test listing - empty response")
                    print("❌ Failed to create test listing - empty response")
                    return False
            else:
                self.log_result("listings_enrichment", False, f"Failed to create test listing: {response.status_code} - {response.text}")
                print(f"❌ Failed to create test listing: {response.status_code} - {response.text}")
                return False
            
            # Step 4: Get listings and verify 'sellerPhone' and 'sellerFb' are present
            print("\n--- Testing Listings Enrichment ---")
            
            response = self.session.get(f"{BACKEND_URL}/listings")
            
            if response.status_code == 200:
                all_listings = response.json()
                
                # Find our user's listing
                user_listings = [l for l in all_listings if l.get("sellerId") == user_id]
                
                if user_listings:
                    user_listing = user_listings[0]  # Get the first listing by our user
                    
                    # Check if sellerPhone and sellerFb are present and correct
                    seller_phone = user_listing.get("sellerPhone")
                    seller_fb = user_listing.get("sellerFb")
                    
                    if seller_phone == test_phone and seller_fb == test_facebook_link:
                        self.log_result("listings_enrichment", True, "Listings enrichment working correctly - sellerPhone and sellerFb present")
                        print(f"✅ Listings enrichment working correctly")
                        print(f"   Listing ID: {user_listing.get('id', 'N/A')}")
                        print(f"   Seller Phone: {seller_phone}")
                        print(f"   Seller Facebook: {seller_fb}")
                        print(f"   Seller Name: {user_listing.get('sellerName', 'N/A')}")
                        
                        # Also check if other seller fields are present
                        if user_listing.get("sellerName"):
                            self.log_result("listings_enrichment", True, "Seller name also enriched in listings")
                            print(f"✅ Seller name also enriched: {user_listing.get('sellerName')}")
                        
                        return True
                    else:
                        self.log_result("listings_enrichment", False, f"Listings enrichment failed - expected phone: {test_phone}, got: {seller_phone}; expected fb: {test_facebook_link}, got: {seller_fb}")
                        print(f"❌ Listings enrichment failed")
                        print(f"   Expected phone: {test_phone}, got: {seller_phone}")
                        print(f"   Expected facebook: {test_facebook_link}, got: {seller_fb}")
                        print(f"   Full listing data: {user_listing}")
                        return False
                else:
                    self.log_result("listings_enrichment", False, f"No listings found for user {user_id}")
                    print(f"❌ No listings found for user {user_id}")
                    print(f"   Total listings retrieved: {len(all_listings)}")
                    return False
            else:
                self.log_result("listings_enrichment", False, f"Failed to get listings for enrichment test: {response.status_code} - {response.text}")
                print(f"❌ Failed to get listings for enrichment test: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_result("profile_update", False, f"Exception during profile update and listings enrichment test: {str(e)}")
            self.log_result("listings_enrichment", False, f"Exception during profile update and listings enrichment test: {str(e)}")
            print(f"❌ Profile update and listings enrichment test error: {e}")
            return False

    def test_ai_parse(self):
        """Test AI Text Parsing functionality"""
        print("\n=== Testing AI Text Parsing ===")
        
        try:
            # Test with sample text
            parse_data = {
                "text": "Selling Catan for RM100 condition 9",
                "type": "WTS"
            }
            
            response = self.session.post(f"{BACKEND_URL}/ai/parse-text", json=parse_data)
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("ai_parse", True, f"AI text parsing successful - returned {len(data)} items")
                    print(f"✅ AI text parsing successful - Found {len(data)} items")
                    if data:
                        print(f"   Parsed item: {data[0]}")
                    return True
                else:
                    self.log_result("ai_parse", False, "AI text parsing returned invalid format")
                    print("❌ AI text parsing returned invalid format")
                    return False
            else:
                self.log_result("ai_parse", False, f"AI text parsing failed: {response.status_code} - {response.text}")
                print(f"❌ AI text parsing failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_result("ai_parse", False, f"Exception during AI text parsing: {str(e)}")
            print(f"❌ AI text parsing error: {e}")
            return False

    def run_all_tests(self):
        """Run all backend tests"""
        print(f"🚀 Starting Backend API Tests")
        print(f"Backend URL: {BACKEND_URL}")
        
        # Run tests in sequence
        auth_success = self.test_authentication()
        auth_email_success = self.test_email_authentication()
        profile_success = self.test_profile_update_and_listings_enrichment()
        listings_success = self.test_listings_crud()
        bgg_success = self.test_bgg_search()
        ai_success = self.test_ai_parse()
        
        # Print summary
        print("\n" + "="*50)
        print("TEST SUMMARY")
        print("="*50)
        
        for category, result in self.test_results.items():
            status_icon = "✅" if result["status"] == "passed" else "❌" if result["status"] == "failed" else "⏳"
            print(f"{status_icon} {category.upper()}: {result['status']}")
            
            # Show failed details
            if result["status"] == "failed":
                for detail in result["details"]:
                    if not detail["success"]:
                        print(f"   - {detail['message']}")
        
        overall_success = all([auth_success, auth_email_success, listings_success, bgg_success, ai_success])
        print(f"\n🎯 Overall Result: {'PASSED' if overall_success else 'FAILED'}")
        
        return self.test_results

if __name__ == "__main__":
    tester = BackendTester()
    results = tester.run_all_tests()
    
    # Exit with appropriate code
    failed_tests = [k for k, v in results.items() if v["status"] == "failed"]
    if failed_tests:
        print(f"\n❌ Failed tests: {', '.join(failed_tests)}")
        sys.exit(1)
    else:
        print(f"\n✅ All tests passed!")
        sys.exit(0)