const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./ledger.service');
module.exports = createCRUDController(service, 'Ledger');
