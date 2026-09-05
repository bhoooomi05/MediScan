const EmergencyGuide = require('../models/EmergencyGuide');

// GET /api/emergency-guide
async function listGuides(req, res, next) {
  try {
    const guides = await EmergencyGuide.find().sort({ order: 1 });
    res.json({
      success: true,
      emergencyNumber: process.env.EMERGENCY_NUMBER || '108',
      guides,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listGuides };
