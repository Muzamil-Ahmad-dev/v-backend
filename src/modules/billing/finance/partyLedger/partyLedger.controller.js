const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./partyLedger.service');
module.exports = createCRUDController(service, 'PartyLedger');
