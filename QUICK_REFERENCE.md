# ⚡ OKIEE Backend - Quick Reference Guide

## 📋 Table of Contents
- [Installation](#installation)
- [Commands](#commands)
- [API Quick Access](#api-quick-access)
- [Authentication](#authentication)
- [Module Structure](#module-structure)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)

---

## 🚀 Installation

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Start development server
npm run dev

# Seed database
npm run seed:superadmin
```

---

## 💻 Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (auto-reload) |
| `npm start` | Start production server |
| `npm run seed:superadmin` | Seed initial super admin |

---

## 🔑 Default Credentials

**Super Admin (after seeding):**
- Email: `superadmin@okiee.com`
- Password: `SuperAdmin@123`
- Role: `SUPER_ADMIN`
- Status: `ACTIVE`

---

## 📡 API Quick Access

### Base URL
```
http://localhost:5000/api
```

### Health Check
```bash
curl http://localhost:5000/health
# Response: { "status": "ok" }
```

### Authentication Endpoints
```bash
# Register
POST /auth/register
Body: { name, businessName, email, phone, password, selectedPlan }

# Login
POST /auth/login
Body: { email, password }
Response: { token, user }

# Verify Email
GET /auth/verify-email/:token

# Refresh Token
POST /auth/refresh-token
Header: Authorization: Bearer <token>

# My Profile
GET /auth/profile
Header: Authorization: Bearer <token>
```

### Admin Endpoints
```bash
# Dashboard
GET /admin/dashboard
Header: Authorization: Bearer <token>

# Get Users
GET /admin/users
Header: Authorization: Bearer <token>

# Create User
POST /admin/users
Body: { name, email, phone, password, role }
Header: Authorization: Bearer <token>
```

### Accounting Endpoints
```bash
# Ledger
GET /ledger
GET /ledger/:id

# Banks
GET /banks
POST /banks
Body: { bankName, accountNumber, balance }

# Pocket Cash
GET /pocketCash
POST /pocketCash
Body: { amount, description }

# Expenses
GET /expense
POST /expense
Body: { amount, category, description }

# Party Ledger
GET /partyLedger
GET /partyLedger/:id

# Invoices
GET /invoice
GET /invoice/:id
POST /invoice
Body: { invoiceData }
```

### Super Admin Endpoints
```bash
# Pending Approvals
GET /superadmin/registrations?status=PENDING_APPROVAL

# Approve Registration
PATCH /superadmin/registrations/:id/approve
Body: { finalPrice? }

# Reject Registration
PATCH /superadmin/registrations/:id/reject
Body: { rejectionReason? }

# View Analytics
GET /superadmin/analytics

# Create Sales Agent
POST /superadmin/sales-agents
Body: { name, email, phone, password }
```

---

## 🔐 Authentication

### Getting a Token

```bash
# 1. Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "superadmin@okiee.com",
    "password": "SuperAdmin@123"
  }'

# 2. Response includes token
# {
#   "status": "success",
#   "data": {
#     "token": "eyJhbGciOiJIUzI1NiIs...",
#     "user": { ... }
#   }
# }
```

### Using Token in Requests

```bash
# Store token in variable
TOKEN="your_jwt_token_here"

# Use in request header
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/admin/dashboard

# Or with Postman
# Header: Authorization
# Value: Bearer <token>
```

### Token Refresh

```bash
# When token expires
curl -X POST http://localhost:5000/api/auth/refresh-token \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🏗 Module Structure

### Module Pattern
Each module follows this structure:

```
modules/modulename/
├── modulename.controller.js    # Request handlers
├── modulename.routes.js        # Express routes
├── modulename.service.js       # Business logic
└── modulename.schema.js        # Validation (optional)
```

### Controller Template
```javascript
const Service = require('./modulename.service');

exports.getAll = async (req, res, next) => {
  try {
    const data = await Service.getAll(req.user._id);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};
```

### Service Template
```javascript
const Model = require('../../models/Model');

class Service {
  static async getAll(userId) {
    return await Model.find({ createdBy: userId });
  }
}
```

### Route Template
```javascript
const router = express.Router();
const { protect } = require('../../middlewares/auth.middleware');
const controller = require('./modulename.controller');

router.get('/', protect, controller.getAll);
```

---

## 📝 Common Tasks

### Create a New User (via API)

```bash
# As Super Admin
curl -X POST http://localhost:5000/api/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "03001234567",
    "password": "SecurePass123",
    "role": "ADMIN"
  }'
```

### Create a Sales Agent

```bash
# As Super Admin
curl -X POST http://localhost:5000/api/superadmin/sales-agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Sales Agent Name",
    "email": "agent@example.com",
    "phone": "03001234567",
    "password": "SecurePass123"
  }'
```

### Add Bank Account

```bash
curl -X POST http://localhost:5000/api/banks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "bankName": "Bank Name",
    "accountNumber": "12345678",
    "accountHolder": "Name",
    "balance": 50000
  }'
```

### Record Expense

```bash
curl -X POST http://localhost:5000/api/expense \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "amount": 5000,
    "category": "Office Supplies",
    "description": "Stationery purchase"
  }'
```

### Create Invoice

```bash
curl -X POST http://localhost:5000/api/invoice \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "invoiceNumber": "INV-001",
    "customer": "customer_id",
    "items": [
      {
        "description": "Product",
        "quantity": 1,
        "price": 10000
      }
    ],
    "total": 10000
  }'
```

### Upload Image

```bash
curl -X POST http://localhost:5000/api/upload/image \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@path/to/image.jpg"
```

---

## 📚 File Organization

```
Quick Reference:
├── /modules           → All feature modules
├── /models            → Database schemas
├── /middlewares       → Auth, error handling
├── /config            → Database, Cloudinary
├── /constants         → Roles, plans, status
├── /utils             → Helpers & utilities
├── /seed              → Database seeding
├── app.js             → Express setup
└── server.js          → Server entry
```

---

## 🆚 Response Format

### Success Response
```json
{
  "status": "success",
  "data": {
    "id": "123",
    "name": "Example"
  },
  "message": "Operation completed"
}
```

### Error Response
```json
{
  "status": "error",
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

---

## 🔒 Common Headers

```bash
# Standard headers for all requests
-H "Content-Type: application/json"
-H "Accept: application/json"

# For protected routes
-H "Authorization: Bearer <token>"
```

---

## 🌍 Environment Variables

**Essential (Required):**
```
MONGODB_URI=mongodb://...
JWT_SECRET=your_secret
CLOUDINARY_NAME=your_name
CLOUDINARY_API_KEY=key
CLOUDINARY_API_SECRET=secret
```

**Optional:**
```
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

See `.env.example` for all variables.

---

## 🧪 Testing Tools

### cURL
```bash
curl -X GET http://localhost:5000/api/endpoint \
  -H "Authorization: Bearer $TOKEN"
```

### Postman
1. Import collection
2. Set `base_url` variable
3. Set `token` variable
4. Start testing

### Thunder Client (VS Code)
1. Install extension
2. Import collection
3. Test endpoints

### REST Client Extension (VS Code)
```
### Get endpoint
GET http://localhost:5000/api/endpoint
Authorization: Bearer token
```

---

## ⚠️ Common Issues & Solutions

### Issue: Cannot connect to MongoDB
```
Solution:
1. Check MongoDB is running
2. Verify MONGODB_URI in .env
3. Check network if using MongoDB Atlas
```

### Issue: JWT token invalid
```
Solution:
1. Check token format: "Bearer <token>"
2. Verify JWT_SECRET in .env
3. Token may be expired - refresh it
```

### Issue: 401 Unauthorized
```
Solution:
1. Check Authorization header is present
2. Verify token is valid
3. Login again if needed
```

### Issue: 403 Forbidden
```
Solution:
1. Check user role has permission
2. Verify user status is ACTIVE
3. Check resource ownership
```

### Issue: Cloudinary upload fails
```
Solution:
1. Verify Cloudinary credentials
2. Check file format
3. Verify file size
```

---

## 📖 Documentation Map

| Need | File |
|------|------|
| Overview | README.md |
| Setup & Config | SETUP.md |
| Full API Docs | INTEGRATION_GUIDE.md |
| Legacy Code Mapping | MIGRATION_REFERENCE.md |
| Quick Facts | PROJECT_SUMMARY.txt |
| This Guide | QUICK_REFERENCE.md |

---

## 🎯 Workflow Examples

### User Registration to Approval

```
1. User registers via POST /api/auth/register
2. Super Admin reviews: GET /api/superadmin/registrations
3. Super Admin approves: PATCH /api/superadmin/registrations/:id/approve
4. Verification email sent to FIXED_VERIFICATION_EMAIL
5. Admin clicks verification link
6. Account activated (status=ACTIVE)
7. Can now login
```

### Create and Manage Invoice

```
1. Create: POST /api/invoice with items and total
2. Read: GET /api/invoice/:id
3. Update: PUT /api/invoice/:id with new data
4. List: GET /api/invoice
5. Delete: DELETE /api/invoice/:id
```

### Track Commission

```
1. Sales Agent referral activates
2. Commission auto-created (pending)
3. Super Admin reviews: GET /api/superadmin/commissions
4. Super Admin marks paid: PATCH /api/superadmin/commissions/:id
5. Commission status=PAID with paidAt timestamp
```

---

## 🔗 Useful Links

- MongoDB Docs: https://docs.mongodb.com
- Express.js: https://expressjs.com
- JWT: https://jwt.io
- Cloudinary: https://cloudinary.com/documentation
- Mongoose: https://mongoosejs.com

---

## ✅ Pre-Deployment Checklist

- [ ] .env properly configured
- [ ] MongoDB connection working
- [ ] Cloudinary credentials valid
- [ ] SMTP settings correct
- [ ] JWT_SECRET is strong
- [ ] Database seeded
- [ ] API endpoints tested
- [ ] Authentication flow working
- [ ] CORS configured correctly
- [ ] Error handling working
- [ ] Logging configured
- [ ] Security headers enabled

---

## 🆘 Need Help?

1. **Quick Questions** → Check this file
2. **Setup Issues** → See SETUP.md
3. **API Questions** → See INTEGRATION_GUIDE.md
4. **Code Patterns** → See MIGRATION_REFERENCE.md
5. **Project Overview** → See README.md

---

## 💡 Pro Tips

- Save JWT token in shell variable: `TOKEN=$(curl ... | jq -r '.data.token')`
- Use Postman to organize and test all endpoints
- Keep .env file in .gitignore (security)
- Test locally before deploying
- Monitor logs for errors
- Use proper error messages in responses
- Implement rate limiting in production
- Keep dependencies updated

---

**Version**: 1.0.0 | **Status**: ✅ Production Ready  
For detailed information, refer to the comprehensive documentation files.
