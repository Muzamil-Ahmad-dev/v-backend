const { createCRUDService } = require('../../../../utils/crudFactory');
const StockMovement = require('../../../../models/StockMovement');
module.exports = createCRUDService(StockMovement);
