# OKIEE Backend - Setup Guide

## Quick Start

### 1. Prerequisites

- Node.js 16+ 
- MongoDB (local or Atlas)
- Cloudinary account
- SMTP email service (Gmail recommended)

### 2. Installation

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install
```

### 3. Environment Setup

Create `.env` file:

```env
# ============================================
# DATABASE
# ============================================
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/okiee?retryWrites=true&w=majority
# Local development:
# MONGODB_URI=mongodb://localhost:27017/okiee

# ============================================
# JWT
# ============================================
JWT_SECRET=your_super_secret_key_change_this_in_production
JWT_EXPIRE=7d

# ============================================
# CLOUDINARY (Image Storage)
# ============================================
CLOUDINARY_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# ============================================
# EMAIL (SMTP)
# ============================================
# Gmail Example:
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password_not_regular_password
SMTP_FROM=noreply@okiee.com

# Alternative (SendGrid):
# SMTP_HOST=smtp.sendgrid.net
# SMTP_PORT=587
# SMTP_USER=apikey
# SMTP_PASS=SG.xxxxxxxxxxxxxxxxxxxx

# ============================================
# SERVER
# ============================================
PORT=5000
NODE_ENV=development
# production|development|test

# ============================================
# CORS
# ============================================
CORS_ORIGIN=http://localhost:3000

# ============================================
# API BASE URL (for email links, etc)
# ============================================
API_BASE_URL=http://localhost:5000
FRONTEND_BASE_URL=http://localhost:3000
```

### 4. Database Setup

#### Option A: MongoDB Atlas (Recommended)

1. Create account at [mongodb.com/atlas](https://mongodb.com/atlas)
2. Create a cluster
3. Add IP to whitelist
4. Create database user
5. Copy connection string to `.env`

#### Option B: Local MongoDB

```bash
# macOS (using Homebrew)
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Windows
# Start MongoDB Community Edition from Services
```

### 5. Cloudinary Setup

1. Create account at [cloudinary.com](https://cloudinary.com)
2. Go to Dashboard
3. Copy:
   - Cloud Name
   - API Key
   - API Secret
4. Add to `.env`

### 6. Email Setup (Gmail)

1. Enable 2-Factor Authentication in Gmail
2. Generate App Password:
   - Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   - Select Mail → Windows Computer (or your device)
   - Copy the generated password
3. Add to `.env` as `SMTP_PASS`

### 7. Start Development Server

```bash
npm run dev
```

Server runs on `http://localhost:5000`

Health check: `GET http://localhost:5000/health`

Expected response:
```json
{
  "status": "ok"
}
```

### 8. Seed Database

```bash
npm run seed:superadmin
```

This creates a super admin user:
- Email: `superadmin@okiee.com`
- Password: `SuperAdmin@123`

## API Testing

### Using cURL

```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "superadmin@okiee.com",
    "password": "SuperAdmin@123"
  }'

# Response includes JWT token
# {
#   "status": "success",
#   "data": {
#     "token": "eyJhbGciOiJIUzI1NiIs..."
#   }
# }
```

### Using Postman

1. Import API collection (see `postman-collection.json`)
2. Set environment variables:
   - `base_url`: `http://localhost:5000`
   - `token`: (paste JWT from login response)

### Using Thunder Client (VS Code)

1. Install Thunder Client extension
2. Open Thunder Client → Collections
3. Import provided collection

## Project Structure Deep Dive

```
src/
├── app.js                    # Express app configuration
├── server.js                 # Node.js server entry
├── config/
│   ├── db.js                # MongoDB connection
│   └── cloudinary.js        # Cloudinary setup
├── constants/
│   ├── roles.js             # User roles
│   ├── status.js            # Entity statuses
│   ├── plans.js             # Subscription plans
│   └── defaultCommissions.js# Commission defaults
├── middlewares/
│   ├── auth.middleware.js   # JWT verification
│   ├── error.middleware.js  # Error handling
│   └── upload.middleware.js # Multer configuration
├── models/                  # Mongoose schemas
│   ├── User.js
│   ├── Branch.js
│   ├── Invoice.js
│   ├── Ledger.js
│   └── ... (40+ models)
├── modules/                 # Feature modules
│   ├── auth/
│   │   ├── auth.controller.js
│   │   ├── auth.routes.js
│   │   ├── auth.service.js
│   │   ├── auth.schema.js
│   │   └── auth.model.js (if needed)
│   ├── admin/
│   ├── branchAdmin/
│   ├── superadmin/
│   ├── frontendApi/
│   └── ... (15+ modules)
├── legacy-controllers/      # Original okiee controllers
├── legacy-routes/           # Original okiee routes
├── legacy-services/         # Original okiee services
├── seed/
│   └── seedSuperAdmin.js
└── utils/
    ├── errorHandler.js
    ├── validation.js
    └── helpers.js
```

## Module Development Guide

### Creating a New Module

1. Create module folder:
```bash
mkdir -p src/modules/mymodule
```

2. Create standard files:
```bash
touch src/modules/mymodule/mymodule.controller.js
touch src/modules/mymodule/mymodule.routes.js
touch src/modules/mymodule/mymodule.service.js
```

3. Structure template:

**mymodule.controller.js:**
```js
const MymoduleService = require('./mymodule.service');

exports.getAll = async (req, res, next) => {
  try {
    const data = await MymoduleService.getAll();
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};
```

**mymodule.routes.js:**
```js
const express = require('express');
const { protect } = require('../../middlewares/auth.middleware');
const controller = require('./mymodule.controller');

const router = express.Router();

router.get('/', protect, controller.getAll);

module.exports = router;
```

**mymodule.service.js:**
```js
const MyModel = require('../../models/MyModel');

class MymoduleService {
  static async getAll() {
    return await MyModel.find();
  }
}

module.exports = MymoduleService;
```

4. Register in `app.js`:
```js
const mymoduleRoutes = require('./modules/mymodule/mymodule.routes');
app.use('/api/mymodule', protect, mymoduleRoutes);
```

## Common Tasks

### Add a New User Role

1. Update `src/constants/roles.js`
2. Create corresponding module in `src/modules/`
3. Add routes to `src/app.js`

### Add a New Database Model

1. Create in `src/models/NewModel.js`
2. Import and use in service files

### Add Authentication to a Route

```js
const { protect } = require('../../middlewares/auth.middleware');
router.get('/protected', protect, controller.action);
```

### Handle File Upload

```js
const { uploadSingle } = require('../../middlewares/upload.middleware');
router.post('/upload', uploadSingle('image'), controller.upload);
```

## Debugging

### Enable Debug Logging

```bash
DEBUG=okiee:* npm run dev
```

### Check MongoDB Connection

```js
const db = require('./config/db');
db.connection.on('connected', () => console.log('Connected to MongoDB'));
```

### Test API Endpoints

```bash
# Health check
curl http://localhost:5000/health

# Get all routes
curl http://localhost:5000/api/routes

# Check user profile (requires token)
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/auth/profile
```

## Performance Tips

1. **Enable caching**: Add Redis for session/data caching
2. **Use pagination**: Limit results in list endpoints
3. **Index database**: Add indexes to frequently queried fields
4. **Compress responses**: Enable gzip in production
5. **Use CDN**: Serve static files via Cloudinary

## Security Checklist

- [ ] JWT_SECRET is strong and unique
- [ ] HTTPS enabled in production
- [ ] MongoDB connection uses SSL
- [ ] API rate limiting enabled
- [ ] CORS properly configured
- [ ] Sensitive data not logged
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (using MongoDB mitigates this)
- [ ] Password hashing (bcryptjs enabled)
- [ ] Audit logging enabled

## Troubleshooting

### Cannot connect to MongoDB
```
Error: connect ECONNREFUSED 127.0.0.1:27017

Solution: 
- Ensure MongoDB is running
- Check MONGODB_URI in .env
- Verify network access if using MongoDB Atlas
```

### JWT token expired
```
Error: jwt expired

Solution:
- Refresh token using /api/auth/refresh-token
- Update JWT_EXPIRE if needed
```

### Cloudinary image upload fails
```
Error: Invalid authentication credentials

Solution:
- Verify Cloudinary credentials in .env
- Check API key and secret
- Test with different image format
```

### Port already in use
```
Error: listen EADDRINUSE: address already in use :::5000

Solution:
- Change PORT in .env
- Or kill process: lsof -ti:5000 | xargs kill -9
```

## Next Steps

1. Complete `.env` configuration
2. Test API endpoints with Postman
3. Review the module structure
4. Start adding business logic to your modules
5. Connect with frontend (see FRONTEND_BASE_URL)

## Support Resources

- Express Docs: [expressjs.com](https://expressjs.com)
- Mongoose Docs: [mongoosejs.com](https://mongoosejs.com)
- MongoDB Docs: [docs.mongodb.com](https://docs.mongodb.com)
- JWT: [jwt.io](https://jwt.io)
- Cloudinary: [cloudinary.com/documentation](https://cloudinary.com/documentation)

## License

Proprietary - OKIEE Platform
