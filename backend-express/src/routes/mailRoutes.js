const express = require('express');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

router = express.Router();
const { sendEmail, subcribe } = require('../controllers/mailController');

// Subscribe to area updates
router.post('/subscribe', subcribe);