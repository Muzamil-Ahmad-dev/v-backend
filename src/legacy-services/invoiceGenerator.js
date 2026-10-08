const SaleInvoice = require("../schema/SaleInvoiceSchema");
const { SingleSoldPhone, SoldPhone } = require("../schema/purchasePhoneSchema");
const mongoose = require("mongoose");

const INVOICE_PREFIX = "#";
const INVOICE_DIGITS = 5;
const INVOICE_REGEX = /^#(\d+)$/;

const extractInvoiceNumber = (value) => {
  if (!value) return null;
  const match = String(value).trim().match(INVOICE_REGEX);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatInvoiceNumber = (num) =>
  `${INVOICE_PREFIX}${String(num).padStart(INVOICE_DIGITS, "0")}`;

const getMaxExistingInvoiceNumberForUser = async (userId) => {
  const [saleInvoices, singleSold, bulkSold] = await Promise.all([
    SaleInvoice.find({ userId }).select("invoiceNumber").lean(),
    SingleSoldPhone.find({ userId }).select("invoiceNumber").lean(),
    SoldPhone.find({ userId }).select("invoiceNumber").lean(),
  ]);

  let maxInvoiceNumber = 0;
  [...saleInvoices, ...singleSold, ...bulkSold].forEach((row) => {
    const parsed = extractInvoiceNumber(row?.invoiceNumber);
    if (parsed && parsed > maxInvoiceNumber) {
      maxInvoiceNumber = parsed;
    }
  });

  return maxInvoiceNumber;
};

const getNextInvoiceSequenceAtomic = async (userId) => {
  const collection = mongoose.connection.collection("invoice_counters");
  const userObjectId = new mongoose.Types.ObjectId(String(userId));
  const maxExisting = await getMaxExistingInvoiceNumberForUser(userId);

  // Always take max(counter, highest #NNNNN already stored). Otherwise the counter can
  // lag behind SaleInvoice/SingleSoldPhone/SoldPhone and production returns duplicate #s → E11000.
  const updated = await collection.findOneAndUpdate(
    { userId: userObjectId },
    [
      {
        $set: {
          seq: {
            $add: [
              {
                $max: [
                  { $ifNull: ["$seq", 0] },
                  { $literal: maxExisting },
                ],
              },
              1,
            ],
          },
          updatedAt: new Date(),
        },
      },
    ],
    { upsert: true, returnDocument: "after" }
  );

  const updatedDoc = updated?.value ?? updated ?? null;
  const nextSeq = Number(updatedDoc?.seq);
  if (Number.isFinite(nextSeq) && nextSeq > 0) {
    return nextSeq;
  }

  const fallback = await getMaxExistingInvoiceNumberForUser(userId);
  return fallback + 1;
};

/** Preview next number only — does not increment. Separate from allocate (generate). */
const peekNextInvoiceSequence = async (userId) => {
  const collection = mongoose.connection.collection("invoice_counters");
  const userObjectId = new mongoose.Types.ObjectId(String(userId));
  const query = { userId: userObjectId };

  const existing = await collection.findOne(query, { projection: { seq: 1 } });
  if (existing && Number.isFinite(Number(existing.seq))) {
    return Number(existing.seq) + 1;
  }

  const maxExisting = await getMaxExistingInvoiceNumberForUser(userId);
  return maxExisting + 1;
};

exports.generateInvoiceNumberForUser = async (userId) => {
  const nextSeq = await getNextInvoiceSequenceAtomic(userId);
  return formatInvoiceNumber(nextSeq);
};
exports.peekNextInvoiceNumberForUser = async (userId) => {
  const nextSeq = await peekNextInvoiceSequence(userId);
  return formatInvoiceNumber(nextSeq);
};

exports.invoiceGenerator = () => {
  return "INV-" + Math.floor(100000 + Math.random() * 900000);
};