 const ApiError = require('../../../utils/ApiError');
const Purchase = require('../../../models/Purchase');
const BulkPurchase = require('../../../models/BulkPurchase');
const { tenantAdminId } = require('../shared/tenantAdminId');
const { resolveBranchId } = require('../../../utils/branchContext');

// Flattens every ramSimDetails.imeiNumbers entry across a list of bulk
// purchases into one row-per-phone shape, matching single-purchase phones.
const flattenBulkStock = (bulkPurchases, statusFilter) => {
  const rows = [];
  bulkPurchases.forEach((bulk) => {
    bulk.ramSimDetails.forEach((rs) => {
      rs.imeiNumbers.forEach((entry) => {
        if (statusFilter && entry.status !== statusFilter) return;
        rows.push({
          source: 'bulk',
          bulkPurchaseId: bulk._id,
          companyName: bulk.companyName,
          modelName: bulk.modelName,
          ramMemory: rs.ramMemory,
          simOption: rs.simOption,
          priceOfOne: rs.priceOfOne,
          imei1: entry.imei1,
          imei2: entry.imei2,
          color: entry.color,
          batteryHealth: entry.batteryHealth,
          status: entry.status,
        });
      });
    });
  });
  return rows;
};

const getAvailableStock = async (req) => {
  const branchId = await resolveBranchId(req);
  if (!branchId) return { singlePhones: [], bulkPhones: [], totalAvailable: 0 };

  const { companyName, modelName } = req.query;
  const scope = { adminId: tenantAdminId(req), branchId: branchId };

  const singleFilter = { ...scope, status: 'Available' };
  if (companyName) singleFilter.companyName = new RegExp(companyName, 'i');
  if (modelName) singleFilter.modelName = new RegExp(modelName, 'i');

  const [singlePhones, bulkPurchases] = await Promise.all([
    Purchase.find(singleFilter).sort('-createdAt'),
    BulkPurchase.find({ ...scope, status: { $in: ['Available', 'Partially Sold'] } }).sort('-createdAt'),
  ]);

  let bulkPhones = flattenBulkStock(bulkPurchases, 'Available');
  if (companyName) bulkPhones = bulkPhones.filter((p) => new RegExp(companyName, 'i').test(p.companyName));
  if (modelName) bulkPhones = bulkPhones.filter((p) => new RegExp(modelName, 'i').test(p.modelName));

  return {
    singlePhones,
    bulkPhones,
    totalAvailable: singlePhones.length + bulkPhones.length,
  };
};

const getStockByImei = async (req) => {
  const branchId = await resolveBranchId(req);
  const { imei } = req.params;
  if (!imei) throw new ApiError(400, 'IMEI is required.');

  const scope = { adminId: tenantAdminId(req), branchId: branchId };

  const singlePhone = await Purchase.findOne({
    ...scope,
    $or: [{ imei1: imei }, { imei2: imei }],
  });

  const bulkPurchases = await BulkPurchase.find(scope);
  let bulkPhone = null;
  outer: for (const bulk of bulkPurchases) {
    for (const rs of bulk.ramSimDetails) {
      const entry = rs.imeiNumbers.find((i) => i.imei1 === imei || i.imei2 === imei);
      if (entry) {
        bulkPhone = {
          bulkPurchaseId: bulk._id,
          companyName: bulk.companyName,
          modelName: bulk.modelName,
          ramMemory: rs.ramMemory,
          simOption: rs.simOption,
          priceOfOne: rs.priceOfOne,
          imei1: entry.imei1,
          imei2: entry.imei2,
          color: entry.color,
          batteryHealth: entry.batteryHealth,
          status: entry.status,
        };
        break outer;
      }
    }
  }

  if (!singlePhone && !bulkPhone) {
    throw new ApiError(404, `No phone found with IMEI ${imei}.`);
  }

  return { singlePhone: singlePhone || null, bulkPhone };
};

const getStockSummary = async (req) => {
  const branchId = await resolveBranchId(req);
  if (!branchId) return [];

  const scope = { adminId: tenantAdminId(req), branchId: branchId };
  const [singlePhones, bulkPurchases] = await Promise.all([
    Purchase.find({ ...scope, status: 'Available' }),
    BulkPurchase.find({ ...scope, status: { $in: ['Available', 'Partially Sold'] } }),
  ]);

  const summary = {};
  const bump = (companyName, modelName) => {
    const key = `${companyName}||${modelName}`;
    if (!summary[key]) summary[key] = { companyName, modelName, availableCount: 0 };
    summary[key].availableCount += 1;
  };

  singlePhones.forEach((p) => bump(p.companyName, p.modelName));
  bulkPurchases.forEach((bulk) => {
    bulk.ramSimDetails.forEach((rs) => {
      rs.imeiNumbers.forEach((entry) => {
        if (entry.status === 'Available') bump(bulk.companyName, bulk.modelName);
      });
    });
  });

  return Object.values(summary).sort((a, b) => b.availableCount - a.availableCount);
};

module.exports = { getAvailableStock, getStockByImei, getStockSummary };
