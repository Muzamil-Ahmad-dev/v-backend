const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./shopLedger.service');
module.exports = createCRUDController(service, 'ShopLedger');
