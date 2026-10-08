const { createCRUDRouter } = require('../../../../utils/crudFactory');
const controller = require('./purchase.controller');
module.exports = createCRUDRouter(controller);
