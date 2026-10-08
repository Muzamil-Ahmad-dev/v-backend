const { createCRUDService } = require('../../../../utils/crudFactory');
const BalanceSheet = require('../../../../models/BalanceSheet');
module.exports = createCRUDService(BalanceSheet);
