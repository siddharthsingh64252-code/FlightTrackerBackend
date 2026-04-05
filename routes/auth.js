const router = require('express').Router();
const { register, login, updatePushToken } = require('../controllers/authController');
const auth = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/push-token', auth, updatePushToken);

module.exports = router;