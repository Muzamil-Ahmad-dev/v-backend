const { createCRUDRouter } = require('../../../../utils/crudFactory');
const controller = require('./dispatch.controller');
module.exports = createCRUDRouter(controller);
