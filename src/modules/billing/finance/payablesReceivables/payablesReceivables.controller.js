const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./payablesReceivables.service');
module.exports = createCRUDController(service, 'Person');
