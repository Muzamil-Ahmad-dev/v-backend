const { createCRUDController } = require('../../../utils/crudFactory');
const service = require('./model.service');
module.exports = createCRUDController(service, 'Phone Model');
