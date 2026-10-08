const bcrypt = require("bcryptjs");
const User = require("../schema/UserSchema");


exports.verfiyPassword = async (password, userId) => {
  const user = await User.findById(userId).select("password active");
  if (!user || user.active === false) {
    return false;
  }
  const isMatch = await bcrypt.compare(password, user.password);
  return !!isMatch;
};

exports.updatePassword = async (password, userId) => {
  const hashedPassword = await bcrypt.hash(password, 10);
  const updatedPassword = await User.findByIdAndUpdate(
    userId,
    { password: hashedPassword },
    { new: true }
  );
  return updatedPassword;
};