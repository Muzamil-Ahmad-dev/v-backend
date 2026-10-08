  const cloudinary = require("../config/cloudinary");
const { v2 } = require("cloudinary");

exports.uploadImeiImage = async (req, res) => {
  try {
    // Check if file exists
    if (!req.file) {
      console.log("[v0] No file provided in upload request");
      return res.status(400).json({ 
        success: false,
        message: "No file provided" 
      });
    }

    console.log("[v0] File received:", {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });

    // Read file buffer
    const fileBuffer = req.file.buffer;
    
    // Validate file size (5MB max)
    if (fileBuffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ 
        success: false,
        message: "File size exceeds 5MB limit" 
      });
    }

    // Generate safe public_id
    const imei1 = (req.body.imei1 || "unknown").replace(/[^a-zA-Z0-9-_]/g, "");
    const public_id = `imei-${imei1}-${Date.now()}`;

    console.log("[v0] Starting Cloudinary upload...");

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = v2.uploader.upload_stream(
        {
          folder: "imei-images",
          resource_type: "auto",
          public_id: public_id,
          timeout: 60000, // 60 seconds
        },
        (error, result) => {
          if (error) {
            console.error("[v0] Cloudinary upload error:", error);
            reject(error);
          } else {
            console.log("[v0] Cloudinary upload success:", result.public_id);
            resolve(result);
          }
        }
      );

      uploadStream.on("error", (error) => {
        console.error("[v0] Upload stream error:", error);
        reject(error);
      });

      uploadStream.end(fileBuffer);
    });

    // ✅ IMPORTANT: Return both URL and publicId so frontend can save it
    // The frontend will include this imageUrl when submitting the purchase form
    res.status(200).json({
      success: true,
      imageUrl: result.secure_url,
      publicId: result.public_id,
      message: "Image uploaded successfully",
    });
  } catch (error) {
    console.error("[v0] Upload error details:", {
      message: error.message,
      code: error.http_code || error.code,
      status: error.http_status || error.status,
    });

    // Provide meaningful error messages
    let errorMessage = "Failed to upload image";
    if (error.message?.includes("401")) {
      errorMessage = "Cloudinary authentication failed - check your API credentials";
    } else if (error.message?.includes("timeout")) {
      errorMessage = "Upload timeout - please try again with a smaller file";
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message,
    });
  }
};

exports.deleteImeiImage = async (req, res) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      return res.status(400).json({ message: "Public ID required" });
    }

    await v2.uploader.destroy(publicId);

    res.status(200).json({
      success: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    console.error("Cloudinary delete error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete image",
      error: error.message,
    });
  }
};
