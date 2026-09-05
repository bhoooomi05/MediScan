function notFound(req, res, next) {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.code === 11000) {
    return res.status(409).json({ success: false, message: 'Duplicate value', keyValue: err.keyValue });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: `Invalid id: ${err.value}` });
  }

  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Server error',
  });
}

module.exports = { notFound, errorHandler };
