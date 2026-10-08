const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./phone.service');
module.exports = createCRUDController(service, 'Phone');
