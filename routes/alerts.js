const router = require('express').Router();
const auth = require('../middleware/auth');
const { createAlert, getAlerts, deleteAlert } = require('../controllers/alertController');

router.post('/', auth, createAlert);
router.get('/', auth, getAlerts);
router.delete('/:id', auth, deleteAlert);

module.exports = router;