const { createCRUDService } = require('../../../../utils/crudFactory');
const Person = require('../../../../models/Person');
module.exports = createCRUDService(Person);
