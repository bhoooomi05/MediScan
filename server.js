require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`MediScan API listening on http://localhost:${PORT}`);
  });
}

start();

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
