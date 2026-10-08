const { createCRUDController } = require('../../../utils/crudFactory');
const service = require('./notification.service');
module.exports = createCRUDController(service, 'Notification');
