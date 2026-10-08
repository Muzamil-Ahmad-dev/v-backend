const { createCRUDService } = require('../../../../utils/crudFactory');
const PartyLedger = require('../../../../models/PartyLedger');
module.exports = createCRUDService(PartyLedger);
