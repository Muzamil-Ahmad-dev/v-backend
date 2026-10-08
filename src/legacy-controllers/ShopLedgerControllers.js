const { Entity, ShopLedger } = require('../schema/ShopLedgerSchema');

// Utility to update status
const updateStatus = (entity) => {
  const balance = entity.expense - entity.cashPaid;
  if (balance > 0) return "Payable";
  if (balance < 0) return "Receivable";
  return "Settled";
};

// Add new entity
const addEntity = async (req, res) => {
  try {
    const userId = req.user.id
    const {  name, reference } = req.body;
    const entity = await Entity.create({ userId, name, reference });
    res.status(201).json(entity);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add expense
const addExpense = async (req, res) => {
  try {
    const entityId = req.params.id;
    const userId = req.user.id;
    const { expense } = req.body;

    const entity = await Entity.findById(entityId);
    if (!entity) return res.status(404).json({ message: "Entity not found" });

    await ShopLedger.create({ userId, entityId, expense });

    entity.expense += expense;
    entity.status = updateStatus(entity);
    await entity.save();

    res.status(200).json({ message: "Expense added", entity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Cash payment to entity
const cashPayment = async (req, res) => {
  try {
    const entityId = req.params.id;
    const userId = req.user.id;
    const { cashPaid } = req.body;

    const entity = await Entity.findById(entityId);
    if (!entity) return res.status(404).json({ message: "Entity not found" });

    await ShopLedger.create({ userId, entityId, cashPaid });

    entity.cashPaid += cashPaid;
    entity.status = updateStatus(entity);
    await entity.save();

    res.status(200).json({ message: "Cash paid to entity", entity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Receive cash from entity (when overpaid)
const receiveCash = async (req, res) => {
  try {
    const entityId = req.params.id;
    const userId = req.user.id;
    const { receiveCash } = req.body;

    const entity = await Entity.findById(entityId);
    if (!entity) return res.status(404).json({ message: "Entity not found" });

    await ShopLedger.create({ userId, entityId, receiveCash });

    entity.cashPaid -= receiveCash;
    entity.receiveCash += receiveCash;
    entity.status = updateStatus(entity);
    await entity.save();

    res.status(200).json({ message: "Cash received from entity", entity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAllEntities = async (req, res) => {
  try {
    const userId = req.user.id;

    const entities = await Entity.find({ userId }).sort({ createdAt: -1 });

    res.status(200).json(entities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
const getAllEntityRecords = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find all ledger transactions for the user
    const records = await ShopLedger.find({ userId })
      .populate("entityId", "name reference") // populate entity name & reference
      .sort({ createdAt: -1 });

    res.status(200).json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  addEntity,
  addExpense,
  cashPayment,
  receiveCash,
  getAllEntities,
  getAllEntityRecords
};
