const router = require('express').Router();
const { searchFlights } = require('../controllers/flightController');

router.get('/search', searchFlights);

module.exports = router;