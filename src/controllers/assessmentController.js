const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const Assessment = require('../models/Assessment');
const { analyzeWound } = require('../services/aiService');

function titleCase(str) {
  return String(str || '')
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// POST /api/assessments  (multipart/form-data, field name "image")
// The model is multimodal: both a wound image and a symptom description are required.
async function createAssessment(req, res, next) {
  try {
    const { description } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'A wound image is required — the model needs both an image and a description.' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, message: 'A symptom / wound description is required — the model needs both an image and a description.' });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    const imagePath = path.join(__dirname, '..', '..', 'uploads', req.file.filename);

    // Create the record first so we always have a history row, even if the
    // model call fails (status stays "pending"/"failed").
    const assessment = await Assessment.create({
      user: req.user._id,
      imageUrl,
      description,
      status: 'pending',
    });

    try {
      const result = await analyzeWound({ description, imagePath });

      assessment.woundClass = result.woundClass;
      assessment.woundConfidence = result.woundConfidence;
      assessment.severity = result.severity;
      assessment.severityConfidence = result.severityConfidence;
      assessment.urgency = result.urgency;
      assessment.urgencyConfidence = result.urgencyConfidence;
      assessment.aiRaw = result.raw;
      assessment.status = 'analyzed';
      await assessment.save();
    } catch (aiErr) {
      assessment.status = 'failed';
      assessment.aiRaw = { error: aiErr.message };
      await assessment.save();
      console.error('AI analysis failed:', aiErr.message);
    }

    res.status(201).json({ success: true, assessment });
  } catch (err) {
    next(err);
  }
}

// GET /api/assessments?severity=&urgency=&woundClass=&search=&page=&limit=
async function listAssessments(req, res, next) {
  try {
    const { severity, urgency, woundClass, search, page = 1, limit = 20 } = req.query;

    const query = { user: req.user._id };
    if (severity && severity !== 'All Severity') query.severity = severity;
    if (urgency && urgency !== 'All Urgency') query.urgency = urgency;
    if (woundClass && woundClass !== 'All Types') query.woundClass = woundClass;
    if (search) {
      query.$or = [{ description: { $regex: search, $options: 'i' } }, { woundClass: { $regex: search, $options: 'i' } }];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Assessment.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Assessment.countDocuments(query),
    ]);

    res.json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      assessments: items,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/assessments/:id
async function getAssessment(req, res, next) {
  try {
    const assessment = await Assessment.findOne({ _id: req.params.id, user: req.user._id });
    if (!assessment) return res.status(404).json({ success: false, message: 'Assessment not found' });
    res.json({ success: true, assessment });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/assessments/:id
async function deleteAssessment(req, res, next) {
  try {
    const assessment = await Assessment.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!assessment) return res.status(404).json({ success: false, message: 'Assessment not found' });
    res.json({ success: true, message: 'Assessment deleted' });
  } catch (err) {
    next(err);
  }
}

// GET /api/assessments/:id/report  -> streams a PDF report
async function downloadReport(req, res, next) {
  try {
    const assessment = await Assessment.findOne({ _id: req.params.id, user: req.user._id });
    if (!assessment) return res.status(404).json({ success: false, message: 'Assessment not found' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${assessment._id}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    const pageW = doc.page.width;
    const marginX = 50;
    const contentW = pageW - marginX * 2;

    const colors = {
      purple: '#7c3aed',
      purpleLight: '#f5f3ff',
      text: '#241b34',
      muted: '#6b7280',
      border: '#e5e7eb',
      white: '#ffffff',
    };
    const severityColors = { Low: '#16a34a', Moderate: '#d97706', Severe: '#dc2626', Unknown: '#6b7280' };
    const urgencyColors = { Routine: '#16a34a', Urgent: '#d97706', Emergency: '#dc2626', Unknown: '#6b7280' };
    const sevColor = severityColors[assessment.severity] || severityColors.Unknown;
    const urgColor = urgencyColors[assessment.urgency] || urgencyColors.Unknown;
    const woundLabel = titleCase(assessment.woundClass) || 'Unclassified';

    // ---------- Header band ----------
    doc.rect(0, 0, pageW, 90).fill(colors.purple);
    doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(22).text('MediScan', marginX, 28);
    doc.font('Helvetica').fontSize(12).fillColor('#e9d8fd').text('AI Wound Assessment Report', marginX, 55);
    doc.fontSize(9).fillColor(colors.white).text(`Report ID: ${assessment._id}`, marginX, 28, { align: 'right', width: contentW });
    doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, 42, { align: 'right', width: contentW });

    doc.y = 110;

    // ---------- Patient info card ----------
    const cardY = doc.y;
    doc.roundedRect(marginX, cardY, contentW, 55, 6).fillAndStroke(colors.purpleLight, colors.border);
    doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(11).text('Patient', marginX + 15, cardY + 10);
    doc.font('Helvetica').fontSize(11).text(req.user.name, marginX + 15, cardY + 26);
    doc.font('Helvetica-Bold').fontSize(11).text('Assessment Date', marginX + contentW / 3, cardY + 10);
    doc.font('Helvetica').fontSize(11).text(assessment.createdAt.toDateString(), marginX + contentW / 3, cardY + 26);
    doc.font('Helvetica-Bold').fontSize(11).text('Status', marginX + (2 * contentW) / 3, cardY + 10);
    doc.font('Helvetica').fontSize(11).text(assessment.status, marginX + (2 * contentW) / 3, cardY + 26);

    doc.y = cardY + 70;

    // ---------- Section header helper ----------
    const sectionHeader = (title) => {
      const y = doc.y;
      doc.rect(marginX, y, 4, 16).fill(colors.purple);
      doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(13).text(title, marginX + 12, y);
      doc.moveDown(0.7);
    };

    // ---------- Wound image + quick facts ----------
    sectionHeader('Wound Image');
    const sectionTop = doc.y;
    const imgBoxW = 220;
    const imgBoxH = 220;
    let hasImage = false;

    if (assessment.imageUrl) {
      const imgPath = path.join(__dirname, '..', '..', assessment.imageUrl.replace(/^\//, ''));
      if (fs.existsSync(imgPath)) {
        hasImage = true;
        doc.roundedRect(marginX, sectionTop, imgBoxW, imgBoxH, 6).stroke(colors.border);
        doc.image(imgPath, marginX + 5, sectionTop + 5, { fit: [imgBoxW - 10, imgBoxH - 10], align: 'center', valign: 'center' });
      }
    }
    if (!hasImage) {
      doc.roundedRect(marginX, sectionTop, imgBoxW, imgBoxH, 6).fillAndStroke('#f9fafb', colors.border);
      doc.fillColor(colors.muted).fontSize(10).text('No image available', marginX, sectionTop + imgBoxH / 2 - 5, { width: imgBoxW, align: 'center' });
    }

    const factsX = marginX + imgBoxW + 20;
    const factsW = contentW - imgBoxW - 20;
    doc.roundedRect(factsX, sectionTop, factsW, imgBoxH, 6).fillAndStroke(colors.purpleLight, colors.border);

    let fy = sectionTop + 15;
    doc.fillColor(colors.text).font('Helvetica-Bold').fontSize(14).text(woundLabel, factsX + 15, fy, { width: factsW - 30 });
    fy += 26;

    const badge = (text, color) => {
      doc.font('Helvetica-Bold').fontSize(9);
      const w = doc.widthOfString(text) + 20;
      doc.roundedRect(factsX + 15, fy, w, 18, 9).fill(color);
      doc.fillColor(colors.white).text(text, factsX + 15, fy + 4, { width: w, align: 'center' });
      fy += 24;
    };
    badge(`Severity: ${assessment.severity}`, sevColor);
    badge(`Urgency: ${assessment.urgency}`, urgColor);
    fy += 6;

    doc.font('Helvetica').fontSize(10).fillColor(colors.text);
    const factLine = (label, value) => {
      doc.font('Helvetica-Bold').text(`${label}: `, factsX + 15, fy, { continued: true, width: factsW - 30 });
      doc.font('Helvetica').text(`${value}`);
      fy += 16;
    };
    factLine('Wound Confidence', `${assessment.woundConfidence}%`);
    factLine('Severity Confidence', `${assessment.severityConfidence}%`);
    factLine('Urgency Confidence', `${assessment.urgencyConfidence}%`);

    doc.y = sectionTop + imgBoxH + 20;

    // ---------- Symptom description ----------
    sectionHeader('Symptom Description');
    doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.muted).text('DESCRIPTION', marginX, doc.y);
    doc.font('Helvetica').fontSize(11).fillColor(colors.text).text(assessment.description || 'N/A', marginX, doc.y + 2, { width: contentW });
    doc.moveDown(1);

    // ---------- AI prediction summary ----------
    sectionHeader('AI Prediction Summary');
    const rows = [
      ['Predicted Wound Type', `${woundLabel} (${assessment.woundConfidence}% confidence)`],
      ['Severity', `${assessment.severity} (${assessment.severityConfidence}% confidence)`],
      ['Urgency', `${assessment.urgency} (${assessment.urgencyConfidence}% confidence)`],
    ];
    rows.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.muted).text(label.toUpperCase(), marginX, doc.y);
      doc.font('Helvetica').fontSize(11).fillColor(colors.text).text(value, marginX, doc.y + 2, { width: contentW });
      doc.moveDown(0.6);
    });

    // ---------- Disclaimer ----------
    doc.moveDown(0.5);
    const discY = doc.y;
    doc.roundedRect(marginX, discY, contentW, 40, 6).fillAndStroke('#fef2f2', '#fecaca');
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#991b1b').text(
      'Disclaimer: This report is generated by an AI assistance tool for informational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider.',
      marginX + 12,
      discY + 8,
      { width: contentW - 24 }
    );

    doc.end();
  } catch (err) {
    next(err);
  }
}

module.exports = { createAssessment, listAssessments, getAssessment, deleteAssessment, downloadReport };
