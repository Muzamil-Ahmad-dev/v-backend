// models/PayableReceivable.js
const mongoose = require('mongoose');

const prTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['give', 'take'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: [0, 'Amount must be positive'],
  },
  description: {
    type: String,
    default: '',
  },
  balanceAmount: {
    type: Number,
    default: 0,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  bankAccountUsed: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankAccount',
    default: null,
  },
  accountCash: {
    type: Number,
    default: 0,
  },
  pocketCash: {
    type: Number,
    default: 0,
  },
  invoiceExist: {
    type: Boolean,
    default: false,
  },
  invoiceNumber: {
    type: String,
    default: '',
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    default: null,
  },
}, { timestamps: true });

const payableReceivableSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    default: null,
  },
  personId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Person',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  number: {
    type: String,
    trim: true,
  },
  reference: {
    type: String,
    trim: true,
    default: '',
  },
  favourite: {
    type: Boolean,
    default: false,
  },
  takingCredit: {
    type: Number,
    default: 0,
  },
  givingCredit: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['Payable', 'Receivable', 'Settled'],
    default: 'Settled',
  },
  transactions: [prTransactionSchema],
}, { timestamps: true });

module.exports = mongoose.model('PayableReceivable', payableReceivableSchema);