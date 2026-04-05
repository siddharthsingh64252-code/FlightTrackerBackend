const Alert = require('../models/Alert');
const User = require('../models/User');
const Flight = require('../models/Flight');
const axios = require('axios');

exports.createAlert = async (req, res) => {
  try {
    const { origin, destination, date, targetPrice } = req.body;
    const user = await User.findById(req.user.id);
    if (!user.isPremium) {
      return res.status(403).json({ error: 'PREMIUM_REQUIRED' });
    }
    const alert = await Alert.create({
      userId: req.user.id,
      origin,
      destination,
      date,
      targetPrice
    });
    res.json({ alert });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getAlerts = async (req, res) => {
  try {
    const alerts = await Alert.find({
      userId: req.user.id,
      isActive: true
    });
    res.json({ alerts });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteAlert = async (req, res) => {
  try {
    await Alert.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.checkPriceAlerts = async () => {
  try {
    const alerts = await Alert.find({
      isActive: true,
      isTriggered: false
    });

    for (const alert of alerts) {
      const flights = await Flight.find({
        origin: alert.origin,
        destination: alert.destination,
        date: alert.date
      }).sort({ price: 1 });

      if (flights.length === 0) continue;

      const cheapest = flights[0].price;

      if (cheapest <= alert.targetPrice) {
        const user = await User.findById(alert.userId);

        if (user && user.expoPushToken) {
          await sendPushNotification(
            user.expoPushToken,
            'Price Alert!',
            `${alert.origin} to ${alert.destination} is now Rs.${cheapest}`
          );
        }

        await Alert.findByIdAndUpdate(
          alert._id,
          {
            isTriggered: true,
            isActive: false,
            currentPrice: cheapest
          }
        );
      }
    }
  } catch (err) {
    console.error('checkPriceAlerts error:', err);
  }
};

const sendPushNotification = async (token, title, body) => {
  try {
    await axios.post('https://exp.host/--/api/v2/push/send', {
      to: token,
      title: title,
      body: body,
      sound: 'default',
    });
  } catch (err) {
    console.error('Push notification error:', err);
  }
};