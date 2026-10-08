const { createCRUDService } = require('../../../utils/crudFactory');
const Company = require('../../../models/Company');
module.exports = createCRUDService(Company);
