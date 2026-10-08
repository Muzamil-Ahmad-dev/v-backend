const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./purchase.service');
module.exports = createCRUDController(service, 'Purchase');
