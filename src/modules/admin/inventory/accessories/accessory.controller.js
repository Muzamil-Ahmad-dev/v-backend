const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./accessory.service');
module.exports = createCRUDController(service, 'Accessory');
