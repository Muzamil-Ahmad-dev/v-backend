# OKIEE Backend - Complete Platform

**Production-ready Node.js / Express / MongoDB backend** implementing the complete OKIEE platform with multi-level administration, role-based access control, comprehensive accounting, and business operations.

> **Version**: 1.0.0 (Final-Backend Integrated with All Okiee Modules)  
> **Status**: ✅ Ready for Production  
> **Architecture**: Modern Modular Structure

---

## 🎯 Quick Start

```bash
# Install
npm install

# Configure
cp .env.example .env    # Fill in real values

# Run
npm run dev             # Development with Nodemon

# Seed database
npm run seed:superadmin # Creates initial Super Admin
```

Health check: `curl http://localhost:5000/health` → `{ status: 'ok' }`

---

## 👥 Roles & Access Levels

| Role | Created By | Initial Status | Permissions |
|------|-----------|-----------------|-------------|
| `SUPER_ADMIN` | Seed script | `ACTIVE` | Platform-wide management, create admins/sales agents, approve registrations |
| `ADMIN` | Public registration or Super Admin | `PENDING_APPROVAL` → `ACTIVE` | Company/branch management, approve staff |
| `BRANCH_ADMIN` | Admin | `ACTIVE` | Branch supervision, staff oversight |
| `SHOP_OWNER` | Admin | `ACTIVE` | Shop management, daily operations |
| `SALES_AGENT` | Super Admin | `ACTIVE` + `referralCode` | Referrals, commissions, sales tracking |
| `BILLING_STAFF` | Branch Admin | `ACTIVE` | Billing operations, invoicing |
| `SALE_STAFF` | Branch Admin | `ACTIVE` | Sales operations, customer management |
| `PURCHASE_STAFF` | Branch Admin | `ACTIVE` | Purchase operations, inventory |

---

## 🔄 Registration & Approval Flow

```
Public Registration (User submits form)
        ↓
User created with status = PENDING_APPROVAL
        ↓
Super Admin reviews at /api/superadmin/registrations
        ↓
Super Admin approves or rejects
        ↓ (on Approval)
Verification email sent to FIXED_VERIFICATION_EMAIL (.env)
        ↓
Admin clicks verification link
        ↓
Account activated, status = ACTIVE, emailVerified = true
        ↓ (if referred by Sales Agent)
Commission record auto-created with default amount
```

---

## 📦 Comprehensive Modules

### Core Administration (15+ Modules)

| Module | Purpose | Routes |
|--------|---------|--------|
| **Auth** | Login, registration, password reset | `/api/auth/*` |
| **Super Admin** | Platform management, analytics | `/api/superadmin/*` |
| **Admin** | Company/region admin dashboard | `/api/admin/*` |
| **Branch Admin** | Branch management & staff | `/api/branch-admin/*` |
| **Sales Agent** | Referrals & commissions | `/api/sales-agent/*` |
| **Shop Owner** | Shop operations | `/api/shop-owner/*` |
| **Billing Staff** | Billing operations | `/api/billing/*` |
| **Sale Staff** | Sales operations | `/api/sale/*` |
| **Purchase Staff** | Purchase operations | `/api/purchase/*` |
| **Commission** | Commission calculations | (integrated in modules) |
| **Repair** | Repair job tracking | `/api/repair/*` |
| **Upload** | Image upload to Cloudinary | `/api/upload/*` |
| **Email** | Notifications & alerts | (integrated service) |

### Accounting & Ledger Suite

| Module | Purpose | Routes |
|--------|---------|--------|
| **Ledger** | Main ledger records | `/api/ledger/*` |
| **Party Ledger** | Customer/vendor tracking | `/api/partyLedger/*` |
| **Shop Ledger** | Shop-specific ledgers | `/api/shop/ledger/*` |
| **Bank Accounts** | Multi-bank management | `/api/banks/*` |
| **Pocket Cash** | Petty cash tracking | `/api/pocketCash/*` |
| **Expenses** | Expense categorization | `/api/expense/*` |
| **Committee Ledger** | Committee fund tracking | `/api/committee/*` |
| **Balance Sheet** | Financial reports | `/api/admin/balanceSheet/*` |
| **Day Book** | Daily transactions | `/api/dayBook/*` |
| **Invoices** | Invoice generation & tracking | `/api/invoice/*` |
| **Payables & Receivables** | AR/AP management | `/api/payables/*` |

---

## 🏗 Architecture

### Modular Structure

```
src/
├── modules/                          # 15+ feature modules
│   ├── admin/                        # Admin dashboard & operations
│   │   ├── admin.controller.js
│   │   ├── admin.routes.js
│   │   ├── admin.service.js
│   │   └── admin.schema.js
│   ├── auth/                         # Authentication
│   ├── billing/                      # Billing staff operations
│   ├── branchAdmin/                  # Branch admin dashboard
│   ├── commission/                   # Commission calculations
│   ├── email/                        # Email service
│   ├── frontendApi/                  # Ledger suite APIs
│   │   ├── banks.routes.js
│   │   ├── ledger.routes.js
│   │   ├── partyLedger.routes.js
│   │   ├── pocketCash.routes.js
│   │   ├── committee.routes.js
│   │   ├── expense.routes.js
│   │   ├── invoice.routes.js
│   │   └── ... (more ledger routes)
│   ├── purchase/                     # Purchase operations
│   ├── repair/                       # Repair management
│   ├── sale/                         # Sales operations
│   ├── salesAgent/                   # Sales agent dashboard
│   ├── shopOwner/                    # Shop owner dashboard
│   ├── superadmin/                   # Super admin operations
│   └── upload/                       # File uploads
├── models/                           # MongoDB schemas (40+ models)
├── middlewares/                      # Auth, error handling, upload
├── config/                           # Database, Cloudinary
├── constants/                        # Roles, status, plans, commissions
├── utils/                            # Helpers & utilities
├── seed/                             # Database seeding
├── legacy-controllers/               # Original Okiee controllers (reference)
├── legacy-routes/                    # Original Okiee routes (reference)
└── legacy-services/                  # Original Okiee services (reference)
```

### Data Flow

```
HTTP Request
    ↓
Route Handler (modules/x/x.routes.js)
    ↓
Controller (modules/x/x.controller.js)
    ↓
Service (modules/x/x.service.js)
    ↓
Model (src/models/X.js)
    ↓
MongoDB Database
```

---

## 🔌 Environment Setup

Create `.env`:

```env
# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/okiee

# JWT
JWT_SECRET=your_super_secret_key
JWT_EXPIRE=7d

# Cloudinary
CLOUDINARY_NAME=your_name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
FIXED_VERIFICATION_EMAIL=admin@okiee.com

# Server
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
BASE_URL=http://localhost:5000
FRONTEND_BASE_URL=http://localhost:3000
```

---

## 📡 API Routes Overview

### Authentication
```
POST   /api/auth/register           # User registration
POST   /api/auth/login              # User login
POST   /api/auth/logout             # User logout
GET    /api/auth/verify-email/:token# Email verification
POST   /api/auth/forgot-password    # Password reset
POST   /api/auth/refresh-token      # Refresh JWT
GET    /api/auth/profile            # User profile
```

### Admin & Super Admin
```
GET    /api/admin/dashboard         # Admin dashboard
GET    /api/superadmin/registrations# Pending approvals
PATCH  /api/superadmin/registrations/:id/approve
GET    /api/superadmin/analytics    # Platform analytics
POST   /api/superadmin/sales-agents # Create sales agent
```

### Branch Admin
```
GET    /api/branch-admin/dashboard  # Branch stats
GET    /api/branch-admin/staff      # List staff
POST   /api/branch-admin/staff      # Add staff member
```

### Accounting & Ledger
```
GET    /api/banks                   # List bank accounts
POST   /api/banks                   # Add bank account
GET    /api/ledger                  # Full ledger
GET    /api/partyLedger             # Party ledger
GET    /api/pocketCash              # Pocket cash records
GET    /api/expense                 # Expenses
GET    /api/committee               # Committee ledger
GET    /api/invoice                 # Invoices
PATCH  /api/invoice/:id             # Update invoice
```

### Business Operations
```
GET    /api/sale/invoice            # Sales invoices
GET    /api/purchase/phones         # Inventory
POST   /api/purchase/phones         # Add phones
GET    /api/purchase/accessories    # Accessories
GET    /api/repair                  # Repair jobs
```

### File Upload
```
POST   /api/upload/image            # Upload to Cloudinary
POST   /api/upload/delete           # Delete image
```

*See [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) for complete API documentation*

---

## 💰 Subscription Plans & Commissions

### Plans

| Plan | Price (PKR) | Duration |
|------|------------|----------|
| `YEARLY` | 24,000 | 1 year |
| `LIFETIME` | 65,000 | Lifetime |

### Default Commissions

| Plan | Commission (PKR) |
|------|-----------------|
| `YEARLY` | 3,000 |
| `LIFETIME` | 8,000 |

Auto-created when referred Admin's account activates. Super Admin can override.

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| [SETUP.md](./SETUP.md) | Complete setup & development guide |
| [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) | Full API documentation & module overview |
| [MIGRATION_REFERENCE.md](./MIGRATION_REFERENCE.md) | Legacy code mapping & migration guide |
| [README.md](./README.md) | This file |

---

## 🚀 Running the Backend

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start

# Seed Super Admin
npm run seed:superadmin
```

Server runs on `http://localhost:5000`

---

## 🧪 Testing

### With cURL

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@okiee.com","password":"SuperAdmin@123"}' \
  | jq -r '.data.token')

# Protected request
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/admin/dashboard
```

### With Postman

1. Import collection (provided)
2. Set `base_url` = `http://localhost:5000`
3. Set `token` from login response
4. Start testing

---

## 🛠 Tech Stack

- **Runtime**: Node.js 16+
- **Framework**: Express.js
- **Database**: MongoDB 4.4+ + Mongoose
- **Auth**: JWT (jsonwebtoken)
- **Password**: bcryptjs
- **Files**: Cloudinary
- **Email**: Nodemailer
- **Uploads**: Multer
- **Security**: Helmet
- **CORS**: cors
- **Logging**: Morgan
- **Dev**: Nodemon

---

## 📋 Project Structure

```
backend/
├── src/
│   ├── app.js                      # Express app
│   ├── server.js                   # Server entry
│   ├── config/                     # DB, Cloudinary config
│   ├── constants/                  # Roles, status, plans
│   ├── middlewares/                # Auth, error, upload
│   ├── models/                     # Mongoose schemas (40+)
│   ├── modules/                    # Feature modules (15+)
│   ├── seed/                       # Database seeding
│   ├── utils/                      # Utilities & helpers
│   └── legacy-*/                   # Original okiee code (ref only)
├── package.json
├── .env
├── README.md                       # This file
├── SETUP.md                        # Setup guide
├── INTEGRATION_GUIDE.md            # API docs
└── MIGRATION_REFERENCE.md          # Migration guide
```

---

## 🔐 Security Features

✅ Implemented:
- JWT token-based authentication
- Bcrypt password hashing
- CORS protection
- Helmet security headers
- Input validation
- MongoDB injection prevention
- Role-based access control
- Audit logging

---

## 📊 Database Models

40+ Mongoose models including:
- User, Branch, Company
- Invoice, Ledger, PartyLedger, ShopLedger
- BankAccount, Expense, Commission
- AuditLog, Notification
- And more...

---

## 🐛 Common Issues

### MongoDB Connection Error
```
Solution: Ensure MongoDB is running, check MONGODB_URI in .env
```

### JWT Token Expired
```
Solution: Use /api/auth/refresh-token or login again
```

### Cloudinary Upload Fails
```
Solution: Verify Cloudinary credentials in .env
```

See [SETUP.md](./SETUP.md#troubleshooting) for more troubleshooting.

---

## 📖 Next Steps

1. ✅ Install dependencies: `npm install`
2. ✅ Configure `.env` file
3. ✅ Start dev server: `npm run dev`
4. ✅ Seed database: `npm run seed:superadmin`
5. 📖 Read [SETUP.md](./SETUP.md) for detailed setup
6. 📖 Read [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) for API docs
7. 🚀 Start building!

---

## 🔗 Integration

All endpoints protected with JWT. Include token in header:

```bash
Authorization: Bearer <your_jwt_token>
```

Response format:
```json
{
  "status": "success",
  "data": { ... },
  "message": "Operation successful"
}
```

---

## 📄 License

**Proprietary** - OKIEE Platform  
Unauthorized use, copying, or distribution is prohibited.

---

## 🤝 Support

- 📖 [SETUP.md](./SETUP.md) - Installation & configuration
- 📖 [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - Complete API reference
- 📖 [MIGRATION_REFERENCE.md](./MIGRATION_REFERENCE.md) - Legacy code mapping

---

**Version 1.0.0** | Last Updated: July 2026  
Built with ❤️ for OKIEE Platform
