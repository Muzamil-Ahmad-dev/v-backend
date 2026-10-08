const { createCRUDRouter } = require('../../../utils/crudFactory');
const controller = require('./repair.controller');
module.exports = createCRUDRouter(controller);
