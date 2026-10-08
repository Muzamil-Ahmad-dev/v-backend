 const ApiError = require('../../../utils/ApiError');
const Purchase = require('../../../models/Purchase');
const Dispatch = require('../../../models/Dispatch');
const { deductPurchasePayment, applySupplierCredit } = require('../shared/payment.helper');
const { tenantAdminId } = require('../shared/tenantAdminId');
const { resolveBranchId } = require('../../../utils/branchContext');

const createSinglePurchase = async (req) => {
  const branchId = await resolveBranchId(req);
  if (!branchId) {
    throw new ApiError(403, 'Your account has no branch assigned. Contact your Branch Admin.');
  }

  const {
    name,
    companyName,
    modelName,
    imei1,
    imei2,
    ramMemory,
    color,
    phoneCondition,
    warranty,
    purchasePrice,
    demandPrice,
    finalPrice,
    date,
    paymentType = 'full-payment', // 'full-payment' | 'credit'
    partyName,
    payableAmountNow = 0,
    payableAmountLater = 0,
    bankAccountUsed,
    accountCash = 0,
    pocketCash = 0,
    shopId,
  } = req.body;

  if (!name || !companyName || !modelName || !imei1 || purchasePrice === undefined) {
    throw new ApiError(400, 'name, companyName, modelName, imei1 and purchasePrice are required.');
  }

  const duplicate = await Purchase.findOne({ adminId: tenantAdminId(req), imei1 });
  if (duplicate) {
    throw new ApiError(409, `A phone with IMEI ${imei1} already exists in purchase records.`);
  }

  if (paymentType === 'credit') {
    if (Number(payableAmountNow) + Number(payableAmountLater) !== Number(purchasePrice)) {
      throw new ApiError(400, 'payableAmountNow + payableAmountLater must equal purchasePrice for a credit purchase.');
    }
  }

  const summary = `${companyName} ${modelName} (IMEI: ${imei1})`;

  // Move money first — if funds are insufficient we bail before creating any records.
  await deductPurchasePayment({
    adminId: tenantAdminId(req),
    bankAccountUsed,
    accountCash,
    pocketCash,
    reason: `Purchase of ${summary}`,
  });

  if (paymentType === 'credit' && Number(payableAmountLater) > 0) {
    await applySupplierCredit({
      adminId: tenantAdminId(req),
      shopId: shopId || null,
      partyName,
      amount: payableAmountLater,
      description: `Credit purchase of ${summary}`,
    });
  }

  const purchase = await Purchase.create({
    adminId: tenantAdminId(req),
    branchId: branchId,
    shopId: shopId || null,
    name,
    companyName,
    modelName,
    imei1,
    imei2,
    ramMemory,
    color,
    phoneCondition,
    warranty,
    purchasePrice,
    demandPrice,
    finalPrice,
    date,
    status: 'Available',
  });

  return purchase;
};

const listSinglePurchase = async (req) => {
  const branchId = await resolveBranchId(req);
  if (!branchId) return [];

  const { status, companyName, modelName, imei, dateFrom, dateTo, page, limit } = req.query;
  const filter = { adminId: tenantAdminId(req), branchId: branchId };

  if (status) filter.status = status;
  if (companyName) filter.companyName = new RegExp(companyName, 'i');
  if (modelName) filter.modelName = new RegExp(modelName, 'i');
  if (imei) filter.$or = [{ imei1: imei }, { imei2: imei }];
  if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) filter.date.$gte = new Date(dateFrom);
    if (dateTo) filter.date.$lte = new Date(dateTo);
  }

  let query = Purchase.find(filter).sort('-createdAt');
  if (page && limit) {
    query = query.skip((Number(page) - 1) * Number(limit)).limit(Number(limit));
  }
  return query;
};

const getSinglePurchaseById = async (req) => {
  const branchId = await resolveBranchId(req);
  const purchase = await Purchase.findOne({
    _id: req.params.id,
    adminId: tenantAdminId(req),
    branchId: branchId,
  });
  if (!purchase) throw new ApiError(404, 'Purchase phone not found or you do not have access to it.');
  return purchase;
};

const updateSinglePurchase = async (req) => {
  const branchId = await resolveBranchId(req);
  const purchase = await Purchase.findOne({
    _id: req.params.id,
    adminId: tenantAdminId(req),
    branchId: branchId,
  });
  if (!purchase) throw new ApiError(404, 'Purchase phone not found or you do not have access to it.');
  if (purchase.status === 'Sold') {
    throw new ApiError(400, 'Cannot edit a purchase phone that has already been sold.');
  }

  const editableFields = [
    'name', 'companyName', 'modelName', 'imei2', 'ramMemory', 'color',
    'phoneCondition', 'warranty', 'purchasePrice', 'demandPrice', 'finalPrice', 'date',
  ];
  editableFields.forEach((field) => {
    if (req.body[field] !== undefined) purchase[field] = req.body[field];
  });

  await purchase.save();
  return purchase;
};

const deleteSinglePurchase = async (req) => {
  const branchId = await resolveBranchId(req);
  const purchase = await Purchase.findOne({
    _id: req.params.id,
    adminId: tenantAdminId(req),
    branchId: branchId,
  });
  if (!purchase) throw new ApiError(404, 'Purchase phone not found or you do not have access to it.');
  if (purchase.status === 'Sold') {
    throw new ApiError(400, 'Cannot delete a purchase phone that has already been sold.');
  }

  await Purchase.findByIdAndDelete(purchase._id);
  return purchase;
};

const dispatchSinglePurchase = async (req) => {
  const branchId = await resolveBranchId(req);
  const { receiverName } = req.body;
  if (!receiverName) throw new ApiError(400, 'receiverName is required.');

  const purchase = await Purchase.findOne({
    _id: req.params.id,
    adminId: tenantAdminId(req),
    branchId: branchId,
  });
  if (!purchase) throw new ApiError(404, 'Purchase phone not found or you do not have access to it.');
  if (purchase.status !== 'Available') {
    throw new ApiError(400, `Cannot dispatch a phone with status "${purchase.status}".`);
  }

  purchase.status = 'Dispatched';
  await purchase.save();

  const dispatch = await Dispatch.create({
    adminId: tenantAdminId(req),
    shopId: purchase.shopId,
    receiverName,
    items: [{
      itemType: 'phone',
      itemId: purchase._id,
      itemName: `${purchase.companyName} ${purchase.modelName} (${purchase.imei1})`,
      quantity: 1,
    }],
    status: 'Dispatched',
  });

  return { purchase, dispatch };
};

const returnSingleDispatch = async (req) => {
  const branchId = await resolveBranchId(req);
  const purchase = await Purchase.findOne({
    _id: req.params.id,
    adminId: tenantAdminId(req),
    branchId: branchId,
  });
  if (!purchase) throw new ApiError(404, 'Purchase phone not found or you do not have access to it.');
  if (purchase.status !== 'Dispatched') {
    throw new ApiError(400, 'This phone is not currently dispatched.');
  }

  purchase.status = 'Available';
  await purchase.save();

  await Dispatch.findOneAndUpdate(
    { adminId: tenantAdminId(req), status: 'Dispatched', 'items.itemId': purchase._id },
    { status: 'Returned' }
  );

  return purchase;
};

module.exports = {
  createSinglePurchase,
  listSinglePurchase,
  getSinglePurchaseById,
  updateSinglePurchase,
  deleteSinglePurchase,
  dispatchSinglePurchase,
  returnSingleDispatch,
};
