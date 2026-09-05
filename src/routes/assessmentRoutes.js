const express = require('express');
const {
  createAssessment,
  listAssessments,
  getAssessment,
  deleteAssessment,
  downloadReport,
} = require('../controllers/assessmentController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(protect);

router.route('/').post(upload.single('image'), createAssessment).get(listAssessments);

router.route('/:id').get(getAssessment).delete(deleteAssessment);

router.get('/:id/report', downloadReport);

module.exports = router;
