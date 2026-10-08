const { createCRUDRouter } = require('../../../utils/crudFactory');
const controller = require('./model.controller');

// POST   /            — create a phone model (body: { name, companyId })
// GET    /?companyId= — list models, optionally filtered by companyId
// GET    /:id
// PUT    /:id
// DELETE /:id
module.exports = createCRUDRouter(controller);
