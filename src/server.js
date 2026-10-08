require('dotenv').config();
console.log("ENV CHECK:", process.env.MONGO_URI);
const app = require('./app');
const connectDB = require('./config/db');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    logger.info(`OKIEE backend running on port ${PORT}`);
  });
};

start();
