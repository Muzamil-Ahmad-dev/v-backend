 const express = require("express");
const router = express.Router();
const companyController = require("../controllers/CompanyController");
const { decoderMiddleware } = require("../services/authServices");

// ================= COMPANY ROUTES =================
router.post(
  "/create-company",
  decoderMiddleware,
  companyController.createCompany
);

router.post(
  "/delete-company",
  decoderMiddleware,
  companyController.deleteCompanyByName
);

router.put(
  "/edit",
  decoderMiddleware,
  companyController.editCompany
);

// ================= MODEL ROUTES =================
router.post(
  "/create-model",
  decoderMiddleware,
  companyController.createModel
);

router.put(
  "/edit-model",
  decoderMiddleware,
  companyController.editModel
);

router.delete(
  "/delete-model",
  decoderMiddleware,
  companyController.deleteModel
);

// ================= GET ROUTES =================
router.get(
  "/all-companies",
  decoderMiddleware,
  companyController.getAllCompanies
);

router.get(
  "/models/:companyId",
  decoderMiddleware,
  companyController.getModelsByCompany
);

module.exports = router;