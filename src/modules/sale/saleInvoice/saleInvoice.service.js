const ApiError = require('../../../utils/ApiError');
const SaleInvoice = require('../../../models/SaleInvoice');
const Purchase = require('../../../models/Purchase');
const BulkPurchase = require('../../../models/BulkPurchase');
const Accessory = require('../../../models/Accessory');
const Shop = require('../../../models/Shop');
const StockMovement = require('../../../models/StockMovement');
const {
  receivePayment,
  deductPurchasePayment,
  applyCustomerCredit,
  reverseCustomerCredit,
} = require('../../purchase/shared/payment.helper');
const { tenantAdminId } = require('../../purchase/shared/tenantAdminId');
const { resolveBranchId } = require('../../../utils/branchContext');

// Recomputes a BulkPurchase's rollup status from its individual IMEI entries.
const recomputeBulkStatus = (bulk) => {
  const all = bulk.ramSimDetails.flatMap((rs) => rs.imeiNumbers);
  const soldCount = all.filter((e) => e.status === 'Sold').length;
  bulk.status = soldCount === 0 ? 'Available' : soldCount === all.length ? 'Sold' : 'Partially Sold';
};

// Finds an Available phone by IMEI, either a single Purchase or one entry
// inside a BulkPurchase. Returns a small descriptor used by both create and
// return so the two stay symmetric.
const findAvailablePhoneByImei = async ({ adminId, branchId, imei }) => {
  const single = await Purchase.findOne({ adminId, branchId, imei1: imei, status: 'Available' });
  if (single) return { source: 'single', doc: single };

  const bulks = await BulkPurchase.find({ adminId, branchId });
  for (const bulk of bulks) {
    for (const rs of bulk.ramSimDetails) {
      const entry = rs.imeiNumbers.find((e) => e.imei1 === imei && e.status === 'Available');
      if (entry) return { source: 'bulk', doc: bulk, ramSimDetail: rs, entry };
    }
  }
  return null;
};

const nextInvoiceNumber = async (adminId) => {
  const count = await SaleInvoice.countDocuments({ adminId });
  return `SI-${String(count + 1).padStart(6, '0')}`;
};

// Creates a sale invoice: optionally sells one phone (by IMEI, single or
// bulk stock) and/or a list of accessories, deducting real inventory,
// recording the payment (cash/bank/pocket or customer credit), and linking
// everything to the shop it was sold from.
//
// body: {
//   shopId?, saleType: 'single' | 'bulk' | 'generic',
//   customerName?, customerNumber?,
//   imei1?,                          // sells this phone if provided
//   salePrice?,                      // required if imei1 provided
//   accessories?: [{ accessoryId, quantity, price? }],
//   sellingPaymentType: 'Full Payment' | 'Credit' | 'Bank' | 'Exchange' | 'Cash',
//   bankAccountUsed?, accountCash?, pocketCash?,
//   payableAmountNow?, payableAmountLater?, payableAmountLaterDate?,
// }
const createSaleInvoice = async (req) => {
  const branchId = await resolveBranchId(req);
  if (!branchId) {
    throw new ApiError(403, 'Your account has no branch assigned. Contact your Branch Admin.');
  }
  const adminId = tenantAdminId(req);

  const {
    shopId = null,
    saleType = 'generic',
    customerName,
    customerNumber,
    imei1,
    imei2,
    salePrice,
    accessories = [],
    sellingPaymentType = 'Cash',
    bankAccountUsed,
    accountCash = 0,
    pocketCash = 0,
    payableAmountNow = 0,
    payableAmountLater = 0,
    payableAmountLaterDate,
  } = req.body;

  if (shopId) {
    const shop = await Shop.findOne({ _id: shopId, adminId });
    if (!shop) throw new ApiError(404, 'Shop not found or you do not have access to it.');
  }

  if (!imei1 && (!Array.isArray(accessories) || accessories.length === 0)) {
    throw new ApiError(400, 'Provide at least a phone (imei1) or one accessory to create a sale invoice.');
  }

  // ── 1. Resolve & reserve the phone (if any) ──────────────────────────
  let phoneRecord = null;
  let phoneDetails = undefined;
  let purchasePrice = 0;

  if (imei1) {
    if (salePrice === undefined) throw new ApiError(400, 'salePrice is required when selling a phone.');
    const found = await findAvailablePhoneByImei({ adminId, branchId, imei: imei1 });
    if (!found) throw new ApiError(404, `No available phone found with IMEI ${imei1}.`);
    phoneRecord = found;

    if (found.source === 'single') {
      purchasePrice = found.doc.purchasePrice;
      phoneDetails = {
        imei1: found.doc.imei1,
        imei2: found.doc.imei2,
        companyName: found.doc.companyName,
        modelName: found.doc.modelName,
        color: found.doc.color,
        ramMemory: found.doc.ramMemory,
        warranty: found.doc.warranty,
      };
    } else {
      purchasePrice = found.ramSimDetail.priceOfOne;
      phoneDetails = {
        imei1: found.entry.imei1,
        imei2: found.entry.imei2,
        companyName: found.doc.companyName,
        modelName: found.doc.modelName,
        color: found.entry.color,
        ramMemory: found.ramSimDetail.ramMemory,
        warranty: '',
      };
    }
  }

  // ── 2. Resolve & reserve accessories (if any) ────────────────────────
  const accessoryLines = [];
  let accessoriesTotal = 0;
  let accessoriesCost = 0;
  const reservedAccessories = []; // for rollback on failure

  try {
    for (const item of accessories) {
      const qty = Number(item.quantity) || 1;
      const accessory = await Accessory.findOne({ _id: item.accessoryId, adminId, branchId });
      if (!accessory) throw new ApiError(404, `Accessory ${item.accessoryId} not found.`);
      if (accessory.stock < qty) {
        throw new ApiError(400, `Not enough stock for "${accessory.accessoryName}" (have ${accessory.stock}, need ${qty}).`);
      }

      const unitPrice = item.price !== undefined ? Number(item.price) : accessory.perPiecePrice;
      accessory.stock -= qty;
      await accessory.save();
      reservedAccessories.push({ accessory, qty });

      accessoryLines.push({
        accessoryId: accessory._id,
        accessoryName: accessory.accessoryName,
        quantity: qty,
        price: unitPrice,
        totalPrice: unitPrice * qty,
      });
      accessoriesTotal += unitPrice * qty;
      accessoriesCost += accessory.perPiecePrice * qty;
    }
  } catch (err) {
    // Roll back any accessory stock already deducted before this failure.
    for (const { accessory, qty } of reservedAccessories) {
      accessory.stock += qty;
      await accessory.save();
    }
    throw err;
  }

  // ── 3. Mark phone sold (only after accessories succeeded) ────────────
  if (phoneRecord) {
    if (phoneRecord.source === 'single') {
      phoneRecord.doc.status = 'Sold';
      await phoneRecord.doc.save();
    } else {
      phoneRecord.entry.status = 'Sold';
      recomputeBulkStatus(phoneRecord.doc);
      await phoneRecord.doc.save();
    }
  }

  // ── 4. Pricing ────────────────────────────────────────────────────────
  const phoneSalePrice = imei1 ? Number(salePrice) : 0;
  const totalInvoice = phoneSalePrice + accessoriesTotal;
  const totalCost = purchasePrice + accessoriesCost;
  const profit = totalInvoice - totalCost;

  // ── 5. Payment ─────────────────────────────────────────────────────────
  const description = `Sale invoice${imei1 ? ` (IMEI ${imei1})` : ''}${accessoryLines.length ? ` + ${accessoryLines.length} accessor${accessoryLines.length > 1 ? 'ies' : 'y'}` : ''}`;

  if (sellingPaymentType === 'Credit') {
    if (Number(payableAmountNow) + Number(payableAmountLater) !== totalInvoice) {
      throw new ApiError(400, 'payableAmountNow + payableAmountLater must equal the total invoice amount.');
    }
    if (Number(payableAmountNow) > 0) {
      await receivePayment({ adminId, bankAccountUsed, accountCash, pocketCash, reason: description });
    }
    if (Number(payableAmountLater) > 0) {
      await applyCustomerCredit({
        adminId,
        shopId,
        partyName: customerName,
        amount: payableAmountLater,
        description,
      });
    }
  } else if (Number(accountCash) > 0 || Number(pocketCash) > 0) {
    await receivePayment({ adminId, bankAccountUsed, accountCash, pocketCash, reason: description });
  }

  // ── 6. Persist the invoice ──────────────────────────────────────────
  const invoiceNumber = await nextInvoiceNumber(adminId);
  const invoice = await SaleInvoice.create({
    adminId,
    branchId,
    shopId,
    invoiceNumber,
    saleType: imei1 ? (phoneRecord.source === 'bulk' ? 'bulk' : 'single') : 'generic',
    customerName,
    customerNumber,
    phoneDetails,
    accessories: accessoryLines,
    pricing: {
      salePrice: phoneSalePrice,
      purchasePrice: totalCost,
      totalInvoice,
      profit,
    },
    payment: {
      sellingPaymentType,
      payableAmountNow: sellingPaymentType === 'Credit' ? payableAmountNow : totalInvoice,
      payableAmountLater: sellingPaymentType === 'Credit' ? payableAmountLater : 0,
      payableAmountLaterDate: sellingPaymentType === 'Credit' ? payableAmountLaterDate : undefined,
    },
  });

  // ── 7. Stock movement trail ──────────────────────────────────────────
  if (imei1) {
    await StockMovement.create({
      adminId,
      shopId,
      itemType: 'phone',
      itemId: phoneRecord.doc._id,
      itemName: `${phoneDetails.companyName} ${phoneDetails.modelName} (${phoneDetails.imei1})`,
      movementType: 'out',
      quantity: 1,
      reason: `Sale invoice ${invoiceNumber}`,
    });
  }
  for (const line of accessoryLines) {
    await StockMovement.create({
      adminId,
      shopId,
      itemType: 'accessory',
      itemId: line.accessoryId,
      itemName: line.accessoryName,
      movementType: 'out',
      quantity: line.quantity,
      reason: `Sale invoice ${invoiceNumber}`,
    });
  }

  return invoice;
};

const listSaleInvoices = async (req) => {
  const branchId = await resolveBranchId(req);
  if (!branchId) return [];

  const { shopId, saleType, isReturned, dateFrom, dateTo, page, limit } = req.query;
  const filter = { adminId: tenantAdminId(req), branchId };
  if (shopId) filter.shopId = shopId;
  if (saleType) filter.saleType = saleType;
  if (isReturned !== undefined) filter.isReturned = isReturned === 'true';
  if (dateFrom || dateTo) {
    filter.saleDate = {};
    if (dateFrom) filter.saleDate.$gte = new Date(dateFrom);
    if (dateTo) filter.saleDate.$lte = new Date(dateTo);
  }

  let query = SaleInvoice.find(filter).sort('-createdAt');
  if (page && limit) {
    query = query.skip((Number(page) - 1) * Number(limit)).limit(Number(limit));
  }
  return query;
};

const getSaleInvoiceById = async (req) => {
  const branchId = await resolveBranchId(req);
  const invoice = await SaleInvoice.findOne({ _id: req.params.id, adminId: tenantAdminId(req), branchId });
  if (!invoice) throw new ApiError(404, 'Sale invoice not found or you do not have access to it.');
  return invoice;
};

// Reverses a sale: restocks the phone and/or accessories, reverses any
// customer credit taken, and optionally refunds cash/bank money back out.
// body: { returnAmount?, refund?: { bankAccountUsed, accountCash, pocketCash } }
const returnSaleInvoice = async (req) => {
  const branchId = await resolveBranchId(req);
  const adminId = tenantAdminId(req);
  const invoice = await SaleInvoice.findOne({ _id: req.params.id, adminId, branchId });
  if (!invoice) throw new ApiError(404, 'Sale invoice not found or you do not have access to it.');
  if (invoice.isReturned) throw new ApiError(400, 'This sale invoice has already been returned.');

  const { returnAmount, refund } = req.body || {};

  // Restock the phone.
  if (invoice.phoneDetails?.imei1) {
    const single = await Purchase.findOne({ adminId, branchId, imei1: invoice.phoneDetails.imei1 });
    if (single) {
      single.status = 'Available';
      await single.save();
    } else {
      const bulks = await BulkPurchase.find({ adminId, branchId });
      for (const bulk of bulks) {
        let touched = false;
        bulk.ramSimDetails.forEach((rs) => {
          const entry = rs.imeiNumbers.find((e) => e.imei1 === invoice.phoneDetails.imei1);
          if (entry) {
            entry.status = 'Available';
            touched = true;
          }
        });
        if (touched) {
          recomputeBulkStatus(bulk);
          await bulk.save();
          break;
        }
      }
    }
    await StockMovement.create({
      adminId,
      shopId: invoice.shopId,
      itemType: 'phone',
      itemId: invoice._id,
      itemName: `${invoice.phoneDetails.companyName} ${invoice.phoneDetails.modelName} (${invoice.phoneDetails.imei1})`,
      movementType: 'in',
      quantity: 1,
      reason: `Return of sale invoice ${invoice.invoiceNumber}`,
    });
  }

  // Restock accessories.
  for (const line of invoice.accessories) {
    const accessory = await Accessory.findOne({ _id: line.accessoryId, adminId, branchId });
    if (accessory) {
      accessory.stock += line.quantity;
      await accessory.save();
      await StockMovement.create({
        adminId,
        shopId: invoice.shopId,
        itemType: 'accessory',
        itemId: accessory._id,
        itemName: accessory.accessoryName,
        movementType: 'in',
        quantity: line.quantity,
        reason: `Return of sale invoice ${invoice.invoiceNumber}`,
      });
    }
  }

  // Reverse any outstanding customer credit from this sale.
  if (invoice.payment.sellingPaymentType === 'Credit' && invoice.payment.payableAmountLater > 0 && invoice.customerName) {
    await reverseCustomerCredit({
      adminId,
      partyName: invoice.customerName,
      amount: invoice.payment.payableAmountLater,
      description: `Return of sale invoice ${invoice.invoiceNumber}`,
    });
  }

  // Optional cash refund back out to the customer.
  if (refund && (Number(refund.accountCash) > 0 || Number(refund.pocketCash) > 0)) {
    await deductPurchasePayment({
      adminId,
      bankAccountUsed: refund.bankAccountUsed,
      accountCash: refund.accountCash,
      pocketCash: refund.pocketCash,
      reason: `Refund for returned sale invoice ${invoice.invoiceNumber}`,
    });
  }

  invoice.isReturned = true;
  invoice.returnAmount = returnAmount !== undefined ? Number(returnAmount) : invoice.pricing.totalInvoice;
  await invoice.save();

  return invoice;
};

module.exports = {
  createSaleInvoice,
  listSaleInvoices,
  getSaleInvoiceById,
  returnSaleInvoice,
};
