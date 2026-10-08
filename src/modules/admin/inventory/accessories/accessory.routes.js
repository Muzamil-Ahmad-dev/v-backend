const { createCRUDRouter } = require('../../../../utils/crudFactory');
const controller = require('./accessory.controller');
module.exports = createCRUDRouter(controller);
