const { createCRUDService } = require('../../../../utils/crudFactory');
const Purchase = require('../../../../models/Purchase');
module.exports = createCRUDService(Purchase);
