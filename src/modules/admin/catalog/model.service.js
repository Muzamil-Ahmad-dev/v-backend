const { createCRUDService } = require('../../../utils/crudFactory');
const PhoneModel = require('../../../models/PhoneModel');
module.exports = createCRUDService(PhoneModel);
