const { createCRUDService } = require('../../../../utils/crudFactory');
const Invoice = require('../../../../models/Invoice');
module.exports = createCRUDService(Invoice);
