const mongoose = require('mongoose');

const assessmentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Inputs to the multimodal model
    imageUrl: { type: String }, // path/URL to the uploaded wound image
    description: { type: String }, // symptom / wound description text fed to the model

    // Model output 1: wound classification
    woundClass: {
      type: String,
      enum: ['abrasion', 'bruise', 'burn', 'cut', 'ingrown_nail', 'laceration', 'stab_wound', 'wound'],
    },
    woundConfidence: { type: Number, min: 0, max: 100, default: 0 },

    // Model output 2: severity
    severity: {
      type: String,
      enum: ['Low', 'Moderate', 'Severe', 'Unknown'],
      default: 'Unknown',
    },
    severityConfidence: { type: Number, min: 0, max: 100, default: 0 },

    // Model output 3: urgency
    urgency: {
      type: String,
      enum: ['Routine', 'Urgent', 'Emergency', 'Unknown'],
      default: 'Unknown',
    },
    urgencyConfidence: { type: Number, min: 0, max: 100, default: 0 },

    aiRaw: { type: mongoose.Schema.Types.Mixed }, // raw response from the model service, kept for debugging

    status: {
      type: String,
      enum: ['pending', 'analyzed', 'failed'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

assessmentSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Assessment', assessmentSchema);
