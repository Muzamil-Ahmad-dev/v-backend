const { createCRUDService } = require('../../../../utils/crudFactory');
const ShopLedger = require('../../../../models/ShopLedger');
module.exports = createCRUDService(ShopLedger);
