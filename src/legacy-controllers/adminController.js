const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const nodemailer = require("nodemailer");
const UserSchema = require("../schema/UserSchema");
const { generateAuthToken } = require("../services/authServices");

/* =========================
   REGISTER
========================= */
exports.register = async (req, res) => {
  // const { username, email, password, role } = req.body;
    const username = req.body.username?.trim()?.toLowerCase();   // ✅ ADD THIS
   const email = req.body.email?.trim();
  const password = req.body.password?.trim();
  const role = req.body.role?.trim()?.toLowerCase(); // ✅ FIX ADDED

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Validation error",
        errors: errors.array(),
      });
    }

    const user = await UserSchema.findOne({
      $or: [{ username }, { email }],
    });

    if (user) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new UserSchema({
      email,
      role,
      username,
      password: hashedPassword,
      otp,
    });

    const savedUser = await newUser.save();
    const token = generateAuthToken(savedUser);

    return res.status(201).json({
      message: "User registered successfully",
      user: savedUser,
      token,
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/* =========================
   LOGIN (FIXED)
========================= */
 exports.login = async (req, res) => {
  const username = req.body.username?.trim().toLowerCase();
  const password = req.body.password;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Validation error",
        errors: errors.array(),
      });
    }

    if (!username || !password) {
      return res.status(400).json({
        message: "Username and password required",
      });
    }

    const user = await UserSchema.findOne({ username });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (!user.active) {
      return res.status(403).json({
        message: "Account deactivated",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid password",
      });
    }

    const token = generateAuthToken(user);

    return res.status(200).json({
      message: "Login successful",
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      token,
    });

  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/* =========================
   GET USERS
========================= */
exports.getAllUsersExceptCurrent = async (req, res) => {
  const { user } = req.body;

  if (!user) {
    return res.status(400).json({
      message: "User required",
    });
  }

  try {
    let users = [];

    if (user.role === "superadmin") {
      users = await UserSchema.find({ _id: { $ne: user._id } }).select("-password");
    } else if (user.role === "admin") {
      users = await UserSchema.find({ accountId: user._id }).select("-password");
    }

    return res.status(200).json({
      message: users.length ? "Users found" : "No users found",
      data: users,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/* =========================
   UPDATE USER
========================= */
exports.updateUser = async (req, res) => {
  const { role, _id } = req.body;

  try {
    const user = await UserSchema.findById(_id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!role) {
      return res.status(400).json({ message: "Role required" });
    }

    user.role = role;
    const updated = await user.save();

    return res.status(200).json({
      message: "User updated",
      user: updated,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/* =========================
   TOGGLE STATUS
========================= */
 exports.toggleUserStatus = async (req, res) => {
  const { _id } = req.body;

  try {
    const user = await UserSchema.findById(_id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.active = !user.active;
    const updated = await user.save();

    return res.status(200).json({
      message: updated.active ? "Activated" : "Deactivated",
      user: updated,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/* =========================
   UPDATE PASSWORD
========================= */
exports.updatePassword = async (req, res) => {
  const { newPassword } = req.body;
  const { userId } = req.params;

  try {
    const user = await UserSchema.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!newPassword) {
      return res.status(400).json({ message: "Password required" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.status(200).json({
      message: "Password updated",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/* =========================
   SEND EMAIL
========================= */
exports.sendEmail = async (req, res) => {
  const { name, recipientEmail, subject, message } = req.body;

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: recipientEmail,
      to: process.env.EMAIL_USER,
      subject: subject || "No Subject",
      text: `Name: ${name}\nEmail: ${recipientEmail}\n\nMessage:\n${message}`,
    });

    return res.status(200).json({
      message: "Email sent",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Email failed",
      error: error.message,
    });
  }
};