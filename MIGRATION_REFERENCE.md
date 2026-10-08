# Migration Reference: Okiee-Backend → Final-Backend

This document maps legacy code to the new modular structure.

## File Location Mapping

### Controllers → Modules

#### Auth & Users
| Old Location | New Location | Module |
|---|---|---|
| `controllers/passwordController.js` | `modules/auth/` | auth |
| `controllers/adminController.js` | `modules/admin/admin.controller.js` | admin |

#### Company & Shop Management
| Old Location | New Location | Module |
|---|---|---|
| `controllers/CompanyController.js` | `modules/branchAdmin/company.controller.js` | branchAdmin |
| `controllers/shopController.js` | `modules/shopOwner/shop.controller.js` | shopOwner |
| `controllers/ShopLedgerControllers.js` | `modules/frontendApi/shopLedger.controller.js` | frontendApi |

#### Ledger & Accounting
| Old Location | New Location | Module |
|---|---|---|
| `controllers/ledgerController.js` | `modules/frontendApi/ledger.controller.js` | frontendApi |
| `controllers/partyLedgerControllers.js` | `modules/frontendApi/partyLedger.controller.js` | frontendApi |
| `controllers/committeeLedgerController.js` | `modules/frontendApi/committee.controller.js` | frontendApi |
| `controllers/balanceSheetController.js` | `modules/admin/balanceSheet.controller.js` | admin |
| `controllers/dayBookController.js` | `modules/frontendApi/dayBook.controller.js` | frontendApi |

#### Banking & Cash
| Old Location | New Location | Module |
|---|---|---|
| `controllers/bankController.js` | `modules/frontendApi/bank.controller.js` | frontendApi |
| `controllers/pocketCashController.js` | `modules/frontendApi/pocketCash.controller.js` | frontendApi |

#### Inventory & Stock
| Old Location | New Location | Module |
|---|---|---|
| `controllers/addPhoneController.js` | `modules/purchase/phone.controller.js` | purchase |
| `controllers/purchasePhoneController.js` | `modules/purchase/purchase.controller.js` | purchase |
| `controllers/accessoryController.js` | `modules/purchase/accessory.controller.js` | purchase |

#### Sales & Invoices
| Old Location | New Location | Module |
|---|---|---|
| `controllers/saleInvoiceController.js` | `modules/sale/invoice.controller.js` | sale |
| `controllers/InvoiceController.js` | `modules/frontendApi/invoice.controller.js` | frontendApi |

#### Operations
| Old Location | New Location | Module |
|---|---|---|
| `controllers/repairJobController.js` | `modules/repair/repair.controller.js` | repair |
| `controllers/expenseController.js` | `modules/frontendApi/expense.controller.js` | frontendApi |
| `controllers/cloudinaryController.js` | `modules/upload/upload.controller.js` | upload |

#### Additional
| Old Location | New Location | Module |
|---|---|---|
| `controllers/payablesAndReceiveablesController.js` | `modules/frontendApi/payables.controller.js` | frontendApi |
| `controllers/bankRoute.js` | `modules/frontendApi/bank.routes.js` | frontendApi |

---

### Routes → Modules

#### Route Files Mapping
| Old Route | New Route | Handler |
|---|---|---|
| `routes/LoginRoute.js` | `modules/auth/auth.routes.js` | POST /api/auth/login |
| `routes/ShopRoute.js` | `modules/shopOwner/shop.routes.js` | /api/shop/* |
| `routes/CompanyRoutes.js` | `modules/branchAdmin/company.routes.js` | /api/branch-admin/company/* |
| `routes/LedgerRoutes.js` | `modules/frontendApi/ledger.routes.js` | /api/ledger/* |
| `routes/PartyLedgerRoute.js` | `modules/frontendApi/partyLedger.routes.js` | /api/partyLedger/* |
| `routes/CommitteeLedger.js` | `modules/frontendApi/committee.routes.js` | /api/committee/* |
| `routes/BankRoutes.js` | `modules/frontendApi/banks.routes.js` | /api/banks/* |
| `routes/PocketCashRoute.js` | `modules/frontendApi/pocketCash.routes.js` | /api/pocketCash/* |
| `routes/DayBookRoute.js` | `modules/frontendApi/dayBook.routes.js` | /api/dayBook/* |
| `routes/balanceSheetRoutes.js` | `modules/admin/balanceSheet.routes.js` | /api/admin/balanceSheet/* |
| `routes/InvoiceRoute.js` | `modules/frontendApi/invoice.routes.js` | /api/invoice/* |
| `routes/saleInvoiceRoute.js` | `modules/sale/invoice.routes.js` | /api/sale/invoice/* |
| `routes/expenseRoute.js` | `modules/frontendApi/expense.routes.js` | /api/expense/* |
| `routes/accessoryRoute.js` | `modules/purchase/accessory.routes.js` | /api/purchase/accessory/* |
| `routes/AddMobilePhoneRoute.js` | `modules/purchase/phone.routes.js` | /api/purchase/phone/* |
| `routes/purchasePhoneRoute.js` | `modules/purchase/purchase.routes.js` | /api/purchase/* |
| `routes/repairJobRoute.js` | `modules/repair/repair.routes.js` | /api/repair/* |
| `routes/passwordRoute.js` | `modules/auth/password.routes.js` | /api/auth/password/* |
| `routes/ShopLedgerRoute.js` | `modules/frontendApi/shopLedger.routes.js` | /api/shop/ledger/* |
| `routes/payablesAndReceiveablesRoutes.js` | `modules/frontendApi/payables.routes.js` | /api/payables/* |

---

### Services → Modules

#### Service Files Mapping
| Old Service | New Service | Module |
|---|---|---|
| `services/authServices.js` | `modules/auth/auth.service.js` | auth |
| `services/passwordService.js` | `modules/auth/password.service.js` | auth |
| `services/invoiceGenerator.js` | `modules/sale/invoiceGenerator.service.js` | sale |

---

## Code Refactoring Examples

### Example 1: Using Auth Service

**OLD CODE:**
```js
// Old okiee-backend structure
const authService = require('../services/authServices');
const result = await authService.login(email, password);
```

**NEW CODE:**
```js
// New modular structure
const authService = require('../modules/auth/auth.service');
const result = await authService.login(email, password);
```

### Example 2: Importing Model

**OLD CODE:**
```js
const User = require('../schema/User');
```

**NEW CODE:**
```js
const User = require('../models/User');
```

### Example 3: Using Middleware

**OLD CODE:**
```js
const upload = require('../middleware/upload');
```

**NEW CODE:**
```js
const { uploadSingle } = require('../middlewares/upload.middleware');
```

### Example 4: Route Registration

**OLD CODE (app.js):**
```js
app.use('/shop', require('./routes/ShopRoute'));
app.use('/company', require('./routes/CompanyRoutes'));
```

**NEW CODE (app.js):**
```js
app.use('/api/shop', protect, shopRoutesFE);
app.use('/api/branch-admin', branchAdminRoutes);
```

---

## Module Structure Template

Each module follows this pattern:

```
modules/modulename/
├── modulename.controller.js      # Request handlers
├── modulename.routes.js          # Express routes
├── modulename.service.js         # Business logic
├── modulename.schema.js          # Data validation (if needed)
├── modulename.model.js           # Mongoose model (if needed)
└── README.md                      # Module documentation
```

### Controller Template
```js
// modules/example/example.controller.js
const ExampleService = require('./example.service');

exports.getAll = async (req, res, next) => {
  try {
    const data = await ExampleService.getAll(req.user._id);
    res.status(200).json({ 
      status: 'success', 
      data 
    });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const data = await ExampleService.getById(req.params.id, req.user._id);
    res.status(200).json({ 
      status: 'success', 
      data 
    });
  } catch (error) {
    next(error);
  }
};
```

### Service Template
```js
// modules/example/example.service.js
const ExampleModel = require('../../models/Example');

class ExampleService {
  static async getAll(userId) {
    return await ExampleModel.find({ createdBy: userId });
  }

  static async getById(id, userId) {
    return await ExampleModel.findOne({ _id: id, createdBy: userId });
  }

  static async create(data, userId) {
    return await ExampleModel.create({ ...data, createdBy: userId });
  }

  static async update(id, data, userId) {
    return await ExampleModel.findOneAndUpdate(
      { _id: id, createdBy: userId },
      data,
      { new: true }
    );
  }

  static async delete(id, userId) {
    return await ExampleModel.findOneAndDelete({ _id: id, createdBy: userId });
  }
}

module.exports = ExampleService;
```

### Routes Template
```js
// modules/example/example.routes.js
const express = require('express');
const { protect } = require('../../middlewares/auth.middleware');
const controller = require('./example.controller');

const router = express.Router();

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

module.exports = router;
```

---

## API Endpoint Changes

### Namespace Changes

**Old endpoints used various patterns:**
```
/shop/:id
/admin/users
/ledger/add
/bank/all
/api/sale-invoice
```

**New endpoints follow consistent REST pattern:**
```
/api/shop/:id
/api/admin/users
/api/ledger
/api/banks
/api/sale/invoice
```

### All endpoints now prefixed with `/api/`

---

## Database

No schema changes. All Mongoose models in `src/models/` remain the same.

### Models Available
- User
- Branch  
- Company
- Invoice
- Ledger
- PartyLedger
- ShopLedger
- BankAccount
- Expense
- ExpenseType
- Commission
- CommitteeLedger
- AuditLog
- Dispatch
- Accessory
- BulkPurchase
- BalanceSheet
- Notification
- DayBook
- And more...

---

## Legacy Code Location

All old code is preserved for reference:

```
backend/src/
├── legacy-controllers/    # Original .js files from /controllers
├── legacy-routes/         # Original .js files from /routes
└── legacy-services/       # Original .js files from /services
```

**These folders are for reference only. Do not modify or depend on them.**

---

## Middleware Changes

No functional changes, only location changes:

| Old | New |
|---|---|
| `middleware/upload.js` | `middlewares/upload.middleware.js` |
| `middleware/auth.js` | `middlewares/auth.middleware.js` |
| Custom middleware | `middlewares/error.middleware.js` |

---

## Import Path Changes

When updating your code, follow these patterns:

### Models
```js
// Old
const Model = require('../../schema/Model');

// New
const Model = require('../../models/Model');
```

### Config
```js
// Old
const db = require('../../config/db.js');

// New
const db = require('../../config/db');
```

### Constants
```js
// Old
const roles = require('../../constants/roles.json');

// New
const roles = require('../../constants/roles');
```

### Utilities
```js
// Old
const helper = require('../../utils/helper.js');

// New
const helper = require('../../utils/helper');
```

---

## Testing Migration

To verify your migration:

1. **Start server:**
   ```bash
   npm run dev
   ```

2. **Check health endpoint:**
   ```bash
   curl http://localhost:5000/health
   ```

3. **Test auth:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@okiee.com","password":"password"}'
   ```

4. **Test a module endpoint:**
   ```bash
   curl -H "Authorization: Bearer TOKEN" \
     http://localhost:5000/api/shop
   ```

---

## Common Issues & Solutions

### Issue: Cannot find module
```js
Error: Cannot find module '../routes/ShopRoute'
Solution: Use new path
require('../modules/shopOwner/shop.routes')
```

### Issue: Undefined service
```js
Error: Cannot read property 'login' of undefined
Solution: Ensure service is properly exported
module.exports = ServiceClass
```

### Issue: Route conflict
```js
Error: Cannot find route
Solution: Check app.js for route registration
app.use('/api/endpoint', protectMiddleware, routes)
```

---

## Need Help?

1. **Check module structure** - Review similar modules first
2. **Review examples** - Check existing controller/service/route files
3. **Check legacy folder** - Reference old code if needed
4. **Refer to INTEGRATION_GUIDE.md** - Overview of modules
5. **Check SETUP.md** - Environment and running information

---

## Summary

- ✅ All controllers moved to modules
- ✅ All routes integrated into modules
- ✅ All services organized in modules
- ✅ All models remain unchanged
- ✅ Legacy code preserved for reference
- ✅ New modular structure ready for development
- ✅ Backward compatible API endpoints
