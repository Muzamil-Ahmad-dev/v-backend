
const jwt = require("jsonwebtoken");

exports.generateAuthToken = (user) => {
    return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN,
    });
}

exports.decoderMiddleware = (req, res, next) => {
    const token = req.header("Authorization")?.split(" ")[1]; // Extract token
    if (!token) {
        return res.status(401).json({ message: "Access Denied: No token provided" });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // Decode token
        console.log("Decoded User ID:", decoded.id); // Log 
        req.user = decoded; // Attach user data to `req`
        next(); // Move to next middleware
    } catch (error) {
        return res.status(403).json({ message: "Invalid Token" });
    }
};
