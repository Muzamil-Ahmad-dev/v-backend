const express = require("express");
const { decoderMiddleware } = require("../services/authServices");
const { updatePassword } = require("../controllers/passwordController");

 const passwordRouter = express.Router();

 passwordRouter.patch("/edit", decoderMiddleware, updatePassword);

 module.exports = passwordRouter;   