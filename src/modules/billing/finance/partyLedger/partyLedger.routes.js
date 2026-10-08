const { createCRUDRouter } = require('../../../../utils/crudFactory');
const controller = require('./partyLedger.controller');
module.exports = createCRUDRouter(controller);
