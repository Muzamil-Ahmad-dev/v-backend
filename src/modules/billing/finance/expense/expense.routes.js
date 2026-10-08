const { createCRUDRouter } = require('../../../../utils/crudFactory');
const controller = require('./expense.controller');
module.exports = createCRUDRouter(controller);
