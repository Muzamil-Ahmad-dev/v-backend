const { Company, Model } = require("../schema/CompanySchema");

// Create a new company
// exports.createCompany = async (req, res) => {
//   try {
//     const userId = req.user.id; // Assuming user ID is available in req.user
//     const { name } = req.body;
//     console.log("Creating company with name:", name, "for user ID:", userId);

//     // Check if company already exists
//     const existingCompany = await Company.findOne({ name, userId });
//     if (existingCompany) {
//       return res.status(400).json({ message: "Company already exists." });
//     }

//     const company = await Company.create({ name, userId });
//     res.status(201).json({ message: "Company created successfully", company });
//   } catch (error) {
//     console.error("Error creating company:", error);
//     res.status(500).json({ message: "Internal server error", error: error.message });
//   }
// };
exports.createCompany = async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;

    if (!name?.trim()) {
      return res.status(400).json({ message: "Company name is required." });
    }

    const normalizedName = name.trim().toLowerCase();
    console.log(
      "Creating company with normalized name:",
      normalizedName,
      "for user ID:",
      userId
    );

    const existingCompany = await Company.findOne({
      name: normalizedName,
      userId,
    });

    if (existingCompany) {
      return res.status(400).json({ message: "Company already exists." });
    }

    const company = await Company.create({
      name: normalizedName,
      userId,
    });

    res.status(201).json({
      success: true,
      message: "Company created successfully",
      data: company,
    });
  } catch (error) {
    console.error("Error creating company:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
// Create a new model for a specific company
exports.createModel = async (req, res) => {
  try {
    const userId = req.user.id; // Assuming user ID is available in req.user
    const { name, companyId } = req.body;

    // Check if company exists
    const company = await Company.findOne({
      _id: companyId, // Search by _id instead of companyId
      userId, // Verify the company belongs to this user
    });
    if (!company) {
      return res.status(404).json({ message: "Company not found." });
    }

    const model = await Model.create({ name, companyId, userId });

    // Update the company’s modelName field with this new model
    company.modelName = model._id;
    await company.save();

    res.status(201).json({ message: "Model created successfully", model });
  } catch (error) {
    console.error("Error creating model:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
exports.getAllCompanies = async (req, res) => {
  try {
    const companies = await Company.find({ userId: req.user.id }).sort({
      createdAt: -1,
    });
    res.status(200).json({ companies });
  } catch (error) {
    console.error("Error fetching companies:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
exports.getModelsByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;

    // Check if company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found." });
    }

    // Get all models for this company
    const models = await Model.find({ companyId }).sort({ createdAt: -1 });
    res.status(200).json({ models });
  } catch (error) {
    console.error("Error fetching models:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
exports.deleteCompanyByName = async (req, res) => {
  try {
    const { companyName } = req.body;
    if (!companyName?.trim()) {
      return res.status(400).json({ message: "Company name is required." });
    }
    const normalizedName = companyName.trim().toLowerCase();
    const company = await Company.findOne({ name: normalizedName });
    if (!company) {
      return res.status(404).json({ message: "Company not found." });
    }
    // Delete the company
    console.log("Deleting company with name:", normalizedName);

    await Company.deleteOne({ name: normalizedName });
    res.status(200).json({ message: "Company deleted successfully." });
  } catch (error) {
    console.error("Error deleting company:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
exports.editCompany = async (req, res) => {
  try {
    const { companyId, newName } = req.body;
    if (!companyId || !newName?.trim()) {
      return res
        .status(400)
        .json({ message: "Company ID and new name are required." });
    }

    const normalizedNewName = newName.trim().toLowerCase();
    const userId = req.user.id;

    // Check if the company exists and belongs to the user
    const company = await Company.findOne({ _id: companyId, userId });
    if (!company) {
      return res.status(404).json({ message: "Company not found." });
    }

    // Update the company name
    company.name = normalizedNewName;
    await company.save();

    res.status(200).json({ message: "Company updated successfully", company });
  } catch (error) {
    console.error("Error updating company:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.editModel = async (req, res) => {
  try {
    const { modelId, newName } = req.body;
    const userId = req.user.id;

    if (!modelId || !newName?.trim()) {
      return res.status(400).json({
        message: "Model ID and new name are required.",
      });
    }

    const model = await Model.findOne({
      _id: modelId,
      userId,
    });

    if (!model) {
      return res.status(404).json({ message: "Model not found." });
    }

    model.name = newName.trim().toLowerCase();
    await model.save();

    res.status(200).json({
      success: true,
      message: "Model updated successfully",
      model,
    });
  } catch (error) {
    console.error("Error updating model:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.deleteModel = async (req, res) => {
  try {
    const { modelId } = req.body;
    const userId = req.user.id;

    if (!modelId) {
      return res.status(400).json({
        message: "Model ID is required.",
      });
    }

    const model = await Model.findOneAndDelete({
      _id: modelId,
      userId,
    });

    if (!model) {
      return res.status(404).json({
        message: "Model not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Model deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting model:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};