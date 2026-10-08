const { createCRUDRouter } = require('../../../../utils/crudFactory');
const controller = require('./dayBook.controller');
module.exports = createCRUDRouter(controller);
