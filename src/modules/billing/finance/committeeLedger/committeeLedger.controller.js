const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./committeeLedger.service');
module.exports = createCRUDController(service, 'CommitteeLedger');
