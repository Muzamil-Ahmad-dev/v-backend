 
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const AddPhoneSchema = require("../schema/AddMobilePhoneSchema");
const multer = require("multer");
const AWS = require("aws-sdk");

// Configure AWS S3 securely using environment variables
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "ap-south-1",
});

const s3 = new AWS.S3();

// Set up Multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Helper function to upload an image to AWS S3
const uploadToS3 = (file) => {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET || "okiiee-mobile-inventory",
    Key: `phones/${Date.now()}_${file.originalname}`,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  return s3.upload(params).promise();
};

// Add Phone API
exports.addPhone = async (req, res) => {
  upload.array("images", 10)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        message: "Image upload failed",
        error: err.message,
      });
    }

    const {
      companyName,
      modelSpecifications,
      imei,
      demandPrice,
      imei2,
      finalPrice,
      shopid,
      color,
      purchasePrice,
      specs,
    } = req.body;

    try {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({
          errors: errors.array(),
        });
      }

      // Check duplicate IMEI
      const existingPhone = await AddPhoneSchema.findOne({
        $or: [{ imei }, { imei: imei2 }],
      });

      if (existingPhone) {
        return res.status(400).json({
          message:
            "A phone with one of the provided IMEI numbers already exists.",
        });
      }

      // Upload images to AWS S3
      const imageUrls = [];

      for (const file of req.files || []) {
        const uploadResult = await uploadToS3(file);
        imageUrls.push(uploadResult.Location);
      }

      // Create phone
      const phone = new AddPhoneSchema({
        images: imageUrls,
        companyName,
        modelSpecifications,
        specs,
        imei,
        demandPrice,
        purchasePrice,
        imei2,
        finalPrice,
        shopId: shopid,
        color,
        imeiImage: req.body.imeiImage,
      });

      const savedPhone = await phone.save();

      return res.status(201).json({
        message: "Phone added successfully!",
        phone: savedPhone,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Internal server error, please try again",
        error: error.message,
      });
    }
  });
};

// Update Phone API
exports.updatePhone = async (req, res) => {
  upload.array("images", 10)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        message: "Image upload failed",
        error: err.message,
      });
    }

    const { id } = req.params;

    const {
      images,
      companyName,
      modelSpecifications,
      specs,
      imei,
      demandPrice,
      imei2,
      finalPrice,
      color,
      purchasePrice,
    } = req.body;

    try {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({
          errors: errors.array(),
        });
      }

      // Upload new images to AWS S3
      const imageUrls = [];

      for (const file of req.files || []) {
        const uploadResult = await uploadToS3(file);
        imageUrls.push(uploadResult.Location);
      }

      const updateData = {
        companyName,
        modelSpecifications,
        specs,
        imei,
        demandPrice,
        purchasePrice,
        imei2: imei2 || "",
        finalPrice,
        color,
      };

      // Save newly uploaded images when provided
      if (imageUrls.length > 0) {
        updateData.images = imageUrls;
      }

      const updatedPhone = await AddPhoneSchema.findByIdAndUpdate(
        id,
        updateData,
        {
          new: true,
          runValidators: true,
        }
      );

      if (!updatedPhone) {
        return res.status(404).json({
          message: "Phone not found",
        });
      }

      return res.status(200).json({
        message: "Phone updated successfully!",
        phone: updatedPhone,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Internal server error, please try again",
        error: error.message,
      });
    }
  });
};

// Delete Phone API
exports.deletePhone = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedPhone = await AddPhoneSchema.findByIdAndDelete(id);

    if (!deletedPhone) {
      return res.status(404).json({
        message: "Phone not found",
      });
    }

    return res.status(200).json({
      message: "Phone deleted successfully!",
      phone: deletedPhone,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error, please try again",
      error: error.message,
    });
  }
};

// Get Phone API
exports.getPhone = async (req, res) => {
  const { id } = req.params;

  try {
    const phone = await AddPhoneSchema.findById(id);

    if (!phone) {
      return res.status(404).json({
        message: "Phone not found",
      });
    }

    return res.status(200).json({
      message: "Phone retrieved successfully!",
      phone: phone,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error, please try again",
      error: error.message,
    });
  }
};

// Get All Phones API
exports.getAllPhones = async (req, res) => {
  const { userId } = req.params;

  try {
    const phones = await AddPhoneSchema.find({
      user: userId,
    });

    return res.status(200).json({
      message: "Phones retrieved successfully!",
      phones: phones,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error, please try again",
      error: error.message,
    });
  }
};
