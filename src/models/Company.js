const mongoose = require('mongoose');

// Brand / manufacturer catalog (e.g. "Samsung", "Apple", "Xiaomi").
// Ported from Okiee-Backend's CompanySchema.Company — tenant-wide reference
// data shared across every branch, same scoping convention as the rest of
// the app (adminId = tenantAdminId(req), so a Branch Admin sees/edits the
// same catalog their parent Admin manages).
const companySchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

companySchema.index({ adminId: 1, name: 1 }, { unique: true });

// Normalize casing/whitespace so "Samsung" and "samsung " can't both exist
// for the same admin (mirrors Okiee-Backend's normalizedName behaviour).
companySchema.pre('save', function (next) {
  if (this.isModified('name')) this.name = this.name.trim();
  next();
});

module.exports = mongoose.model('Company', companySchema);

