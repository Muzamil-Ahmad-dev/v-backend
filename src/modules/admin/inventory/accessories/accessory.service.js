const { createCRUDService } = require('../../../../utils/crudFactory');
const Accessory = require('../../../../models/Accessory');
module.exports = createCRUDService(Accessory);
