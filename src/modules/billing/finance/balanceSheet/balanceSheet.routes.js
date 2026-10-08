const { createCRUDRouter } = require('../../../../utils/crudFactory');
const controller = require('./balanceSheet.controller');
module.exports = createCRUDRouter(controller);
