const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const flightRoutes = require('./routes/flights');
const alertRoutes = require('./routes/alerts');
const { checkPriceAlerts } = require('./controllers/alertController');

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/alerts', alertRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'FlightTracker API running ✅' });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected ✅'))
  .catch(err => console.error('MongoDB error:', err));

// Check price alerts every hour
cron.schedule('0 * * * *', async () => {
  console.log('Checking price alerts...');
  await checkPriceAlerts();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} ✅`));