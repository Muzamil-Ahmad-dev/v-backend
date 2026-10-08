# OKIEE Backend - Integration Guide

## Overview

This is the **final-backend-updated** with all modules from the **okiee-backend** integrated into a modern, scalable modular architecture.

### Project Structure

```
backend/
├── src/
│   ├── app.js                    # Express app setup
│   ├── server.js                 # Server entry point
│   ├── config/                   # Configuration (DB, Cloudinary)
│   ├── constants/                # Constants (roles, plans, status)
│   ├── middlewares/              # Auth, error handling, upload
│   ├── models/                   # Mongoose schemas
│   ├── migrations/               # Database migrations
│   ├── modules/                  # NEW: Feature-based modular structure
│   │   ├── admin/                # Admin dashboard & operations
│   │   ├── auth/                 # Authentication (login/signup)
│   │   ├── billing/              # Billing staff operations
│   │   ├── branchAdmin/          # Branch admin operations
│   │   ├── commission/           # Commission calculations
│   │   ├── email/                # Email service
│   │   ├── frontendApi/          # Ledger, banks, party operations
│   │   ├── purchase/             # Purchase staff operations
│   │   ├── repair/               # Repair operations
│   │   ├── sale/                 # Sale staff operations
│   │   ├── salesAgent/           # Sales agent operations
│   │   ├── shopOwner/            # Shop owner operations
│   │   ├── superadmin/           # Super admin operations
│   │   └── upload/               # Image upload service
│   ├── legacy-controllers/       # OLD: Okiee controllers (for reference)
│   ├── legacy-routes/            # OLD: Okiee routes (for reference)
│   ├── legacy-services/          # OLD: Okiee services (for reference)
│   ├── seed/                     # Database seeding scripts
│   └── utils/                    # Utility functions
├── package.json
└── .env
```

## Key Differences: Final-Backend vs Okiee-Backend

### ✅ Final-Backend Structure (CURRENT)
- **Modular by feature**: Each feature has its own folder with controllers, routes, services
- **Scalable**: Easy to add new modules
- **DRY**: Shared models, middlewares, utilities
- **Modern**: Organized by domain/feature

### ❌ Okiee-Backend Structure (LEGACY)
- Flat structure: `/controllers`, `/routes`, `/services` in root
- Harder to maintain as it grows
- Files listed in `legacy-*` folders for reference only

## Available Modules

### Core Modules

1. **Auth Module** (`modules/auth/`)
   - User registration and login
   - JWT token generation
   - Password reset

2. **Admin Module** (`modules/admin/`)
   - Admin dashboard
   - User management
   - Approval workflows

3. **Super Admin Module** (`modules/superadmin/`)
   - Platform-wide management
   - Role configuration
   - Commission settings

4. **Branch Admin Module** (`modules/branchAdmin/`)
   - Branch management
   - Staff supervision
   - Branch-level reports

### Role-Based Dashboards

5. **Shop Owner** (`modules/shopOwner/`)
6. **Sales Agent** (`modules/salesAgent/`)
7. **Billing Staff** (`modules/billing/`)
8. **Sale Staff** (`modules/sale/`)
9. **Purchase Staff** (`modules/purchase/`)

### Business Operations

10. **Ledger Suite** (`modules/frontendApi/`)
    - Banks management
    - Pocket cash tracking
    - Expense tracking
    - Party ledger
    - Committee ledger
    - Shop management

11. **Purchase Module** (`modules/purchase/`)
12. **Sale Module** (`modules/sale/`)
13. **Repair Module** (`modules/repair/`)
14. **Commission Module** (`modules/commission/`)

### Infrastructure

15. **Upload Module** (`modules/upload/`)
    - Image uploads to Cloudinary
    - File management

16. **Email Module** (`modules/email/`)
    - Email notifications
    - Alerts

## Database Models

All Mongoose models are in `src/models/`:

- User
- Branch
- Company
- Invoice
- Ledger
- PartyLedger
- ShopLedger
- BankAccount
- Expense
- Commission
- AuditLog
- And more...

## API Routes

### Authentication
```
POST   /api/auth/register         # User registration
POST   /api/auth/login            # User login
POST   /api/auth/logout           # User logout
POST   /api/auth/refresh-token    # Refresh JWT token
POST   /api/auth/forgot-password  # Password reset request
```

### Admin Operations
```
GET    /api/admin/dashboard       # Admin dashboard stats
GET    /api/admin/users           # List users
POST   /api/admin/users           # Create user
PUT    /api/admin/users/:id       # Update user
DELETE /api/admin/users/:id       # Delete user
```

### Branch Admin
```
GET    /api/branch-admin/dashboard
GET    /api/branch-admin/staff
POST   /api/branch-admin/staff
```

### Ledger Suite (Frontend API)
```
GET    /api/banks                 # List bank accounts
POST   /api/banks                 # Add bank account
GET    /api/pocketCash            # Pocket cash transactions
POST   /api/expense               # Record expenses
GET    /api/partyLedger           # Party ledger records
GET    /api/ledger                # Full ledger
```

### Upload
```
POST   /api/upload/image          # Upload image to Cloudinary
POST   /api/upload/delete         # Delete image
```

## Environment Variables

Create `.env` file in `backend/` directory:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/okiee

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRE=7d

# Cloudinary
CLOUDINARY_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Server
PORT=5000
NODE_ENV=development
```

## Running the Backend

### Install Dependencies
```bash
npm install
```

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Seed Database
```bash
npm run seed:superadmin
```

## API Response Format

All API responses follow this format:

### Success Response
```json
{
  "status": "success",
  "data": { ... },
  "message": "Operation completed successfully"
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

## Authentication

Most routes are protected with JWT. Include the token in the Authorization header:

```bash
Authorization: Bearer <your_jwt_token>
```

## Legacy Code Reference

All code from the original Okiee-Backend is preserved in:
- `src/legacy-controllers/` - Original controllers
- `src/legacy-routes/` - Original routes
- `src/legacy-services/` - Original services

These are for reference only. **New development should use the module structure.**

## Migration Path

If you have code using the old Okiee routes:

**OLD:**
```js
const route = require('./controllers/userController');
```

**NEW:**
```js
const route = require('./modules/auth/auth.controller');
```

## Testing

```bash
npm test
```

## Troubleshooting

### Connection Errors
- Ensure MongoDB is running
- Check `MONGODB_URI` in `.env`

### Authentication Errors
- Verify `JWT_SECRET` is set
- Check token hasn't expired

### Cloudinary Errors
- Verify Cloudinary credentials in `.env`
- Test with: `POST /api/upload/image`

## Support

For issues, check the relevant module's README or contact the development team.

## Version History

- **v1.0.0** (Current) - Merged final-backend with okiee-backend controllers
- **Previous** - Okiee-Backend (legacy)
