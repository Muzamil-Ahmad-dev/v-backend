const mongoose = require('mongoose');
const partyLedgerSchema = new mongoose.Schema({
  adminId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shopId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  partyName:    { type: String, required: true, trim: true },
  takingCredit: { type: Number, default: 0 },
  givingCredit: { type: Number, default: 0 },
  status:       { type: String, enum: ['Payable', 'Receivable', 'Settled'], default: 'Settled' },
  transactions: [{
    takingCredit: { type: Number, default: 0 },
    givingCredit: { type: Number, default: 0 },
    description:  { type: String, default: '' },
    date:         { type: Date, default: Date.now },
  }],
}, { timestamps: true });
module.exports = mongoose.model('PartyLedger', partyLedgerSchema);
