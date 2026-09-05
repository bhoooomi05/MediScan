const mongoose = require('mongoose');

const emergencyGuideSchema = new mongoose.Schema(
  {
    title: { type: String, required: true }, // e.g. "Burns"
    icon: { type: String, required: true }, // fontawesome class e.g. "fa-solid fa-fire"
    color: { type: String, required: true }, // hex color for the icon badge
    description: { type: String, required: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmergencyGuide', emergencyGuideSchema);
