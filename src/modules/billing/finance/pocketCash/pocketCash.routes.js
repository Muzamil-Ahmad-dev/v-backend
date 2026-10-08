const { createCRUDRouter } = require('../../../../utils/crudFactory');
const controller = require('./pocketCash.controller');
module.exports = createCRUDRouter(controller);
