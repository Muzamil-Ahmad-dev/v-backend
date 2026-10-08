 const ApiError = require('../../../utils/ApiError');
const BulkPurchase = require('../../../models/BulkPurchase');
const PartyLedger = require('../../../models/PartyLedger');
const Dispatch = require('../../../models/Dispatch');
const { deductPurchasePayment, applySupplierCredit } = require('../shared/payment.helper');
const { tenantAdminId } = require('../shared/tenantAdminId');
const { resolveBranchId } = require('../../../utils/branchContext');

// Recomputes the rollup `status` field from the per-IMEI statuses.
const recomputeBulkStatus = (bulk) => {
  let total = 0;
  let sold = 0;
  bulk.ramSimDetails.forEach((rs) => {
    rs.imeiNumbers.forEach((entry) => {
      total += 1;
      if (entry.status === 'Sold') sold += 1;
    });
  });
  bulk.status = total === 0 || sold === 0 ? 'Available' : sold === total ? 'Sold' : 'Partially Sold';
};

const createBulkPurchase = async (req) => {
  const branchId = await resolveBranchId(req);
  if (!branchId) {
    throw new ApiError(403, 'Your account has no branch assigned. Contact your Branch Admin.');
  }

  const {
    partyName,
    companyName,
    modelName,
    date,
    ramSimDetails,
    purchasePaymentType = 'full-payment', // 'full-payment' | 'credit'
    creditPaymentData = {},
    bankAccountUsed,
    accountCash = 0,
    pocketCash = 0,
    shopId,
  } = req.body;

  if (!partyName) throw new ApiError(400, 'partyName (supplier) is required.');
  if (!Array.isArray(ramSimDetails) || ramSimDetails.length === 0) {
    throw new ApiError(400, 'ramSimDetails must be a non-empty array.');
  }

  let buyingPrice = 0;
  let totalPurchasedMobiles = 0;
  ramSimDetails.forEach((rs) => {
    const imeiCount = Array.isArray(rs.imeiNumbers) ? rs.imeiNumbers.length : 0;
    if (imeiCount === 0) throw new ApiError(400, 'Every RAM/SIM group must include at least one IMEI.');
    totalPurchasedMobiles += imeiCount;
    buyingPrice += Number(rs.priceOfOne || 0) * imeiCount;
  });

  if (purchasePaymentType === 'credit') {
    const now = Number(creditPaymentData.payableAmountNow || 0);
    const later = Number(creditPaymentData.payableAmountLater || 0);
    if (now + later !== buyingPrice) {
      throw new ApiError(400, 'payableAmountNow + payableAmountLater must equal the total buying price for a credit purchase.');
    }
  }

  let party = await PartyLedger.findOne({ adminId: tenantAdminId(req), partyName });
  if (!party) {
    party = await PartyLedger.create({ adminId: tenantAdminId(req), shopId: shopId || null, partyName });
  }

  const summary = `${companyName || 'Bulk purchase'} ${modelName || ''} (${totalPurchasedMobiles} phones)`.trim();

  await deductPurchasePayment({
    adminId: tenantAdminId(req),
    bankAccountUsed,
    accountCash,
    pocketCash,
    reason: `Purchase of ${summary}`,
  });

  let payableAmountLater = 0;
  let purchasePaymentStatus = 'paid';
  let totalPaidAmount = buyingPrice;

  if (purchasePaymentType === 'credit') {
    payableAmountLater = Number(creditPaymentData.payableAmountLater || 0);
    totalPaidAmount = Number(creditPaymentData.payableAmountNow || 0);
    purchasePaymentStatus = payableAmountLater > 0 ? 'pending' : 'paid';

    if (payableAmountLater > 0) {
      await applySupplierCredit({
        adminId: tenantAdminId(req),
        shopId: shopId || null,
        partyName,
        amount: payableAmountLater,
        description: `Credit purchase of ${summary}`,
      });
    }
  }

  const bulkPurchase = await BulkPurchase.create({
    adminId: tenantAdminId(req),
    branchId: branchId,
    shopId: shopId || null,
    partyLedgerId: party._id,
    companyName,
    modelName,
    date,
    buyingPrice,
    totalPurchasedMobiles,
    purchasePaymentType,
    purchasePaymentStatus,
    payableAmountLater,
    totalPaidAmount,
    status: 'Available',
    ramSimDetails: ramSimDetails.map((rs) => ({
      ramMemory: rs.ramMemory,
      simOption: rs.simOption,
      priceOfOne: rs.priceOfOne,
      imeiNumbers: rs.imeiNumbers.map((entry) => ({
        imei1: entry.imei1,
        imei2: entry.imei2,
        color: entry.color,
        batteryHealth: entry.batteryHealth,
        status: 'Available',
      })),
    })),
  });

  return bulkPurchase;
};

const listBulkPurchase = async (req) => {
  const branchId = await resolveBranchId(req);
  if (!branchId) return [];

  const { status, companyName, modelName, page, limit } = req.query;
  const filter = { adminId: tenantAdminId(req), branchId: branchId };
  if (status) filter.status = status;
  if (companyName) filter.companyName = new RegExp(companyName, 'i');
  if (modelName) filter.modelName = new RegExp(modelName, 'i');

  let query = BulkPurchase.find(filter).populate('partyLedgerId', 'partyName').sort('-createdAt');
  if (page && limit) {
    query = query.skip((Number(page) - 1) * Number(limit)).limit(Number(limit));
  }
  return query;
};

const getBulkPurchaseById = async (req) => {
  const branchId = await resolveBranchId(req);
  const bulk = await BulkPurchase.findOne({
    _id: req.params.id,
    adminId: tenantAdminId(req),
    branchId: branchId,
  }).populate('partyLedgerId', 'partyName');
  if (!bulk) throw new ApiError(404, 'Bulk purchase not found or you do not have access to it.');
  return bulk;
};

const updateBulkPurchase = async (req) => {
  const branchId = await resolveBranchId(req);
  const bulk = await BulkPurchase.findOne({
    _id: req.params.id,
    adminId: tenantAdminId(req),
    branchId: branchId,
  });
  if (!bulk) throw new ApiError(404, 'Bulk purchase not found or you do not have access to it.');

  const editableFields = ['companyName', 'modelName', 'date'];
  editableFields.forEach((field) => {
    if (req.body[field] !== undefined) bulk[field] = req.body[field];
  });

  await bulk.save();
  return bulk;
};

const deleteBulkPurchase = async (req) => {
  const branchId = await resolveBranchId(req);
  const bulk = await BulkPurchase.findOne({
    _id: req.params.id,
    adminId: tenantAdminId(req),
    branchId: branchId,
  });
  if (!bulk) throw new ApiError(404, 'Bulk purchase not found or you do not have access to it.');

  const hasTouchedStock = bulk.ramSimDetails.some((rs) => rs.imeiNumbers.some((entry) => entry.status !== 'Available'));
  if (hasTouchedStock) {
    throw new ApiError(400, 'Cannot delete a bulk purchase with dispatched or sold phones. Return them to stock first.');
  }

  await BulkPurchase.findByIdAndDelete(bulk._id);
  return bulk;
};

const dispatchBulkImeis = async (req) => {
  const branchId = await resolveBranchId(req);
  const { imeis, receiverName } = req.body;
  if (!receiverName) throw new ApiError(400, 'receiverName is required.');
  if (!Array.isArray(imeis) || imeis.length === 0) {
    throw new ApiError(400, 'imeis must be a non-empty array of IMEI1 values.');
  }

  const bulk = await BulkPurchase.findOne({
    _id: req.params.id,
    adminId: tenantAdminId(req),
    branchId: branchId,
  });
  if (!bulk) throw new ApiError(404, 'Bulk purchase not found or you do not have access to it.');

  const dispatchedItems = [];
  bulk.ramSimDetails.forEach((rs) => {
    rs.imeiNumbers.forEach((entry) => {
      if (imeis.includes(entry.imei1) && entry.status === 'Available') {
        entry.status = 'Dispatched';
        dispatchedItems.push({
          itemType: 'phone',
          itemId: entry._id,
          itemName: `${bulk.companyName} ${bulk.modelName} (${entry.imei1})`,
          quantity: 1,
        });
      }
    });
  });

  if (dispatchedItems.length === 0) {
    throw new ApiError(404, 'None of the provided IMEIs were found available in this bulk purchase.');
  }

  recomputeBulkStatus(bulk);
  await bulk.save();

  const dispatch = await Dispatch.create({
    adminId: tenantAdminId(req),
    shopId: bulk.shopId,
    receiverName,
    items: dispatchedItems,
    status: 'Dispatched',
  });

  return { bulkPurchase: bulk, dispatch };
};

const returnBulkDispatch = async (req) => {
  const branchId = await resolveBranchId(req);
  const { dispatchId } = req.params;

  const dispatch = await Dispatch.findOne({ _id: dispatchId, adminId: tenantAdminId(req) });
  if (!dispatch) throw new ApiError(404, 'Dispatch record not found.');
  if (dispatch.status !== 'Dispatched') {
    throw new ApiError(400, 'This dispatch has already been returned.');
  }

  const itemIds = dispatch.items.map((item) => String(item.itemId));
  const bulkPurchases = await BulkPurchase.find({ adminId: tenantAdminId(req), branchId: branchId });

  for (const bulk of bulkPurchases) {
    let touched = false;
    bulk.ramSimDetails.forEach((rs) => {
      rs.imeiNumbers.forEach((entry) => {
        if (itemIds.includes(String(entry._id)) && entry.status === 'Dispatched') {
          entry.status = 'Available';
          touched = true;
        }
      });
    });
    if (touched) {
      recomputeBulkStatus(bulk);
      await bulk.save();
    }
  }

  dispatch.status = 'Returned';
  await dispatch.save();
  return dispatch;
};

module.exports = {
  createBulkPurchase,
  listBulkPurchase,
  getBulkPurchaseById,
  updateBulkPurchase,
  deleteBulkPurchase,
  dispatchBulkImeis,
  returnBulkDispatch,
};
