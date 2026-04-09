const axios = require('axios');
const Flight = require('../models/Flight');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'sky-scrapper.p.rapidapi.com';

// Helper: get Sky Scrapper entityId from IATA code
const getEntityId = async (iata) => {
  const response = await axios.get(
    'https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchAirport',
    {
      params: { query: iata, locale: 'en-US' },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    }
  );

  const places = response.data?.data;
  if (!places || places.length === 0) throw new Error(`Airport not found: ${iata}`);
  return places[0].entityId;
};

exports.searchFlights = async (req, res) => {
  try {
    const { origin, destination, date } = req.query;

    if (!origin || !destination || !date) {
      return res.status(400).json({ error: 'origin, destination and date required' });
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
    const [originEntityId, destinationEntityId] = await Promise.all([
      getEntityId(originUpper),
      getEntityId(destinationUpper),
    ]);

    // Split date into parts (expected format: YYYY-MM-DD)
    const [year, month, day] = date.split('-');

    // Fetch flights from Sky Scrapper
    const response = await axios.get(
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

    const itineraries = response.data?.data?.itineraries || [];

    if (itineraries.length === 0) {
      return res.json({ flights: [], cached: false });
    }

    // Map response to your Flight schema
    const flightDocs = itineraries.map((item) => {
      const leg = item.legs?.[0];
      const segment = leg?.segments?.[0];

      return {
        origin: originUpper,
        destination: destinationUpper,
        date,
        airline: leg?.carriers?.marketing?.[0]?.name || 'Unknown',
        flightNumber: segment?.flightNumber
          ? `${segment.marketingCarrier?.alternateId}${segment.flightNumber}`
          : 'N/A',
        price: item.price?.raw || 0,
        departureTime: leg?.departure || null,
        arrivalTime: leg?.arrival || null,
        duration: leg?.durationInMinutes || null,
        stops: leg?.stopCount || 0,
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
    console.error('searchFlights error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch flights' });
  }
};
