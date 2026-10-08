const { createCRUDRouter } = require('../../../../utils/crudFactory');
const controller = require('./committeeLedger.controller');
module.exports = createCRUDRouter(controller);
