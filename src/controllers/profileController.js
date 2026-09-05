const User = require('../models/User');

// GET /api/profile
async function getProfile(req, res) {
  res.json({ success: true, user: req.user.toSafeObject() });
}

// PUT /api/profile
async function updateProfile(req, res, next) {
  try {
    const allowed = ['name', 'age', 'bloodGroup', 'allergies', 'emergencyContact', 'location'];
    const updates = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });

    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true, runValidators: true });
    res.json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProfile, updateProfile };
