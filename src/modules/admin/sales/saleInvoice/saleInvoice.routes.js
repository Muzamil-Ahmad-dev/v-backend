const { createCRUDRouter } = require('../../../../utils/crudFactory');
const controller = require('./saleInvoice.controller');
module.exports = createCRUDRouter(controller);
