const { createCRUDRouter } = require('../../../../utils/crudFactory');
const controller = require('./phone.controller');
module.exports = createCRUDRouter(controller);
