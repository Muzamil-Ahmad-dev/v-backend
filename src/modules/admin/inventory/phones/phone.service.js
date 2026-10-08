const { createCRUDService } = require('../../../../utils/crudFactory');
const Phone = require('../../../../models/Phone');
module.exports = createCRUDService(Phone);
