const axios = require('axios');
const Flight = require('../models/Flight');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'sky-scrapper.p.rapidapi.com';

// Axios instance with timeout
const apiClient = axios.create({
  timeout: 15000, // 15 seconds timeout
});

// Helper: get Sky Scrapper entityId from IATA code with better error handling
const getEntityId = async (iata) => {
  try {
    const response = await apiClient.get(
      'https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchAirport',
      {
        params: { query: iata, locale: 'en-US' },
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': RAPIDAPI_HOST,
        },
      }
    );

    // Handle RapidAPI subscription error
    if (response.data?.message) {
      throw new Error(`RapidAPI error: ${response.data.message}`);
    }

    const places = response.data?.data;
    if (!places || places.length === 0) {
      throw new Error(`Airport not found for IATA code: ${iata}`);
    }

    // Find exact IATA match first, fallback to first result
    const exactMatch = places.find(
      (p) => p.iata?.toUpperCase() === iata.toUpperCase()
    );
    const best = exactMatch || places[0];

    if (!best.entityId) {
      throw new Error(`No entityId found for airport: ${iata}`);
    }

    return best.entityId;
  } catch (err) {
    // Catch RapidAPI HTTP errors
    if (err.response?.status === 403 || err.response?.status === 401) {
      throw new Error('Invalid or missing RapidAPI key. Check RAPIDAPI_KEY in environment.');
    }
    if (err.response?.status === 429) {
      throw new Error('RapidAPI rate limit exceeded. Please try again later.');
    }
    if (err.response?.data?.message) {
      throw new Error(`RapidAPI: ${err.response.data.message}`);
    }
    throw err;
  }
};

exports.searchFlights = async (req, res) => {
  try {
    const { origin, destination, date } = req.query;

    if (!origin || !destination || !date) {
      return res.status(400).json({ error: 'origin, destination and date are required' });
    }

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
    }

    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ error: 'RAPIDAPI_KEY is not configured on the server' });
    }

    const originUpper = origin.toUpperCase();
    const destinationUpper = destination.toUpperCase();

    // Check cache first (less than 1 hour old)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const cached = await Flight.find({
      origin: originUpper,
      destination: destinationUpper,
      date,
      lastUpdated: { $gte: oneHourAgo },
    }).sort({ price: 1 });

    if (cached.length > 0) {
      return res.json({ flights: cached, cached: true });
    }

    // Get entityIds for origin and destination
    let originEntityId, destinationEntityId;
    try {
      [originEntityId, destinationEntityId] = await Promise.all([
        getEntityId(originUpper),
        getEntityId(destinationUpper),
      ]);
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }

    // Split date into parts (expected format: YYYY-MM-DD)
    const [year, month, day] = date.split('-');

    // Fetch flights from Sky Scrapper
    let response;
    try {
      response = await apiClient.get(
        'https://sky-scrapper.p.rapidapi.com/api/v2/flights/searchFlights',
        {
          params: {
            originSkyId: originUpper,
            destinationSkyId: destinationUpper,
            originEntityId,
            destinationEntityId,
            date,
            year,
            month,
            day,
            adults: '1',
            currency: 'INR',
            locale: 'en-US',
            market: 'IN',
            countryCode: 'IN',
          },
          headers: {
            'X-RapidAPI-Key': RAPIDAPI_KEY,
            'X-RapidAPI-Host': RAPIDAPI_HOST,
          },
        }
      );
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        return res.status(502).json({
          error: 'Not subscribed to Sky Scrapper API or invalid key. Visit https://rapidapi.com/apiheya/api/sky-scrapper to subscribe.',
        });
      }
      if (err.response?.status === 429) {
        return res.status(429).json({ error: 'RapidAPI rate limit exceeded. Try again later.' });
      }
      if (err.code === 'ECONNABORTED') {
        return res.status(504).json({ error: 'Request to Sky Scrapper API timed out.' });
      }
      return res.status(502).json({
        error: err.response?.data?.message || 'Failed to fetch flights from Sky Scrapper',
      });
    }

    // Handle RapidAPI message-level errors (they return 200 but with a message field)
    if (response.data?.message) {
      return res.status(502).json({ error: `Sky Scrapper API: ${response.data.message}` });
    }

    const itineraries = response.data?.data?.itineraries || [];

    if (itineraries.length === 0) {
      return res.json({ flights: [], cached: false, message: 'No flights found for this route/date' });
    }

    // Map response to Flight schema
    const flightDocs = itineraries.map((item) => {
      const leg = item.legs?.[0];
      const segment = leg?.segments?.[0];

      const carrierCode = segment?.marketingCarrier?.alternateId || '';
      const flightNum = segment?.flightNumber || '';

      return {
        origin: originUpper,
        destination: destinationUpper,
        date,
        airline: leg?.carriers?.marketing?.[0]?.name || 'Unknown',
        flightNumber: carrierCode && flightNum ? `${carrierCode}${flightNum}` : 'N/A',
        price: item.price?.raw ?? null,
        currency: 'INR',
        departureTime: leg?.departure || null,
        arrivalTime: leg?.arrival || null,
        duration: leg?.durationInMinutes ?? null,  // fixed: Number
        stops: leg?.stopCount ?? 0,                // fixed: now saved properly
        lastUpdated: new Date(),
      };
    });

    // Clear old cache and save new results
    await Flight.deleteMany({ origin: originUpper, destination: destinationUpper, date });
    await Flight.insertMany(flightDocs);

    const saved = await Flight.find({
      origin: originUpper,
      destination: destinationUpper,
      date,
    }).sort({ price: 1 });

    res.json({ flights: saved, cached: false });

  } catch (err) {
    console.error('searchFlights unexpected error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
