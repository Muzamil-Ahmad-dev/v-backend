const { createCRUDRouter } = require('../../../../utils/crudFactory');
const controller = require('./stock.controller');
module.exports = createCRUDRouter(controller);
