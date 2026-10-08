const { createCRUDRouter } = require('../../../../utils/crudFactory');
const controller = require('./shopLedger.controller');
module.exports = createCRUDRouter(controller);
