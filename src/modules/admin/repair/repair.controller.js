const { createCRUDController } = require('../../../utils/crudFactory');
const service = require('./repair.service');
module.exports = createCRUDController(service, 'RepairJob');
