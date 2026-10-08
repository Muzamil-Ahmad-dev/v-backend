const { createCRUDRouter } = require('../../../../utils/crudFactory');
const controller = require('./payablesReceivables.controller');
module.exports = createCRUDRouter(controller);
