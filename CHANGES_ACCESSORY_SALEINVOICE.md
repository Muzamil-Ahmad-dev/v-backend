# Changes — Real Accessory Purchase & Sale Invoice workflow (Shop ↔ Accessory ↔ Sale linked)

Your backend already had the **models** for Shop, Accessory and SaleInvoice,
and it already had **generic CRUD** wired up for them under `/api/admin/...`
and plain branch-scoped CRUD under `/api/branch-admin/...` / `/api/sale/...`.

What it was missing — and what this change adds — is the actual **business
logic that links them together**, ported from Okiee-Backend's
`accessoryController.js` / `saleInvoiceController.js`, but rewritten to match
this codebase's clean module pattern (same style as `singlePurchase` /
`bulkPurchase`), not a literal copy-paste of the old monolith.

## 1. Accessory purchases now really move stock + money
New module: `src/modules/purchase/accessory/` (`accessory.service.js` +
`accessory.routes.js`), mounted at:
- `POST/GET/PUT/DELETE /api/purchase/accessories[/:id]`
- `PATCH /api/purchase/accessories/:id/restock`
- Reused as-is at `/api/branch-admin/purchase/accessories` **and**
  `/api/branch-admin/inventory/accessories` (Branch Admin gets full access,
  same as PURCHASE staff).

What it does that generic CRUD never could:
- `POST /` buys one or more accessories at once, computes the total cost,
  and either deducts it from a bank account / pocket cash
  (`deductPurchasePayment`) or takes supplier credit for the unpaid portion
  (`applySupplierCredit`, posted to `PartyLedger`) — same payment pattern
  `singlePurchase`/`bulkPurchase` already use.
- Buying the same accessory name again in the same branch/shop **restocks**
  the existing row instead of creating a duplicate.
- Every stock change writes a `StockMovement` record (`in`/`out`) so stock
  history is auditable.
- `PUT`/`DELETE` no longer let you silently overwrite `stock`/`quantity` —
  those only ever change via purchase, restock, or a sale. Delete is blocked
  if any stock has already moved.

## 2. Sale Invoice now really sells a phone + accessories together
New module: `src/modules/sale/saleInvoice/` (`saleInvoice.service.js` +
`saleInvoice.routes.js`), replacing the old plain CRUD mounted at
`/invoices` inside `sale.routes.js`. Reachable at:
- `POST/GET /api/sale/invoices[/:id]`
- `PATCH /api/sale/invoices/:id/return`
- Same routes under `/api/branch-admin/sale/invoices` (Branch Admin has full
  access, same as SALE staff).

`POST /api/sale/invoices` body:
```json
{
  "shopId": "…",
  "customerName": "Ali", "customerNumber": "0300...",
  "imei1": "3549...",          // optional — sells this phone
  "salePrice": 55000,          // required if imei1 given
  "accessories": [{ "accessoryId": "…", "quantity": 2, "price": 500 }],
  "sellingPaymentType": "Cash",   // Cash | Bank | Credit | Exchange | Full Payment
  "bankAccountUsed": "…", "accountCash": 55000, "pocketCash": 0,
  "payableAmountNow": 0, "payableAmountLater": 0   // only for Credit
}
```

What happens on create:
1. `imei1` is looked up in **both** single `Purchase` stock and `BulkPurchase`
   IMEI stock — whichever has it `Available`. Not found/not available → 404.
2. Each accessory line is stock-checked and decremented; if anything fails
   partway through, everything already decremented in this request is rolled
   back (no half-sold invoice).
3. Only after both succeed is the phone marked `Sold` (single) or its IMEI
   entry marked `Sold` + the parent `BulkPurchase.status` rolled up
   (`Available` / `Partially Sold` / `Sold`).
4. Profit is computed as `totalInvoice - (phone purchasePrice + accessory cost)`.
5. Payment is posted: cash/bank via `receivePayment` (money **in** — the
   mirror of the purchase-side `deductPurchasePayment`), or a customer credit
   via the new `applyCustomerCredit` (posts to `PartyLedger`, status
   `Receivable`).
6. `StockMovement` records are written for the phone and every accessory line.
7. Invoice number is auto-generated: `SI-000001`, `SI-000002`, …

`PATCH /:id/return` reverses all of it: restocks the phone (single or bulk),
restocks every accessory line, reverses any customer credit taken
(`reverseCustomerCredit`), and can optionally refund cash/bank back out.

## 3. New shared payment helpers (`src/modules/purchase/shared/payment.helper.js`)
Added the sale-side mirror of the existing purchase-side helpers:
- `receivePayment` — adds money into bank/pocket (mirror of `deductPurchasePayment`).
- `applyCustomerCredit` — posts a `givingCredit` entry to `PartyLedger` for a credit sale.
- `reverseCustomerCredit` — reverses it on a return.

## 4. Branch Admin access
Every route above already flows through the existing `PURCHASE`/`SALE`
routers, which `branchAdmin.routes.js` mounts at `/api/branch-admin/purchase`
and `/api/branch-admin/sale` — and `resolveBranchId()` already treats a
Branch Admin identically to branch staff (just requires `?branchId=` since a
Branch Admin can own more than one branch). So Branch Admin gets full,
correct access automatically; nothing extra had to be wired for that part —
it was the underlying business logic that was missing, not the routing.

## Verified
- `node -c` syntax check on every new/modified file.
- Full `require('./src/app.js')` dry-load — loads with all new routes wired
  in, no missing-module or wiring errors.
- `npm install` — no new dependencies needed (reuses existing models/helpers).

## Not in scope of this change (ask if you want these too)
- Old Okiee also had `getTotalSoldAccessories`, `getAccessoriesPersonRecord`,
  and a handful of reporting endpoints layered on top of the accessory
  ledger — these are read-only reports, not core linking logic, and weren't
  ported. Easy to add on top of `StockMovement`/`SaleInvoice` once you tell
  me which reports you actually need.
- Admin's own `/api/admin/inventory/accessories` and
  `/api/admin/sales/sale-invoices` are left as tenant-wide **overview** CRUD
  (same as `/api/admin/inventory/purchases` already was) — the real
  workflow lives in the branch-scoped modules above, same pattern as
  Purchase already followed.
