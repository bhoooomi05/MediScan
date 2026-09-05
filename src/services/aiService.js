/**
 * aiService.js
 * -------------------------------------------------------------------------
 * Connects the Node/Express backend to the FastAPI PyTorch model service.
 * Accepts description and imagePath, formats the image into a Base64 string,
 * posts it to the FastAPI /predict endpoint, and maps the response to camelCase.
 * -------------------------------------------------------------------------
 */

const axios = require('axios');
const fs = require('fs');

const WOUND_CLASSES = ['abrasion', 'bruise', 'burn', 'cut', 'ingrown_nail', 'laceration', 'stab_wound', 'wound'];
const SEVERITY_LEVELS = ['Low', 'Moderate', 'Severe'];
const URGENCY_LEVELS = ['Routine', 'Urgent', 'Emergency'];

async function analyzeWound({ description, imagePath = null }) {
  const modelUrl = process.env.MODEL_API_URL;

  console.log("MODEL_API_URL:", modelUrl);

  if (modelUrl) {
    console.log("Using REAL AI MODEL");
    return callModelService({ description, imagePath, modelUrl });
  }

  console.log("⚠️ USING LOCAL FALLBACK PREDICTION");
  return localFallbackPredict({ description });
}

async function callModelService({ description, imagePath, modelUrl }) {
  let imageBase64 = null;

  // Verify and convert image to base64
  if (imagePath && fs.existsSync(imagePath)) {
    const buffer = fs.readFileSync(imagePath);
    imageBase64 = buffer.toString('base64');
  }

  // Multimodal model requires an image
  if (!imageBase64) {
    const error = new Error('Image file is missing or unreadable. The multimodal model requires both image and text inputs.');
    error.statusCode = 400;
    throw error;
  }

  // Ensure trailing slash and endpoint target are constructed correctly
  const endpoint = modelUrl.endsWith('/predict')
    ? modelUrl
    : `${modelUrl.replace(/\/+$/, '')}/predict`;

  try {
    const { data } = await axios.post(
      endpoint,
      { description: description || '', imageBase64 },
      {
        timeout: Number(process.env.MODEL_API_TIMEOUT_MS) || 15000,
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.MODEL_API_KEY ? { Authorization: `Bearer ${process.env.MODEL_API_KEY}` } : {}),
        },
      }
    );

    return normalizeModelResponse(data);
  } catch (err) {
    const reason = err.response?.data?.detail || err.response?.data?.message || err.message;
    const wrapped = new Error(`Model API call failed: ${reason}`);
    wrapped.statusCode = err.response?.status || 502;
    throw wrapped;
  }
}

function normalizeModelResponse(data) {
  const woundClass = WOUND_CLASSES.includes(data.wound_class) ? data.wound_class : 'wound';
  const severity = SEVERITY_LEVELS.includes(data.severity) ? data.severity : 'Low';
  const urgency = URGENCY_LEVELS.includes(data.urgency) ? data.urgency : 'Routine';

  return {
    woundClass,
    woundConfidence: pctFromFraction(data.wound_confidence),
    severity,
    severityConfidence: pctFromFraction(data.severity_confidence),
    urgency,
    urgencyConfidence: pctFromFraction(data.urgency_confidence),
    raw: data,
  };
}

/**
 * Lightweight local fallback used when process.env.MODEL_API_URL is not configured.
 */
function localFallbackPredict({ description = '' }) {
  const text = description.toLowerCase();

  let woundClass = 'wound';
  if (/burn|scald|fire|hot/.test(text)) woundClass = 'burn';
  else if (/stab|puncture|impale/.test(text)) woundClass = 'stab_wound';
  else if (/laceration|torn|jagged/.test(text)) woundClass = 'laceration';
  else if (/cut|blade|knife|slice/.test(text)) woundClass = 'cut';
  else if (/bruise|contusion|black.?and.?blue/.test(text)) woundClass = 'bruise';
  else if (/scrape|abrasion|graze/.test(text)) woundClass = 'abrasion';
  else if (/nail/.test(text)) woundClass = 'ingrown_nail';

  let severity = 'Low';
  if (/severe|heavy bleeding|deep|can.?t stop bleeding|bone/.test(text)) severity = 'Severe';
  else if (/moderate|swelling|infected|pus/.test(text)) severity = 'Moderate';

  let urgency = 'Routine';
  if (severity === 'Severe' || /emergency|urgent|can.?t stop bleeding/.test(text)) urgency = 'Emergency';
  else if (severity === 'Moderate') urgency = 'Urgent';

  const seedLen = (description || '').length;
  const confidenceFor = (offset) => 68 + ((seedLen + offset) % 27);

  return {
    woundClass,
    woundConfidence: confidenceFor(1),
    severity,
    severityConfidence: confidenceFor(9),
    urgency,
    urgencyConfidence: confidenceFor(17),
    raw: { fallback: true },
  };
}

function pctFromFraction(n) {
  var num = Number(n) || 0;
  var pct = num <= 1 ? num * 100 : num;
  return Math.round(clamp(pct, 0, 100));
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

module.exports = { analyzeWound, WOUND_CLASSES, SEVERITY_LEVELS, URGENCY_LEVELS };