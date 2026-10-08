const { createCRUDController } = require('../../../../utils/crudFactory');
const service = require('./bank.service');
module.exports = createCRUDController(service, 'BankAccount');
