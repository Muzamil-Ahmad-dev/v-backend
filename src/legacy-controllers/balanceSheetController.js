const { AddBankAccount, BankTransaction } = require('../schema/BankAccountSchema');
const { PocketCashSchema, PocketCashTransactionSchema } = require('../schema/PocketCashSchema');
const { Person, CreditTransaction } = require('../schema/PayablesAndReceiveablesSchema');
const { Entity, ShopLedger } = require('../schema/ShopLedgerSchema');
const { Accessory, AccessoryTransaction } = require('../schema/accessorySchema');
const { BulkPhonePurchase, PurchasePhone, SoldPhone, SingleSoldPhone } = require('../schema/purchasePhoneSchema');

const calculateBalanceSheet = async (req, res) => {
    try {
        const userId = req.user.id;
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        // 1. Calculate Bank Balances
        const bankAccounts = await AddBankAccount.find({ userId });
        const totalBankBalance = bankAccounts.reduce((sum, account) => sum + (account.accountCash || 0), 0);

        // 2. Calculate Pocket Cash
        const pocketCash = await PocketCashSchema.findOne({ userId });
        const pocketCashBalance = pocketCash ? pocketCash.accountCash : 0;

        // 3. Calculate Inventory Value
        // Accessories
        const accessories = await Accessory.find({ userId });
        const accessoriesValue = accessories.reduce((sum, item) => sum + (item.totalPrice), 0);

        // Single phones (purchased but not sold)
        const unsoldPhones = await PurchasePhone.find({ userId, isSold: false });
        const phonesInventoryValue = unsoldPhones.reduce((sum, phone) => sum + (phone.price?.purchasePrice || 0), 0);

        // Bulk phones (available status)
        const bulkPhones = await BulkPhonePurchase.find({
            userId,
            // status: { $in: ['Available', 'Partially Sold'] }
        }).populate('ramSimDetails');

        let bulkPhonesValue = 0;
        bulkPhones.forEach(bulk => {
            if (bulk.ramSimDetails?.length) {
                bulk.ramSimDetails.forEach(ramSim => {
                    const phoneCount = Array.isArray(ramSim.imeiNumbers) ? ramSim.imeiNumbers.length : 0;
                    bulkPhonesValue += phoneCount * (parseFloat(ramSim.priceOfOne) || 0);
                });
            }
        });

        const totalInventoryValue = accessoriesValue + phonesInventoryValue + bulkPhonesValue;

        // 4. Calculate Receivables
        const creditCustomers = await Person.find({ userId, status: 'Receivable' });
        const customerReceivables = creditCustomers.reduce((sum, customer) => {
            return sum + (parseFloat(customer.givingCredit) || 0) - (parseFloat(customer.takingCredit) || 0);
        }, 0);

        const receivableEntities = await Entity.find({ userId, status: 'Receivable' });
        const entityReceivables = receivableEntities.reduce((sum, entity) => {
            return sum + (parseFloat(entity.receiveCash) || 0) - (parseFloat(entity.cashPaid) || 0);
        }, 0);

        const totalReceivables = customerReceivables + entityReceivables;

        // 5. Calculate Payables
        const payableCustomers = await Person.find({ userId, status: 'Payable' });
        const customerPayables = payableCustomers.reduce((sum, customer) => {
            return sum + (parseFloat(customer.givingCredit) || 0) - (parseFloat(customer.takingCredit) || 0);
        }, 0);

        const payableEntities = await Entity.find({ userId, status: 'Payable' });
        const entityPayables = payableEntities.reduce((sum, entity) => {
            return sum + (parseFloat(entity.expense) || 0) - (parseFloat(entity.receiveCash) || 0);
        }, 0);

        // Fix for bulk purchase payables
        const creditBulkPurchases = await BulkPhonePurchase.find({
            userId,
            purchasePaymentStatus: 'pending',
            purchasePaymentType: 'credit'
        });

        const bulkPurchasePayables = creditBulkPurchases.reduce((sum, purchase) => {
            const payableLater = parseFloat(purchase.creditPaymentData?.payableAmountLater) || 0;
            return sum + payableLater;
        }, 0);

        const totalPayables = customerPayables + entityPayables + bulkPurchasePayables;

        // 6. Calculate Profit from sales
        // Calculate profit from single phone sales
        const singlePhoneSales = await SingleSoldPhone.find({ userId });
        const singlePhoneSaleProfit = singlePhoneSales.reduce((sum, sale) => sum + (parseFloat(sale.profit) || 0), 0);

        const soldPhones = await SoldPhone.find({ userId });
        const phoneProfit = soldPhones.reduce((sum, phone) => sum + (parseFloat(phone.profit) || 0), 0);

        const accessoryTransactions = await AccessoryTransaction.find({ userId });
        const accessoryProfit = accessoryTransactions.reduce((sum, trans) => {
            const accessory = accessories.find(a => a._id.equals(trans.accessoryId));
            if (accessory) {
                const profitPerUnit = (parseFloat(trans.perPiecePrice) || 0) - (parseFloat(accessory.perPiecePrice) || 0);
                return sum + (profitPerUnit * (parseFloat(trans.quantity) || 0));
            }
            return sum;
        }, 0);

        const totalProfit = phoneProfit + accessoryProfit + singlePhoneSaleProfit;

        // 7. Prepare Balance Sheet with proper number formatting
        const balanceSheet = {
            assets: {
                currentAssets: {
                    cashAndEquivalents: {
                        bankBalances: parseFloat(totalBankBalance.toFixed(2)),
                        pocketCash: parseFloat(pocketCashBalance.toFixed(2)),
                        total: parseFloat((totalBankBalance + pocketCashBalance).toFixed(2))
                    },
                    inventory: {
                        accessories: parseFloat(accessoriesValue.toFixed(2)),
                        phones: parseFloat(phonesInventoryValue.toFixed(2)),
                        bulkPhones: parseFloat(bulkPhonesValue.toFixed(2)),
                        total: parseFloat(totalInventoryValue.toFixed(2))
                    },
                    receivables: {
                        customers: parseFloat(customerReceivables.toFixed(2)),
                        entities: parseFloat(entityReceivables.toFixed(2)),
                        total: parseFloat(totalReceivables.toFixed(2))
                    },
                    totalCurrentAssets: parseFloat((
                        totalBankBalance +
                        pocketCashBalance +
                        totalInventoryValue +
                        totalReceivables
                    ).toFixed(2))
                },
                totalAssets: parseFloat((
                    totalBankBalance +
                    pocketCashBalance +
                    totalInventoryValue +
                    totalReceivables
                ).toFixed(2))
            },
            liabilities: {
                currentLiabilities: {
                    payables: {
                        customers: parseFloat(customerPayables.toFixed(2)),
                        entities: parseFloat(entityPayables.toFixed(2)),
                        bulkPurchases: parseFloat(bulkPurchasePayables.toFixed(2)),
                        total: parseFloat(totalPayables.toFixed(2))
                    },
                    totalCurrentLiabilities: parseFloat(totalPayables.toFixed(2))
                },
                totalLiabilities: parseFloat(totalPayables.toFixed(2))
            },
            equity: {
                retainedEarnings: parseFloat(totalProfit.toFixed(2)),
                totalEquity: parseFloat(totalProfit.toFixed(2))
            },
            totals: {
                totalAssets: parseFloat((
                    totalBankBalance +
                    pocketCashBalance +
                    totalInventoryValue +
                    totalReceivables
                ).toFixed(2)),
                totalLiabilitiesAndEquity: parseFloat((
                    totalPayables +
                    totalProfit
                ).toFixed(2))
            }
        };

        // Verify accounting equation
        const assets = balanceSheet.totals.totalAssets;
        const liabilitiesPlusEquity = balanceSheet.totals.totalLiabilitiesAndEquity;

        if (Math.abs(assets - liabilitiesPlusEquity) > 1) {
            console.warn(`Accounting equation imbalance: Assets (${assets}) ≠ Liabilities + Equity (${liabilitiesPlusEquity})`);
        }

        res.status(200).json({
            success: true,
            balanceSheet,
            accountingEquationValid: Math.abs(assets - liabilitiesPlusEquity) <= 1
        });

    } catch (error) {
        console.error('Error calculating balance sheet:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate balance sheet',
            message: error.message
        });
    }
};

module.exports = {
    calculateBalanceSheet
};