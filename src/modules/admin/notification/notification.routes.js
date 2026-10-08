const { createCRUDRouter } = require('../../../utils/crudFactory');
const controller = require('./notification.controller');
module.exports = createCRUDRouter(controller);
