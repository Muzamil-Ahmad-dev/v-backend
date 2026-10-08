const { createCRUDService } = require('../../../../utils/crudFactory');
const Expense = require('../../../../models/Expense');
module.exports = createCRUDService(Expense);
