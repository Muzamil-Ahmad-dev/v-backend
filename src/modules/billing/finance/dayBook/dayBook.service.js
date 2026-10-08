const { createCRUDService } = require('../../../../utils/crudFactory');
const DayBook = require('../../../../models/DayBook');
module.exports = createCRUDService(DayBook);
