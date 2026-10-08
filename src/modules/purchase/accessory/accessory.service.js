const ApiError = require('../../../utils/ApiError');
const Accessory = require('../../../models/Accessory');
const StockMovement = require('../../../models/StockMovement');
const { deductPurchasePayment, applySupplierCredit } = require('../shared/payment.helper');
const { tenantAdminId } = require('../shared/tenantAdminId');
const { resolveBranchId } = require('../../../utils/branchContext');

// Purchases one or more accessories (stock IN), optionally paying for them
// from a bank account / pocket cash, or taking supplier credit for the
// unpaid portion — same payment pattern as singlePurchase/bulkPurchase.
//
// body: {
//   accessories: [{ accessoryName, quantity, perPiecePrice, picture? }],
//   shopId?,
//   paymentType: 'full-payment' | 'credit'   (default 'full-payment')
//   partyName?,                              (supplier — required for 'credit')
//   payableAmountNow?, payableAmountLater?,  (required for 'credit', must sum to totalAmount)
//   bankAccountUsed?, accountCash?, pocketCash?,
// }
const purchaseAccessories = async (req) => {
  const branchId = await resolveBranchId(req);
  if (!branchId) {
    throw new ApiError(403, 'Your account has no branch assigned. Contact your Branch Admin.');
  }

  const {
    accessories,
    shopId = null,
    paymentType = 'full-payment',
    partyName,
    payableAmountNow = 0,
    payableAmountLater = 0,
    bankAccountUsed,
    accountCash = 0,
    pocketCash = 0,
  } = req.body;

  if (!Array.isArray(accessories) || accessories.length === 0) {
    throw new ApiError(400, 'accessories array is required.');
  }
  for (const acc of accessories) {
    if (!acc.accessoryName || !acc.quantity || !acc.perPiecePrice) {
      throw new ApiError(400, 'Each accessory needs accessoryName, quantity and perPiecePrice.');
    }
    if (Number(acc.quantity) <= 0 || Number(acc.perPiecePrice) <= 0) {
      throw new ApiError(400, 'quantity and perPiecePrice must be positive numbers.');
    }
  }

  const totalAmount = accessories.reduce((sum, a) => sum + Number(a.quantity) * Number(a.perPiecePrice), 0);
  const summary = accessories.map((a) => a.accessoryName).join(', ');
  const adminId = tenantAdminId(req);

  if (paymentType === 'credit') {
    if (Number(payableAmountNow) + Number(payableAmountLater) !== totalAmount) {
      throw new ApiError(400, 'payableAmountNow + payableAmountLater must equal the total accessory cost.');
    }
  }

  // Move money first — bail before touching stock if funds are insufficient.
  await deductPurchasePayment({
    adminId,
    bankAccountUsed,
    accountCash,
    pocketCash,
    reason: `Purchase of accessories: ${summary}`,
  });

  if (paymentType === 'credit' && Number(payableAmountLater) > 0) {
    await applySupplierCredit({
      adminId,
      shopId,
      partyName,
      amount: payableAmountLater,
      description: `Credit purchase of accessories: ${summary}`,
    });
  }

  const result = [];
  for (const acc of accessories) {
    const qty = Number(acc.quantity);
    const price = Number(acc.perPiecePrice);

    // Restock an existing accessory with the same name in this branch/shop
    // instead of creating a duplicate row.
    let existing = await Accessory.findOne({
      adminId,
      branchId,
      shopId: shopId || null,
      accessoryName: new RegExp(`^${acc.accessoryName.trim()}$`, 'i'),
    });

    if (existing) {
      existing.quantity += qty;
      existing.stock += qty;
      existing.perPiecePrice = price; // latest purchase price
      existing.totalPrice = existing.quantity * price;
      if (acc.picture) existing.picture = acc.picture;
      await existing.save();
      result.push(existing);
    } else {
      const created = await Accessory.create({
        adminId,
        branchId,
        shopId: shopId || null,
        accessoryName: acc.accessoryName.trim(),
        quantity: qty,
        perPiecePrice: price,
        totalPrice: qty * price,
        stock: qty,
        picture: acc.picture,
      });
      result.push(created);
    }

    await StockMovement.create({
      adminId,
      shopId: shopId || null,
      itemType: 'accessory',
      itemId: result[result.length - 1]._id,
      itemName: acc.accessoryName.trim(),
      movementType: 'in',
      quantity: qty,
      reason: 'Purchase',
    });
  }

  return { accessories: result, totalAmount };
};

// Adds more stock to a single existing accessory (simple restock, no new row).
const restockAccessory = async (req) => {
  const branchId = await resolveBranchId(req);
  const adminId = tenantAdminId(req);
  const accessory = await Accessory.findOne({ _id: req.params.id, adminId, branchId });
  if (!accessory) throw new ApiError(404, 'Accessory not found or you do not have access to it.');

  const { quantity, perPiecePrice, bankAccountUsed, accountCash = 0, pocketCash = 0 } = req.body;
  const qty = Number(quantity);
  if (!qty || qty <= 0) throw new ApiError(400, 'quantity must be a positive number.');
  const price = perPiecePrice !== undefined ? Number(perPiecePrice) : accessory.perPiecePrice;

  await deductPurchasePayment({
    adminId,
    bankAccountUsed,
    accountCash,
    pocketCash,
    reason: `Restock of ${accessory.accessoryName}`,
  });

  accessory.quantity += qty;
  accessory.stock += qty;
  accessory.perPiecePrice = price;
  accessory.totalPrice = accessory.quantity * price;
  await accessory.save();

  await StockMovement.create({
    adminId,
    shopId: accessory.shopId,
    itemType: 'accessory',
    itemId: accessory._id,
    itemName: accessory.accessoryName,
    movementType: 'in',
    quantity: qty,
    reason: 'Restock',
  });

  return accessory;
};

const listAccessories = async (req) => {
  const branchId = await resolveBranchId(req);
  if (!branchId) return [];

  const { accessoryName, shopId, page, limit } = req.query;
  const filter = { adminId: tenantAdminId(req), branchId };
  if (accessoryName) filter.accessoryName = new RegExp(accessoryName, 'i');
  if (shopId) filter.shopId = shopId;

  let query = Accessory.find(filter).sort('-createdAt');
  if (page && limit) {
    query = query.skip((Number(page) - 1) * Number(limit)).limit(Number(limit));
  }
  return query;
};

const getAccessoryById = async (req) => {
  const branchId = await resolveBranchId(req);
  const accessory = await Accessory.findOne({ _id: req.params.id, adminId: tenantAdminId(req), branchId });
  if (!accessory) throw new ApiError(404, 'Accessory not found or you do not have access to it.');
  return accessory;
};

const updateAccessory = async (req) => {
  const branchId = await resolveBranchId(req);
  const accessory = await Accessory.findOne({ _id: req.params.id, adminId: tenantAdminId(req), branchId });
  if (!accessory) throw new ApiError(404, 'Accessory not found or you do not have access to it.');

  // Stock/quantity are only ever changed through purchase, restock, or a
  // sale — never a raw edit, so history (StockMovement) stays trustworthy.
  const editableFields = ['accessoryName', 'picture'];
  editableFields.forEach((field) => {
    if (req.body[field] !== undefined) accessory[field] = req.body[field];
  });

  await accessory.save();
  return accessory;
};

const deleteAccessory = async (req) => {
  const branchId = await resolveBranchId(req);
  const adminId = tenantAdminId(req);
  const accessory = await Accessory.findOne({ _id: req.params.id, adminId, branchId });
  if (!accessory) throw new ApiError(404, 'Accessory not found or you do not have access to it.');

  if (accessory.stock !== accessory.quantity) {
    throw new ApiError(
      400,
      'Cannot delete an accessory that has already had stock sold or moved. Reduce/return it instead.'
    );
  }

  await Accessory.findByIdAndDelete(accessory._id);
  return accessory;
};

module.exports = {
  purchaseAccessories,
  restockAccessory,
  listAccessories,
  getAccessoryById,
  updateAccessory,
  deleteAccessory,
};
