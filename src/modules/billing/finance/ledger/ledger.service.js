const { createCRUDService } = require('../../../../utils/crudFactory');
const Ledger = require('../../../../models/Ledger');
module.exports = createCRUDService(Ledger);
