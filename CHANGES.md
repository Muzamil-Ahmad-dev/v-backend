# Changes — Professional Authentication Responses & Counter-Offer Flow

## Files Modified

### 1. `src/constants/status.js`
- Added `COUNTER_OFFER` status — used when the Super Admin sends a final counter-offer price to the admin instead of hard-rejecting.

### 2. `src/models/User.js`
- Added three new fields to the User schema:
  - `counterOfferPrice` (Number) — the final price the Super Admin is willing to approve
  - `counterOfferMessage` (String) — optional explanation / note from the Super Admin
  - `counterOfferSentAt` (Date) — timestamp when the counter-offer was sent
- Added `COUNTER_OFFER` to the `approvalStatus` enum.

### 3. `src/modules/auth/auth.service.js` (login function)
- Admin login now **populates the sales agent** (name + phone) for every blocking status.
- Each non-active status now throws a **rich, structured error** with:
  - `title` — short human label shown as the banner heading
  - `message` — professional multi-line explanation
  - `accountStatus` — raw enum value for frontend conditionals
  - `salesAgent` — `{ name, phone }` object (if the admin has a referral agent)
  - Status-specific metadata (prices, reasons, rounds)
- New status handled: `COUNTER_OFFER` — shows the requested price, the Super Admin's final approved price, and the Super Admin's message, and instructs the admin to contact their sales agent.

### 4. `src/modules/superadmin/superadmin.service.js`
- Added `sendCounterOffer(id, approverId, { counterOfferPrice, counterOfferMessage })`:
  - Sets `status = COUNTER_OFFER`, stores the price and message, timestamps it.
  - Creates an in-app notification for the admin.
  - Creates an in-app notification for the sales agent so they can follow up.
  - Writes an audit log entry (`COUNTER_OFFER_SENT`).
  - Allowed on statuses: `NEGOTIATION_SUBMITTED`, `PRICE_REJECTED`, `COUNTER_OFFER` (re-send).
- Updated `getAdminStatusMessage` to:
  - Populate the sales agent and include their name/phone in every message.
  - Handle `COUNTER_OFFER` and `PENDING_NEGOTIATION` with the new message formats.
  - Surface `rejectionReason` and sales agent contact in `REJECTED` messages.

### 5. `src/modules/salesAgent/salesAgent.service.js`
- Updated `getMyStatusMessage` to match the same rich message formats as above:
  - Sales agent info included in every relevant status.
  - `COUNTER_OFFER` status handled with full pricing details.
  - `PENDING_NEGOTIATION` → "Pricing Negotiation in Progress"
  - `NEGOTIATION_SUBMITTED` → "Awaiting Final Approval"
  - `REJECTED` → "Account Approval Declined" with reason and agent contact.

### 6. `src/modules/superadmin/superadmin.controller.js`
- Added `sendCounterOffer` controller handler.

### 7. `src/modules/superadmin/superadmin.routes.js`
- Added: `PATCH /api/superadmin/registrations/:id/counter-offer`
  - Body: `{ counterOfferPrice: Number, counterOfferMessage?: String }`
  - Protected: Super Admin only.

---

## New API Endpoint

```
PATCH /api/superadmin/registrations/:id/counter-offer
Authorization: Bearer <superadmin_token>
Content-Type: application/json

{
  "counterOfferPrice": 99,
  "counterOfferMessage": "The requested price cannot be approved. The minimum available price for your account is $99/month."
}
```

**Response:** 200 OK — returns the updated registration record.

**Effect:** The admin sees a "Pricing Update" banner on their next login attempt with the requested price, final approved price, and the Super Admin's message. The sales agent also receives an in-app notification.

---

## Login Response Structure (non-active admin)

All blocking statuses now return HTTP 403 with this shape:

```json
{
  "statusCode": 403,
  "message": "...(multi-line professional message)...",
  "data": {
    "accountStatus": "COUNTER_OFFER",
    "title": "Pricing Update",
    "requestedPrice": 150,
    "counterOfferPrice": 99,
    "counterOfferMessage": "The minimum available price is $99/month.",
    "salesAgent": {
      "name": "Ahmed Khan",
      "phone": "+92-300-1234567"
    }
  }
}
```
