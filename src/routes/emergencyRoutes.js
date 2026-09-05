const express = require('express');
const { listGuides } = require('../controllers/emergencyController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Public reference info, but still requires login since it's inside the app shell
router.get('/', protect, listGuides);

module.exports = router;
