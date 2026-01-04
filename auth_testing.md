# Auth-Gated App Testing Playbook

## Step 1: Create Test User & Session
```bash
mongosh --eval "
use('app_db');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

## Step 2: Test Backend API
```bash
# Test auth endpoint
curl -X GET "http://localhost:8001/api/auth/me" \
  -H "Cookie: session_token=YOUR_SESSION_TOKEN"

# Test protected endpoints (if any)
```

## Step 3: Browser Testing
1. Open Browser
2. Set Cookie: `session_token`
3. Reload page
