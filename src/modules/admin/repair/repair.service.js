const { createCRUDService } = require('../../../utils/crudFactory');
const RepairJob = require('../../../models/RepairJob');
module.exports = createCRUDService(RepairJob);
