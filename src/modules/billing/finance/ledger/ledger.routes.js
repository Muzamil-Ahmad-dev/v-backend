const { createCRUDRouter } = require('../../../../utils/crudFactory');
const controller = require('./ledger.controller');
module.exports = createCRUDRouter(controller);
