const User = require('../models/User');

// GET /api/settings
async function getSettings(req, res) {
  res.json({ success: true, settings: req.user.settings });
}

// PUT /api/settings
async function updateSettings(req, res, next) {
  try {
    const allowed = ['pushNotifications', 'darkMode', 'emailAlerts'];
    const updates = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) updates[`settings.${key}`] = req.body[key];
    });

    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true, runValidators: true });
    res.json({ success: true, settings: user.settings });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettings, updateSettings };
