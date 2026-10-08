 const mongoose = require('mongoose');

// Each physical device inside a RAM/SIM group — tracked individually so
// stock (Available / Dispatched / Sold) can be reported per IMEI.
const imeiEntrySchema = new mongoose.Schema({
  imei1:         { type: String, required: true, trim: true },
  imei2:         { type: String, trim: true, default: '' },
  color:         { type: String, trim: true, default: '' },
  batteryHealth: { type: String, trim: true, default: '' },
  status:        { type: String, enum: ['Available', 'Dispatched', 'Sold'], default: 'Available' },
}, { _id: true });

const ramSimDetailSchema = new mongoose.Schema({
  ramMemory:     { type: String, trim: true, default: '' },
  simOption:     { type: String, trim: true, default: '' },
  priceOfOne:    { type: Number, default: 0 },
  imeiNumbers:   [imeiEntrySchema],
}, { _id: true });

const bulkPurchaseSchema = new mongoose.Schema({
  adminId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // NEW: branch scoping so a branch's PURCHASE staff only ever sees their own branch's bulk stock.
  branchId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  shopId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  partyLedgerId:{ type: mongoose.Schema.Types.ObjectId, ref: 'PartyLedger', required: true, index: true },

  companyName:  { type: String, trim: true, default: '' },
  modelName:    { type: String, trim: true, default: '' },
  date:         { type: Date, default: Date.now },

  buyingPrice:           { type: Number, default: 0 }, // total price of this bulk purchase
  totalPurchasedMobiles: { type: Number, default: 0 },
  purchasePaymentType:   { type: String, enum: ['credit', 'full-payment'], default: 'full-payment' },
  purchasePaymentStatus: { type: String, enum: ['pending', 'paid'], default: 'paid' },
  payableAmountLater:    { type: Number, default: 0 }, // remaining credit amount owed to the party
  totalPaidAmount:       { type: Number, default: 0 },

  // NEW: rollup stock status across all imeiNumbers — kept in sync by the purchase module
  // whenever an IMEI is dispatched/returned/sold.
  status: { type: String, enum: ['Available', 'Partially Sold', 'Sold'], default: 'Available' },

  ramSimDetails: [ramSimDetailSchema],
}, { timestamps: true });

bulkPurchaseSchema.index({ adminId: 1, branchId: 1 });

bulkPurchaseSchema.virtual('createdDate').get(function () {
  return this.date || this.createdAt;
});
bulkPurchaseSchema.set('toJSON', { virtuals: true });
bulkPurchaseSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('BulkPurchase', bulkPurchaseSchema);
