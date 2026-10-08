# Changes — Branch Admin self-service branches + Billing/Sale/Purchase staff roles

**Nothing existing was removed or modified in a breaking way.** Every change below is
either a new file, or an additive field/line in an existing file. All existing routes,
models, and flows (Super Admin → Sales Agent → Admin approval, Admin's own branches,
Admin's own inventory/sales/finance, Shop Owners, the original Branch Admin dashboard)
continue to work exactly as before.

## New roles
`src/constants/roles.js` — added `BILLING`, `SALE`, `PURCHASE` (existing roles untouched).

## New flow this enables
```
ADMIN
  └─ creates → BRANCH_ADMIN (multiple, each fully isolated from one another)
        └─ creates → BRANCHES (multiple, owned only by that Branch Admin)
        └─ creates → BILLING / SALE / PURCHASE staff (assigned to one of their branches)
              └─ each logs in independently via the existing /api/auth/login,
                 sees only their own branch's data
```

## Schema changes (all additive, all default to null/optional)
- `src/models/Branch.js` — added `branchAdminId` (who owns the branch). Existing `adminId`
  is untouched and still required, so every branch created by the old Admin-only flow keeps
  working unchanged.
- `src/models/User.js` — added `branchAdminId` (which Branch Admin created this staff user)
  + matching index. Existing fields untouched.
- `src/models/Invoice.js`, `src/models/SaleInvoice.js`, `src/models/Purchase.js` — added
  optional `branchId`. Existing required fields (`adminId`, etc.) untouched, so Admin's
  existing records and existing CRUD routes are unaffected.

## New files (nothing existing touched)
- `src/utils/branchScopedCrudFactory.js` — a *separate* CRUD factory used only by the new
  Billing/Sale/Purchase routes. Does not modify `src/utils/crudFactory.js` (still used
  as-is by all existing Admin routes).
- `src/modules/admin/branchAdmins/*` — new endpoints so Admin can create a Branch Admin
  that is **not** pre-tied to one branch (so the Branch Admin can create their own branches
  afterward). The original `POST /api/admin/branches/:id/admins` flow (Branch Admin tied to
  one branch up front) is left exactly as it was.
- `src/modules/branchAdmin/branches/*` — Branch Admin's own branch CRUD, isolated by
  `branchAdminId`.
- `src/modules/branchAdmin/staff/*` — Branch Admin's Billing/Sale/Purchase staff CRUD,
  isolated by `branchAdminId`, and validated so staff can only be assigned to branches that
  belong to that specific Branch Admin.
- `src/modules/billing/*`, `src/modules/sale/*`, `src/modules/purchase/*` — separate
  dashboards + branch-scoped CRUD for each new staff role.

## Files with additive edits only (existing lines untouched, only new lines added)
- `src/modules/admin/admin.routes.js` — added 1 require + 1 `router.use('/branch-admins', ...)`.
- `src/modules/branchAdmin/branchAdmin.routes.js` — added 2 requires + 2 `router.use(...)`
  lines; the existing `/dashboard` and `/shop-owners` routes are unchanged.
- `src/app.js` — added 3 requires + 3 `app.use(...)` lines for `/api/billing`, `/api/sale`,
  `/api/purchase`; every existing line is unchanged.

## New API surface

### Admin (existing `/api/admin` auth — unchanged)
- `POST   /api/admin/branch-admins` — create an independent Branch Admin
- `GET    /api/admin/branch-admins` — list all Branch Admins (independent + legacy)
- `PATCH  /api/admin/branch-admins/:id/status` — activate/deactivate

### Branch Admin (existing `/api/branch-admin` auth — unchanged)
- `POST   /api/branch-admin/branches` — create a branch
- `GET    /api/branch-admin/branches` / `:id` / `PUT :id` / `DELETE :id`
- `POST   /api/branch-admin/staff` — create Billing/Sale/Purchase staff
  body: `{ role: 'BILLING'|'SALE'|'PURCHASE', branchId, name, email, phone, password }`
- `GET    /api/branch-admin/staff` `?branchId=&role=&page=&limit=`
- `GET/PUT /api/branch-admin/staff/:id`
- `PATCH  /api/branch-admin/staff/:id/status` — activate/deactivate
- `DELETE /api/branch-admin/staff/:id`

### Staff logins (each logs in via the existing `POST /api/auth/login`)
- `GET /api/billing/dashboard`, `POST/GET/PUT/DELETE /api/billing/invoices[/:id]`
- `GET /api/sale/dashboard`, `POST/GET/PUT/DELETE /api/sale/invoices[/:id]`
- `GET /api/purchase/dashboard`, `POST/GET/PUT/DELETE /api/purchase/items[/:id]`

## Verified
- Every file passes `node --check` (syntax valid).
- The full `src/app.js` was required end-to-end with dependencies installed — it boots
  with zero errors and all routers (old and new) register successfully.

## What you still need to decide / do before going live
1. **Mongo migration**: no migration script is required (new fields default to `null`),
   but if you want existing Admin-created branches/data to optionally be "claimed" by a
   future Branch Admin, that's a manual decision, not something this change makes for you.
2. **Frontend**: new login screens/dashboards for Branch Admin, Billing, Sale, Purchase
   need to be built against the routes above.
3. **Offboarding rule**: if a Branch Admin is removed, decide whether their branches/staff
   get reassigned to another Branch Admin or pulled back to Admin directly — not yet
   implemented, flagged for a future change.
