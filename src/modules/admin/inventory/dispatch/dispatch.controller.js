const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./dispatch.service');
module.exports = createCRUDController(service, 'Dispatch');
