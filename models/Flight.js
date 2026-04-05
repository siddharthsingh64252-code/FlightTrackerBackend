const mongoose = require('mongoose');

const flightSchema = new mongoose.Schema({
  origin: { type: String, required: true },
  destination: { type: String, required: true },
  date: { type: String, required: true },
  airline: { type: String },
  flightNumber: { type: String },
  price: { type: Number },
  currency: { type: String, default: 'INR' },
  departureTime: { type: String },
  arrivalTime: { type: String },
  duration: { type: String },
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Flight', flightSchema);