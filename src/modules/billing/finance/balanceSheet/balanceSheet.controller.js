const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./balanceSheet.service');
module.exports = createCRUDController(service, 'BalanceSheet');
