const { verfiyPassword, updatePassword } = require("../services/passwordService");

exports.updatePassword = async (req, res) => {
 try {
  const { previousPassword, newPassword } = req.body;
  const userId = req.user.id;
  const isVerified = await verfiyPassword(previousPassword, userId);
  if(!isVerified){
    return res.status(400).json({ message: "You Entered Wrong Password" });
  }
  const updatedPassword = await updatePassword(newPassword, userId);
  res.status(200).json({ message: "Password updated successfully", updatedPassword });
 } catch (error) {
  res.status(500).json({ message: "Internal server error", error: error.message });
 }
};