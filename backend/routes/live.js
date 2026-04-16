const express = require('express');
const router = express.Router();

router.get('/active', (req, res) => {
  const liveStreams = req.app.get('liveStreams');
  res.json(liveStreams ? Array.from(liveStreams.values()) : []);
});

module.exports = router;
