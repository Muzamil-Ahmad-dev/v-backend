const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./stock.service');
module.exports = createCRUDController(service, 'StockMovement');
