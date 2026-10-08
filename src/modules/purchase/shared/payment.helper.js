const ApiError = require('../../../utils/ApiError');
const BankAccount = require('../../../models/BankAccount');
const PocketCash = require('../../../models/PocketCash');
const PartyLedger = require('../../../models/PartyLedger');

/**
 * Deducts money from a bank account and/or the pocket cash wallet to pay for
 * a purchase, logging a transaction on each touched account. Only touches
 * accounts owned by the same admin (tenant) — never crosses tenants.
 */
const deductPurchasePayment = async ({ adminId, bankAccountUsed, accountCash = 0, pocketCash = 0, reason }) => {
  if (bankAccountUsed && Number(accountCash) > 0) {
    const bank = await BankAccount.findOne({ _id: bankAccountUsed, adminId });
    if (!bank) throw new ApiError(404, 'Bank account not found.');
    if (Number(accountCash) > bank.accountCash) {
      throw new ApiError(400, 'Insufficient bank account balance.');
    }
    bank.accountCash -= Number(accountCash);
    bank.cashOut = (bank.cashOut || 0) + Number(accountCash);
    bank.transactions.push({
      accountCash: Number(accountCash),
      reasonOfAmountDeduction: reason,
      cashOut: Number(accountCash),
      reason,
      balanceAfter: bank.accountCash,
    });
    await bank.save();
  }

  if (Number(pocketCash) > 0) {
    const pocket = await PocketCash.findOne({ adminId });
    if (!pocket) throw new ApiError(404, 'Pocket cash account not found.');
    if (Number(pocketCash) > pocket.accountCash) {
      throw new ApiError(400, 'Insufficient pocket cash balance.');
    }
    pocket.accountCash -= Number(pocketCash);
    pocket.transactions.push({
      amountDeducted: Number(pocketCash),
      remainingAmount: pocket.accountCash,
      accountCash: pocket.accountCash,
      reasonOfAmountDeduction: reason,
      reason,
    });
    await pocket.save();
  }
};

/**
 * Finds (or creates) the PartyLedger record for a supplier and logs a
 * "takingCredit" transaction for a credit purchase (amount now owed to them).
 */
const applySupplierCredit = async ({ adminId, shopId, partyName, amount, description }) => {
  if (!partyName) throw new ApiError(400, 'Party/supplier name is required for a credit purchase.');

  let party = await PartyLedger.findOne({ adminId, partyName });
  if (!party) {
    party = new PartyLedger({ adminId, shopId: shopId || null, partyName });
  }

  party.takingCredit = Number(party.takingCredit || 0) + Number(amount);
  party.status =
    party.takingCredit > party.givingCredit
      ? 'Payable'
      : party.givingCredit > party.takingCredit
      ? 'Receivable'
      : 'Settled';
  party.transactions.push({ takingCredit: Number(amount), description });

  await party.save();
  return party;
};

/**
 * Adds money INTO a bank account and/or the pocket cash wallet — the mirror
 * of deductPurchasePayment. Used when a sale is paid for (cash/bank/pocket
 * coming into the shop) and when a purchase return refunds money back in.
 */
const receivePayment = async ({ adminId, bankAccountUsed, accountCash = 0, pocketCash = 0, reason }) => {
  if (bankAccountUsed && Number(accountCash) > 0) {
    const bank = await BankAccount.findOne({ _id: bankAccountUsed, adminId });
    if (!bank) throw new ApiError(404, 'Bank account not found.');
    bank.accountCash += Number(accountCash);
    bank.cashIn = (bank.cashIn || 0) + Number(accountCash);
    bank.transactions.push({
      accountCash: Number(accountCash),
      sourceOfAmountAddition: reason,
      cashIn: Number(accountCash),
      source: reason,
      balanceAfter: bank.accountCash,
    });
    await bank.save();
  }

  if (Number(pocketCash) > 0) {
    let pocket = await PocketCash.findOne({ adminId });
    if (!pocket) pocket = new PocketCash({ adminId, accountCash: 0 });
    pocket.accountCash += Number(pocketCash);
    pocket.transactions.push({
      amountAdded: Number(pocketCash),
      remainingAmount: pocket.accountCash,
      accountCash: pocket.accountCash,
      sourceOfAmountAddition: reason,
      source: reason,
    });
    await pocket.save();
  }
};

/**
 * Finds (or creates) the PartyLedger record for a customer and logs a
 * "givingCredit" transaction for a credit sale (amount the customer now
 * owes the shop). Mirror of applySupplierCredit.
 */
const applyCustomerCredit = async ({ adminId, shopId, partyName, amount, description }) => {
  if (!partyName) throw new ApiError(400, 'Customer name is required for a credit sale.');

  let party = await PartyLedger.findOne({ adminId, partyName });
  if (!party) {
    party = new PartyLedger({ adminId, shopId: shopId || null, partyName });
  }

  party.givingCredit = Number(party.givingCredit || 0) + Number(amount);
  party.status =
    party.givingCredit > party.takingCredit
      ? 'Receivable'
      : party.takingCredit > party.givingCredit
      ? 'Payable'
      : 'Settled';
  party.transactions.push({ givingCredit: Number(amount), description });

  await party.save();
  return party;
};

/**
 * Reverses a previously-applied customer credit (used when a credit sale is
 * returned) by logging an equal-and-opposite "takingCredit" entry, capped so
 * the ledger never goes negative from a bad return amount.
 */
const reverseCustomerCredit = async ({ adminId, partyName, amount, description }) => {
  const party = await PartyLedger.findOne({ adminId, partyName });
  if (!party) return null;

  const reduceBy = Math.min(Number(amount), Number(party.givingCredit || 0));
  party.givingCredit = Number(party.givingCredit || 0) - reduceBy;
  party.status =
    party.givingCredit > party.takingCredit
      ? 'Receivable'
      : party.takingCredit > party.givingCredit
      ? 'Payable'
      : 'Settled';
  party.transactions.push({ takingCredit: reduceBy, description });

  await party.save();
  return party;
};

module.exports = {
  deductPurchasePayment,
  applySupplierCredit,
  receivePayment,
  applyCustomerCredit,
  reverseCustomerCredit,
};
