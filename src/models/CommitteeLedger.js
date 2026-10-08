const mongoose = require('mongoose');
const committeeLedgerSchema = new mongoose.Schema({
  adminId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shopId:             { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  committeeName:      { type: String, required: true, trim: true },
  totalAmount:        { type: Number, required: true },
  numberOfMembers:    { type: Number, required: true },
  headName:           { type: String, required: true, trim: true },
  myComitteeNameNumber: { type: Number, default: 0 }, // matches frontend field name exactly
  members: [{ name: { type: String, required: true } }],
  monthlyRecords: [{
    monthNumber: { type: Number, required: true },
    status:      { type: String, enum: ['pending', 'Paid'], default: 'pending' },
    amountPaid:  { type: Number, default: 0 },
  }],
  status: { type: String, enum: ['Not Paid', 'Paid', 'Partially Paid'], default: 'Not Paid' },
}, { timestamps: true });
module.exports = mongoose.model('CommitteeLedger', committeeLedgerSchema);
