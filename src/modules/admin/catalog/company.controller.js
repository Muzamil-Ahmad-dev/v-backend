const { createCRUDController } = require('../../../utils/crudFactory');
const service = require('./company.service');
module.exports = createCRUDController(service, 'Company');
