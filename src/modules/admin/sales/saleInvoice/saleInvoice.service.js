const { createCRUDService } = require('../../../../utils/crudFactory');
const SaleInvoice = require('../../../../models/SaleInvoice');
module.exports = createCRUDService(SaleInvoice);
