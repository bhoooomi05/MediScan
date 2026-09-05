const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const assessmentRoutes = require('./routes/assessmentRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');
const profileRoutes = require('./routes/profileRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// --- core middleware ---
const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map((o) => o.trim());
app.use(
  cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// serve uploaded injury images
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// serve the frontend (public/index.html = smartcare-ui-tabs.html)
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- health check ---
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'MediScan API is running', time: new Date().toISOString() });
});

// --- routes ---
app.use('/api/auth', authRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/emergency-guide', emergencyRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/settings', settingsRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
