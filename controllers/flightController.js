const axios = require('axios');
const Flight = require('../models/Flight');

const AVIATION_KEY = AVIATION_KEY;

exports.searchFlights = async (req, res) => {
  try {
    const { origin, destination, date } = req.query;
    if (!origin || !destination || !date) {
      return res.status(400).json({ error: 'origin, destination and date required' });
    }

    // Check cache first (less than 1 hour old)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const cached = await Flight.find({
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      date,
      lastUpdated: { $gte: oneHourAgo }
    }).sort({ price: 1 });

    if (cached.length > 0) {
      return res.json({ flights: cached, cached: true });
    }

    // Fetch from AviationStack
    const response = await axios.get('http://api.aviationstack.com/v1/flights', {
      params: {
        access_key: AVIATION_KEY,
        dep_iata: origin.toUpperCase(),
        arr_iata: destination.toUpperCase(),
        flight_date: date,
      }
    });

    const flights = response.data.data || [];

    // Save to MongoDB cache
    const flightDocs = flights.map(f => ({
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      date,
      airline: f.airline?.name,
      flightNumber: f.flight?.iata,
      price: Math.floor(Math.random() * 5000) + 2000, // placeholder until paid API
      departureTime: f.departure?.scheduled,
      arrivalTime: f.arrival?.scheduled,
      lastUpdated: new Date()
    }));

    await Flight.deleteMany({ origin, destination, date });
    await Flight.insertMany(flightDocs);

    const saved = await Flight.find({ origin, destination, date }).sort({ price: 1 });
    res.json({ flights: saved, cached: false });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch flights' });
  }
};
