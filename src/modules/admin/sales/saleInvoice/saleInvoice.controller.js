const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./saleInvoice.service');
module.exports = createCRUDController(service, 'SaleInvoice');
