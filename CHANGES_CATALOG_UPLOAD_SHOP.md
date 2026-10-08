# Changes — Company/Model Catalog, Image Upload, Full Shop Management

Ported the remaining Okiee-Backend features that had no equivalent yet, and
exposed all three to Branch Admin as well as Admin.

## 1. Company / Phone Model catalog (NEW)
Ported from Okiee-Backend's `CompanySchema` (`Company` + `Model`).

- `src/models/Company.js` — brand catalog (e.g. "Samsung"), scoped by `adminId`.
- `src/models/PhoneModel.js` — model catalog (e.g. "Galaxy S24") under a `companyId`.
  Named `PhoneModel` (not `Model`) to avoid clashing with Mongoose's own `Model`.
- `src/modules/admin/catalog/` — `company.*` and `model.*` (service/controller/routes),
  built on the existing `crudFactory` so they follow the exact same pattern as
  every other admin CRUD module.
- Mounted at:
  - `POST/GET/PUT/DELETE /api/admin/catalog/companies[/:id]`
  - `POST/GET/PUT/DELETE /api/admin/catalog/models[/:id]` (`?companyId=` to filter)
  - Same two, mirrored under `/api/branch-admin/catalog/...` — a Branch Admin
    manages the exact same tenant-wide catalog as their parent Admin
    (`tenantAdminId()` resolves `parentAdminId` → the Admin's `_id`).

## 2. Image upload — Cloudinary (NEW)
Ported from Okiee-Backend's `cloudinaryController` + its inline multer setup
in `purchasePhoneRoute.js`. Previously the new backend had **no** multer or
cloudinary dependency at all — nothing could upload an image.

- Added `cloudinary` and `multer` (v2, not the vulnerable v1.x line) to `package.json`.
- `src/config/cloudinary.js` — reads `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` /
  `CLOUDINARY_API_SECRET` from `.env` (placeholders added to `.env`).
- `src/middlewares/upload.middleware.js` — multer memory storage, 5MB limit,
  images only (same limits Okiee used).
- `src/modules/upload/` — generic `uploadImage` / `deleteImage` controller + routes.
  Generic (not IMEI-specific) so it can be reused for IMEI photos, accessory
  pictures, shop logos, etc. via a `folder`/`tag` field.
- Mounted at `POST /api/upload/image` (field name `image`) and
  `POST /api/upload/delete` (body `{ publicId }`), plus mirrored under
  `/api/branch-admin/upload/...`.

## 3. Full Shop management (was read-only before)
Ported from Okiee-Backend's `shopController` (`createShop`, `updateShop`,
`deleteShop`, `getShop`, `getAllShops`, `uploadLogo`, `deleteLogo`). The new
backend previously only had `GET /api/shop/getshop/:userId` — no create,
update, delete, or logo upload existed anywhere.

- `src/models/Shop.js` — added `logo`, `logoPublicId`, `addresses`, `contacts`,
  `termsCondition` fields (ported from Okiee's `ShopSchema`).
- `src/modules/frontendApi/shop.service.js` (NEW) + rewrote
  `shop.controller.js` / `shop.routes.js` for full CRUD + logo endpoints,
  scoped by `tenantAdminId()` same as everywhere else.
- `GET /api/shop/getshop/:userId` kept working exactly as before (backward compatible).
- New routes:
  - `POST/GET/PUT/DELETE /api/shop[/:id]`
  - `POST /api/shop/:id/logo` (multipart, field `logo`) / `DELETE /api/shop/:id/logo`
  - Mirrored under `/api/branch-admin/shop/...`.

## Verified
- `node -c` syntax check on every new/modified file.
- `npm install` — `cloudinary` + `multer@2.x` install cleanly, no vulnerabilities flagged.
- Full `require('./src/app.js')` dry-load (no DB connection needed) — loads
  with all new routes wired in, no missing-module or wiring errors.

## Still not ported (flag if you need these)
- Okiee's `adminController.getAllUsersExceptCurrent` / `sendEmail` — generic
  admin utility endpoints not obviously tied to sale/purchase/stock/repair;
  ask if you want these too.
