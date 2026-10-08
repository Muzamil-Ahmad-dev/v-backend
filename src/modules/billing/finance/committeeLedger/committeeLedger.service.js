const { createCRUDService } = require('../../../../utils/crudFactory');
const CommitteeLedger = require('../../../../models/CommitteeLedger');
module.exports = createCRUDService(CommitteeLedger);
