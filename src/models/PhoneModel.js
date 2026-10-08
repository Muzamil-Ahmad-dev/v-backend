const mongoose = require('mongoose');

// Phone model catalog (e.g. "Galaxy S24" under Company "Samsung").
// Ported from Okiee-Backend's CompanySchema.Model. Renamed to PhoneModel
// here purely to avoid clashing with Mongoose's own `Model` concept —
// the collection/API concept is identical to Okiee's "Model".
const phoneModelSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

phoneModelSchema.index({ adminId: 1, companyId: 1, name: 1 }, { unique: true });

phoneModelSchema.pre('save', function (next) {
  if (this.isModified('name')) this.name = this.name.trim();
  next();
});

module.exports = mongoose.model('PhoneModel', phoneModelSchema);
