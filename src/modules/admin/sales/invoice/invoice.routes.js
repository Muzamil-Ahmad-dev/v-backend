const { createCRUDRouter } = require('../../../../utils/crudFactory');
const controller = require('./invoice.controller');
module.exports = createCRUDRouter(controller);
