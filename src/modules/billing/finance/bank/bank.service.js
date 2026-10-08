const { createCRUDService } = require('../../../../utils/crudFactory');
const BankAccount = require('../../../../models/BankAccount');
module.exports = createCRUDService(BankAccount);
