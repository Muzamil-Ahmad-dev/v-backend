const { createCRUDService } = require('../../../../utils/crudFactory');
const PocketCash = require('../../../../models/PocketCash');
module.exports = createCRUDService(PocketCash);
