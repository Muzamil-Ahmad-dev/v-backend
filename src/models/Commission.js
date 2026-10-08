const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema(
  {
    salesAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    admin:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    planType:    { type: String, enum: ['YEARLY', 'LIFETIME'], required: true },
    commissionAmount: { type: Number, default: 0 },
    commissionStatus: { type: String, enum: ['PENDING', 'PAID'], default: 'PENDING' },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

commissionSchema.index({ salesAgent: 1, commissionStatus: 1 });

module.exports = mongoose.model('Commission', commissionSchema);
