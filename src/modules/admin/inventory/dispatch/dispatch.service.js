const { createCRUDService } = require('../../../../utils/crudFactory');
const Dispatch = require('../../../../models/Dispatch');
module.exports = createCRUDService(Dispatch);
