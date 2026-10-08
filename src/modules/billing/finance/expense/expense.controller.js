const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./expense.service');
module.exports = createCRUDController(service, 'Expense');
