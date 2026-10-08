const { createCRUDRouter } = require('../../../utils/crudFactory');
const controller = require('./company.controller');

// POST   / — create a company (brand)
// GET    / — list companies
// GET    /:id
// PUT    /:id
// DELETE /:id
module.exports = createCRUDRouter(controller);
