const express = require('express');
const { getTimeline, getWoundTypeBreakdown, getSeverityBreakdown, getUrgencyBreakdown } = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/timeline', getTimeline);
router.get('/wound-types', getWoundTypeBreakdown);
router.get('/severity', getSeverityBreakdown);
router.get('/urgency', getUrgencyBreakdown);

module.exports = router;
