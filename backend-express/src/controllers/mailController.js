const nodemailer = require('nodemailer');
require('dotenv').config();
const { Area, AreaSubscription } = require('../models'); // Adjust the path as necessary
const logger = require('../config/logger');
const EMAIL_PASSWORD = (process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD || '')
  .replace(/\s+/g, '');


const sendEmail = async (req, res) => {
  const { to, subject, message } = req.body;

  // Create transporter
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,      // your Gmail
      pass: EMAIL_PASSWORD,      // your App Password
    },
  });

  // Define email options
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text: message,
  };

  // Send the email
  try {
    const info = await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Email sent', info });
  } catch (error) {
    logger.error('Email error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
};

const subcribe = async (req, res) => {
  try {
    const { email, areaId } = req.body;

    // Kiểm tra đầu vào
    if (!email || !areaId) {
      return res.status(400).json({ message: 'Missing email or areaId' });
    }

    // Kiểm tra area có tồn tại không
    const area = await Area.findByPk(areaId);
    if (!area) {
      return res.status(404).json({ message: 'Area not found' });
    }

    // Kiểm tra xem đã đăng ký chưa (tránh trùng email + areaId)
    const existing = await AreaSubscription.findOne({
      where: { email, areaId },
    });

    if (existing) {
      return res.status(409).json({ message: 'You already subscribed to this area.' });
    }

    // Tạo đăng ký mới
    const subscription = await AreaSubscription.create({ email, areaId });

    return res.status(201).json({
      message: 'Subscribed successfully',
      data: subscription,
    });

  } catch (error) {
    logger.error('Subscribe error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

const generateUnsubscribeLink = (email, areaId) => {
  const token = jwt.sign(
    { email, areaId },
    process.env.UNSUBSCRIBE_SECRET, // bạn đặt trong .env
  );

  return `https://yourdomain.com/unsubscribe?token=${token}`;
};


module.exports = { sendEmail, subcribe };
