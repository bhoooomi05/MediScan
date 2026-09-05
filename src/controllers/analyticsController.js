const Assessment = require('../models/Assessment');
const { WOUND_CLASSES, SEVERITY_LEVELS, URGENCY_LEVELS } = require('../services/aiService');

// GET /api/analytics/timeline?days=30
async function getTimeline(req, res, next) {
  try {
    const days = Number(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const results = await Assessment.aggregate([
      { $match: { user: req.user._id, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      timeline: results.map((r) => ({ date: r._id, count: r.count })),
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/analytics/wound-types  -> Wound Type Distribution (8 classes, model output #1)
async function getWoundTypeBreakdown(req, res, next) {
  try {
    const results = await Assessment.aggregate([
      { $match: { user: req.user._id, woundClass: { $ne: null } } },
      { $group: { _id: '$woundClass', count: { $sum: 1 } } },
    ]);

    const total = results.reduce((sum, r) => sum + r.count, 0);
    const byType = Object.fromEntries(results.map((r) => [r._id, r.count]));

    const breakdown = WOUND_CLASSES.map((type) => ({
      type,
      count: byType[type] || 0,
      pct: total ? Math.round(((byType[type] || 0) / total) * 100) : 0,
    })).filter((b) => b.count > 0);

    res.json({ success: true, total, breakdown });
  } catch (err) {
    next(err);
  }
}

// GET /api/analytics/severity  -> Severity Distribution (model output #2)
async function getSeverityBreakdown(req, res, next) {
  try {
    const results = await Assessment.aggregate([
      { $match: { user: req.user._id, severity: { $in: SEVERITY_LEVELS } } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]);

    const total = results.reduce((sum, r) => sum + r.count, 0);
    const byLevel = Object.fromEntries(results.map((r) => [r._id, r.count]));

    const breakdown = SEVERITY_LEVELS.map((level) => ({
      type: level,
      count: byLevel[level] || 0,
      pct: total ? Math.round(((byLevel[level] || 0) / total) * 100) : 0,
    })).filter((b) => b.count > 0);

    res.json({ success: true, total, breakdown });
  } catch (err) {
    next(err);
  }
}

// GET /api/analytics/urgency  -> Urgency Distribution (model output #3)
async function getUrgencyBreakdown(req, res, next) {
  try {
    const results = await Assessment.aggregate([
      { $match: { user: req.user._id, urgency: { $in: URGENCY_LEVELS } } },
      { $group: { _id: '$urgency', count: { $sum: 1 } } },
    ]);

    const total = results.reduce((sum, r) => sum + r.count, 0);
    const byLevel = Object.fromEntries(results.map((r) => [r._id, r.count]));

    const breakdown = URGENCY_LEVELS.map((level) => ({
      type: level,
      count: byLevel[level] || 0,
      pct: total ? Math.round(((byLevel[level] || 0) / total) * 100) : 0,
    })).filter((b) => b.count > 0);

    res.json({ success: true, total, breakdown });
  } catch (err) {
    next(err);
  }
}

module.exports = { getTimeline, getWoundTypeBreakdown, getSeverityBreakdown, getUrgencyBreakdown };
