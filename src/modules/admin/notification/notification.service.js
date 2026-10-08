const { createCRUDService } = require('../../../utils/crudFactory');
const Notification = require('../../../models/Notification');
module.exports = createCRUDService(Notification);
