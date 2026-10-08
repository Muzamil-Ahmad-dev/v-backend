const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./pocketCash.service');
module.exports = createCRUDController(service, 'PocketCash');
