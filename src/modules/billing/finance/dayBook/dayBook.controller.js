const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./dayBook.service');
module.exports = createCRUDController(service, 'DayBook');
