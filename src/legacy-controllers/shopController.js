const Shop = require('../schema/ShopSchema');
const UserSchema = require('../schema/UserSchema');
const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');

// Create Shop
exports.createShop = async (req, res) => {
    const { shopName , termsCondition, address, addresses, contacts, shopId } = req.body;

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const shop = new Shop({
            shopName,
            termsCondition,
            address,
            addresses: addresses || [],
            contacts: contacts || [],
            shopId,
        });

        const savedShop = await shop.save();
        return res.status(201).json({
            message: "Shop created successfully!",
            shop: savedShop,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal server error, please try again",
            error: error.message,
        });
    }
};

// Update Shop
exports.updateShop = async (req, res) => {
    const { id } = req.params;
    const { shopName, termsCondition, address, addresses, contacts } = req.body;

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const updatedShop = await Shop.findByIdAndUpdate(
            id,
            {
                shopName,
                termsCondition,
                address,
                ...(addresses !== undefined ? { addresses: addresses || [] } : {}),
                contacts: contacts || [],
            },
            { new: true }
        );

        if (!updatedShop) {
            return res.status(404).json({ message: "Shop not found" });
        }

        return res.status(200).json({
            message: "Shop updated successfully!",
            shop: updatedShop,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal server error, please try again",
            error: error.message,
        });
    }
};

// Delete Shop
exports.deleteShop = async (req, res) => {
    const { id } = req.params;

    try {
        const deletedShop = await Shop.findByIdAndDelete(id);

        if (!deletedShop) {
            return res.status(404).json({ message: "Shop not found" });
        }

        return res.status(200).json({
            message: "Shop deleted successfully!",
            shop: deletedShop,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal server error, please try again",
            error: error.message,
        });
    }
};

// Get a Single Shop by ID
exports.getShop = async (req, res) => {
    const { id } = req.params; // Extract `id` from request parameters

    try {
        // Find shop by `shopId` field
        const shop = await Shop.findOne({ shopId: id });

        if (!shop) {
            return res.status(404).json({ message: "Shop not found" });
        }

        return res.status(200).json({
            message: "Shop retrieved successfully!",
            shop: shop,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal server error, please try again",
            error: error.message,
        });
    }
};


// Get All Shops
exports.getAllShops = async (req, res) => {
    const { userId, userRole } = req.query;
  
    try {
      let shops = [];
  
      // Handle shop retrieval based on user role
      if (userRole === 'superadmin') {
        shops = await Shop.find({}).select('address shopName contacts')
        .lean();
      } else if (userRole === 'admin') {
        // Find users associated with the admin's account
        const users = await UserSchema.find({ accountId: userId }).select('_id');
        const userIds = users.map((user) => user._id);
  
        // Retrieve shops associated with these users
        shops = await Shop.find({ shopId: { $in: userIds } }).select('address shopName contacts')
        .lean();
      } else {
        return res.status(403).json({
          success: false,
          message: "Access denied. Invalid user role.",
        });
      }
  
      // Respond with the retrieved shops
      return res.status(200).json({
        success: true,
        message: "Shops retrieved successfully!",
        data: shops,
      });
  
    } catch (error) {
      console.error("Error retrieving shops:", error);
  
      // Handle internal server errors
      return res.status(500).json({
        success: false,
        message: "Internal server error, please try again.",
        error: error.message,
      });
    }
  };
  
// Upload Logo
exports.uploadLogo = async (req, res) => {
    try {
        const userId = req.user.id;
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No logo file provided"
            });
        }

        // Find shop by userId
        const shop = await Shop.findOne({ shopId: userId });
        if (!shop) {
            // Delete the uploaded file if shop not found
            fs.unlinkSync(req.file.path);
            return res.status(404).json({
                success: false,
                message: "Shop not found"
            });
        }

        // Delete old logo if exists
        if (shop.logo) {
            const oldLogoPath = path.join(__dirname, '../uploads/shop-logos', path.basename(shop.logo));
            if (fs.existsSync(oldLogoPath)) {
                fs.unlinkSync(oldLogoPath);
            }
        }

        // Update shop with new logo path
        const logoPath = `/uploads/shop-logos/${req.file.filename}`;
        const updatedShop = await Shop.findByIdAndUpdate(
            shop._id,
            { logo: logoPath },
            { new: true }
        );

        return res.status(200).json({
            success: true,
            message: "Logo uploaded successfully!",
            logo: logoPath,
            shop: updatedShop
        });
    } catch (error) {
        console.error("Logo upload error:", error);
        
        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        return res.status(500).json({
            success: false,
            message: "Internal server error, please try again",
            error: error.message
        });
    }
};

// Get Logo
exports.getLogo = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const shop = await Shop.findOne({ shopId: userId });
        if (!shop) {
            return res.status(404).json({
                success: false,
                message: "Shop not found"
            });
        }

        if (!shop.logo) {
            return res.status(404).json({
                success: false,
                message: "No logo found for this shop"
            });
        }

        // Return logo path
        return res.status(200).json({
            success: true,
            message: "Logo retrieved successfully",
            logo: shop.logo
        });
    } catch (error) {
        console.error("Get logo error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error, please try again",
            error: error.message
        });
    }
};

// Delete Logo
exports.deleteLogo = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const shop = await Shop.findOne({ shopId: userId });
        if (!shop) {
            return res.status(404).json({
                success: false,
                message: "Shop not found"
            });
        }

        if (!shop.logo) {
            return res.status(404).json({
                success: false,
                message: "No logo found for this shop"
            });
        }

        // Delete logo file from filesystem
        const logoPath = path.join(__dirname, '../uploads/shop-logos', path.basename(shop.logo));
        if (fs.existsSync(logoPath)) {
            fs.unlinkSync(logoPath);
        }

        // Remove logo path from database
        const updatedShop = await Shop.findByIdAndUpdate(
            shop._id,
            { $unset: { logo: 1 } },
            { new: true }
        );

        return res.status(200).json({
            success: true,
            message: "Logo deleted successfully",
            shop: updatedShop
        });
    } catch (error) {
        console.error("Delete logo error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error, please try again",
            error: error.message
        });
    }
};

// Serve Logo File (for direct file access)
exports.serveLogo = async (req, res) => {
    try {
        const { filename } = req.params;
        const logoPath = path.join(__dirname, '../uploads/shop-logos', filename);
        
        if (!fs.existsSync(logoPath)) {
            return res.status(404).json({
                success: false,
                message: "Logo file not found"
            });
        }

        // Set appropriate headers
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        
        // Stream the file
        const fileStream = fs.createReadStream(logoPath);
        fileStream.pipe(res);
    } catch (error) {
        console.error("Serve logo error:", error);
        return res.status(500).json({
            success: false,
            message: "Error serving logo file",
            error: error.message
        });
    }
};