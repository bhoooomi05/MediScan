const express = require('express');
const { getSettings, updateSettings } = require('../controllers/settingsController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.route('/').get(getSettings).put(updateSettings);

module.exports = router;
