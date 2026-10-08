const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./invoice.service');
module.exports = createCRUDController(service, 'Invoice');
