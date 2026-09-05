const Assessment = require('../models/Assessment');

// GET /api/dashboard/stats
async function getStats(req, res, next) {
  try {
    const userId = req.user._id;

    const [total, low, moderate, severe, routine, urgent, emergency, thisMonth] = await Promise.all([
      Assessment.countDocuments({ user: userId }),
      Assessment.countDocuments({ user: userId, severity: 'Low' }),
      Assessment.countDocuments({ user: userId, severity: 'Moderate' }),
      Assessment.countDocuments({ user: userId, severity: 'Severe' }),
      Assessment.countDocuments({ user: userId, urgency: 'Routine' }),
      Assessment.countDocuments({ user: userId, urgency: 'Urgent' }),
      Assessment.countDocuments({ user: userId, urgency: 'Emergency' }),
      Assessment.countDocuments({
        user: userId,
        createdAt: { $gte: new Date(new Date().setDate(1)) },
      }),
    ]);

    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

    res.json({
      success: true,
      stats: {
        total,
        thisMonth,
        low: { count: low, pct: pct(low) },
        moderate: { count: moderate, pct: pct(moderate) },
        severe: { count: severe, pct: pct(severe) },
        urgency: {
          routine: { count: routine, pct: pct(routine) },
          urgent: { count: urgent, pct: pct(urgent) },
          emergency: { count: emergency, pct: pct(emergency) },
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/dashboard/recent?limit=3
async function getRecent(req, res, next) {
  try {
    const limit = Number(req.query.limit) || 3;
    const recent = await Assessment.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(limit);
    res.json({ success: true, assessments: recent });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStats, getRecent };
