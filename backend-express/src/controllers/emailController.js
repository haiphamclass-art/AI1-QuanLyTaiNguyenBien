const { Email, Area, Otp } = require('../models');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const logger = require('../config/logger');
const { FRONTEND_BASE_URL } = require('../config/publicUrls');
const {
  AreaScopeError,
  applyAreaScope,
  assertAreaWithinScope,
} = require('../utils/areaScope');


const resultConvert = (result) => {
  switch (+result) {
    case -1:
      return 'Môi trường không phù hợp cho việc nuôi trồng';
    case 0:
      return 'Môi trường phù hợp cho việc nuôi trồng';
    default:
      return 'Môi trường rất phù hợp cho việc nuôi trồng';
  }
}

const EMAIL_PUBLIC_ATTRIBUTES = [
  'id',
  'email',
  'area_id',
  'is_active',
  'created_at',
  'updated_at',
];

const sanitizeSubscription = (subscription) => {
  if (!subscription) return subscription;
  const data = typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription;
  const { unsubscribe_token, ...safeData } = data;
  return safeData;
};

const sanitizeSubscriptions = (subscriptions) => subscriptions.map(sanitizeSubscription);

const handleAreaScopeError = (res, error) => {
  if (error instanceof AreaScopeError) {
    return res.status(error.status).json({ error: error.message });
  }
  return null;
};

const getScopedAreaWhere = (req) => applyAreaScope({}, req.user);

const getEmailInclude = (req, areaAttributes = ['id', 'name', 'area_type', 'province', 'district']) => {
  const areaWhere = getScopedAreaWhere(req);
  return {
    model: Area,
    as: 'area',
    attributes: areaAttributes,
    required: true,
    ...(Object.keys(areaWhere).length ? { where: areaWhere } : {}),
  };
};

const findScopedSubscriptionById = async (id, req, attributes = EMAIL_PUBLIC_ATTRIBUTES) => Email.findOne({
  where: { id },
  attributes,
  include: [getEmailInclude(req)],
});

const findScopedAreaById = async (areaId, req) => {
  const area = await Area.findByPk(areaId);
  if (!area) return null;
  assertAreaWithinScope(area, req.user);
  return area;
};

const hashTokenForAudit = (token) => crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);


// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password',
  },
});

// Get all email subscriptions
exports.getAllEmailSubscriptions = async (req, res) => {
  try {
    const { limit, offset, area_id, email } = req.query;

    let query = {};

    if (area_id) {
      query.area_id = area_id;
    }

    if (email) {
      query.email = { [require('sequelize').Op.like]: `%${email}%` };
    }

    const options = {
      where: query,
      attributes: EMAIL_PUBLIC_ATTRIBUTES,
      include: [getEmailInclude(req)],
      order: [['created_at', 'DESC']],
      distinct: true,
    };

    if (limit) {
      options.limit = parseInt(limit, 10);
    }
    if (offset) {
      options.offset = parseInt(offset, 10);
    }

    // Use findAndCountAll to avoid SQL errors with count + include
    const { rows: subscriptions, count: total } = await Email.findAndCountAll(options);

    res.status(200).json({ subscriptions: sanitizeSubscriptions(subscriptions), total });
  } catch (error) {
    if (handleAreaScopeError(res, error)) return;
    logger.error('Get All Email Subscriptions Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get all email subscriptions without pagination (for dropdowns, selects, etc.)
exports.getAllEmailSubscriptionsNoPagination = async (req, res) => {
  try {
    const { area_id, is_active } = req.query;
    logger.debug('Get all email subscriptions without pagination', req.query);

    let query = {};
    if (area_id) {
      query.area_id = area_id;
    }
    if (is_active !== undefined) {
      query.is_active = is_active === 'true';
    }

    const options = {
      where: query,
      attributes: EMAIL_PUBLIC_ATTRIBUTES,
      include: [getEmailInclude(req)],
      order: [['created_at', 'DESC']],
    };

    const subscriptions = await Email.findAll(options);
    res.status(200).json({ subscriptions: sanitizeSubscriptions(subscriptions) });
  } catch (error) {
    if (handleAreaScopeError(res, error)) return;
    logger.error('Get All Email Subscriptions (No Pagination) Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Stats for email subscriptions: cumulative by day/month (optimized for charts)
exports.getEmailSubscriptionStats = async (req, res) => {
  try {
    const { is_active = 'true', granularity = 'day', limit = 12 } = req.query;

    let query = {};
    if (is_active !== undefined) {
      query.is_active = is_active === 'true';
    }
    const options = {
      where: query,
      attributes: ['id', 'area_id', 'is_active', 'created_at', 'updated_at'],
      include: [getEmailInclude(req)],
      order: [['created_at', 'ASC']],
    };

    const subscriptions = await Email.findAll(options);

    // Tạo danh sách 12 ngày/tháng gần nhất TRƯỚC
    const limitNum = parseInt(limit, 10) || 12;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dateKeys = [];
    for (let i = limitNum - 1; i >= 0; i--) {
      const date = new Date(today);

      if (granularity === 'month') {
        // Lùi về i tháng trước
        date.setMonth(date.getMonth() - i);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        dateKeys.push(`${year}-${String(month).padStart(2, '0')}`);
      } else {
        // Lùi về i ngày trước
        date.setDate(date.getDate() - i);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        dateKeys.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      }
    }

    // Lấy ngày đầu tiên trong dateKeys để tính cumulative từ đầu đến đó
    const firstDateKey = dateKeys[0];
    let firstDateLimit;
    if (granularity === 'month') {
      const [year, month] = firstDateKey.split('-').map(Number);
      firstDateLimit = new Date(year, month - 1, 1); // Ngày đầu tháng
    } else {
      const [year, month, day] = firstDateKey.split('-').map(Number);
      firstDateLimit = new Date(year, month - 1, day);
    }

    // Aggregate by date based on granularity và tính cumulative
    const buckets = {};
    let cumulativeBeforeFirstDate = 0; // Cumulative từ đầu đến ngày đầu tiên trong dateKeys

    subscriptions.forEach((sub) => {
      const created = sub.created_at || sub.createdAt;
      if (!created) return;
      const d = new Date(created);
      if (Number.isNaN(d.getTime())) return;

      // Check xem subscription này có trước ngày đầu tiên trong dateKeys không
      let isBeforeFirstDate = false;
      if (granularity === 'month') {
        // So sánh theo tháng: YYYY-MM
        const subYear = d.getFullYear();
        const subMonth = d.getMonth() + 1; // getMonth() trả về 0-11, cần +1
        const subKey = `${subYear}-${String(subMonth).padStart(2, '0')}`;
        isBeforeFirstDate = subKey < firstDateKey; // So sánh string YYYY-MM
      } else {
        // So sánh theo ngày
        const subDate = new Date(d);
        subDate.setHours(0, 0, 0, 0);
        isBeforeFirstDate = subDate < firstDateLimit;
      }

      if (isBeforeFirstDate) {
        // Cộng vào cumulative từ đầu
        cumulativeBeforeFirstDate++;
      } else {
        // Aggregate vào buckets cho các ngày/tháng trong dateKeys
        let key;
        if (granularity === 'month') {
          // Group by month: YYYY-MM
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        } else {
          // Group by day: YYYY-MM-DD
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
            2,
            '0'
          )}-${String(d.getDate()).padStart(2, '0')}`;
        }
        buckets[key] = (buckets[key] || 0) + 1;
      }
    });

    // Tính cumulative cho từng dateKey, bắt đầu từ cumulativeBeforeFirstDate
    let currentCumulative = cumulativeBeforeFirstDate;
    const series = dateKeys.map((dateKey) => {
      // Check xem có dữ liệu mới trong dateKey này không
      if (buckets[dateKey] !== undefined && buckets[dateKey] > 0) {
        currentCumulative += buckets[dateKey];
      }
      // Nếu không có dữ liệu, giữ nguyên currentCumulative

      // Format date for response
      let dateStr;
      if (granularity === 'month') {
        // For monthly, use last day of month as date
        const [year, month] = dateKey.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        dateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      } else {
        // For daily, use the date key directly
        dateStr = dateKey;
      }

      return { date: dateStr, value: currentCumulative };
    });



    return res.status(200).json({
      series,
      totalSubscriptions: subscriptions.length,
      granularity,
      limit: limitNum,
    });
  } catch (error) {
    if (handleAreaScopeError(res, error)) return;
    logger.error('Get Email Subscription Stats Error:', error);
    res.status(500).json({ error: error.message });
  }
};



// Get email subscription by ID
exports.getEmailSubscriptionById = async (req, res) => {
  try {
    const { id } = req.params;

    const subscription = await findScopedSubscriptionById(id, req);

    if (!subscription) {
      return res.status(404).json({ error: 'Email subscription not found' });
    }

    res.status(200).json(sanitizeSubscription(subscription));
  } catch (error) {
    if (handleAreaScopeError(res, error)) return;
    logger.error('Get Email Subscription Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Generate OTP code
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP email
const sendOTPEmail = async (email, otpCode, areaName) => {
  const mailOptions = {
    from: process.env.EMAIL_USER || 'your-email@gmail.com',
    to: email,
    subject: 'Mã xác thực đăng ký email - Hệ thống Dự đoán Nuôi trồng Thủy sản',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Mã xác thực đăng ký email</h2>
        <p>Xin chào,</p>
        <p>Bạn đã yêu cầu đăng ký nhận thông báo dự đoán cho khu vực <strong>${areaName}</strong>.</p>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center;">
          <h3 style="margin-top: 0; color: #2c3e50;">Mã xác thực của bạn:</h3>
          <div style="font-size: 32px; font-weight: bold; color: #3498db; letter-spacing: 5px; padding: 10px;">
            ${otpCode}
          </div>
          <p style="font-size: 14px; color: #666; margin-top: 10px;">
            Mã này sẽ hết hạn sau 5 phút
          </p>
        </div>
        <p>Vui lòng nhập mã này vào form xác thực để hoàn tất đăng ký.</p>
        <p>Nếu bạn không yêu cầu đăng ký này, vui lòng bỏ qua email này.</p>
        <p>Trân trọng,<br>Hệ thống Dự đoán Nuôi trồng Thủy sản</p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
};

// Send OTP for email subscription
exports.sendOTP = async (req, res) => {
  try {
    const { email, area_id } = req.body;

    // Validate required fields
    if (!email || !area_id) {
      return res.status(400).json({
        error: 'Email and area_id are required',
      });
    }

    // Check if area exists
    const area = await Area.findByPk(area_id);
    if (!area) {
      return res.status(404).json({ error: 'Area not found' });
    }

    // Check if subscription already exists
    const existingSubscription = await Email.findOne({
      where: { email, area_id },
    });

    if (existingSubscription && existingSubscription.is_active) {
      return res.status(400).json({
        error: 'You are already subscribed to predictions for this area',
      });
    }

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Delete any existing OTP for this email and area
    await Otp.destroy({
      where: { email, area_id },
    });

    // Save OTP to database
    await Otp.create({
      email,
      area_id,
      otp_code: otpCode,
      expires_at: expiresAt,
    });

    // Send OTP email
    await sendOTPEmail(email, otpCode, area.name);

    res.status(200).json({
      message: 'OTP sent successfully',
      email: email,
      area_id: area_id,
    });
  } catch (error) {
    logger.error('Send OTP Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Verify OTP and subscribe
exports.verifyOTPAndSubscribe = async (req, res) => {
  try {
    const { email, area_id, otp_code } = req.body;

    // Validate required fields
    if (!email || !area_id || !otp_code) {
      return res.status(400).json({
        error: 'Email, area_id, and otp_code are required',
      });
    }

    // Find OTP record
    const otpRecord = await Otp.findOne({
      where: { email, area_id, otp_code, is_used: false },
    });

    if (!otpRecord) {
      return res.status(400).json({
        error: 'Invalid OTP code',
      });
    }

    // Check if OTP is expired
    if (new Date() > otpRecord.expires_at) {
      return res.status(400).json({
        error: 'OTP code has expired',
      });
    }

    // Mark OTP as used
    otpRecord.is_used = true;
    await otpRecord.save();

    // Check if subscription already exists
    const existingSubscription = await Email.findOne({
      where: { email, area_id },
    });

    if (existingSubscription) {
      if (existingSubscription.is_active) {
        return res.status(400).json({
          error: 'You are already subscribed to predictions for this area',
        });
      } else {
        // Reactivate existing subscription
        existingSubscription.is_active = true;
        await existingSubscription.save();
      }
    } else {
      // Create new subscription
      const unsubscribeToken = crypto.randomBytes(32).toString('hex');
      await Email.create({
        email,
        area_id,
        is_active: true,
        unsubscribe_token: unsubscribeToken,
      });
    }

    const subscriptionWithArea = await Email.findOne({
      where: { email, area_id },
      include: [
        {
          model: Area,
          as: 'area',
          attributes: ['id', 'name', 'area_type'],
        },
      ],
    });

    res.status(200).json({
      message: 'Successfully subscribed to prediction notifications',
      subscription: sanitizeSubscription(subscriptionWithArea),
    });
  } catch (error) {
    logger.error('Verify OTP and Subscribe Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Subscribe to prediction notifications for an area (legacy - kept for backward compatibility)
exports.subscribeToPredictions = async (req, res) => {
  try {
    const { email, area_id } = req.body;

    // Validate required fields
    if (!email || !area_id) {
      return res.status(400).json({
        error: 'Email and area_id are required',
      });
    }

    // Check if area exists
    const area = await findScopedAreaById(area_id, req);
    if (!area) {
      return res.status(404).json({ error: 'Area not found' });
    }

    // Check if subscription already exists
    const existingSubscription = await Email.findOne({
      where: { email, area_id },
    });

    if (existingSubscription) {
      if (existingSubscription.is_active) {
        return res.status(400).json({
          error: 'You are already subscribed to predictions for this area',
        });
      } else {
        // Reactivate existing subscription
        existingSubscription.is_active = true;
        await existingSubscription.save();

        const subscriptionWithArea = await Email.findOne({
          where: { id: existingSubscription.id },
          include: [
            {
              model: Area,
              as: 'area',
              attributes: ['id', 'name', 'area_type'],
            },
          ],
        });

        return res.status(200).json({
          message: 'Subscription reactivated successfully',
          subscription: sanitizeSubscription(subscriptionWithArea),
        });
      }
    }

    // Generate unsubscribe token
    const unsubscribeToken = crypto.randomBytes(32).toString('hex');

    const subscription = await Email.create({
      email,
      area_id,
      is_active: true,
      unsubscribe_token: unsubscribeToken,
    });

    const subscriptionWithArea = await Email.findOne({
      where: { id: subscription.id },
      include: [
        {
          model: Area,
          as: 'area',
          attributes: ['id', 'name', 'area_type'],
        },
      ],
    });

    res.status(201).json({
      message: 'Successfully subscribed to prediction notifications',
      subscription: sanitizeSubscription(subscriptionWithArea),
    });
  } catch (error) {
    if (handleAreaScopeError(res, error)) return;
    logger.error('Subscribe to Predictions Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update email subscription
exports.updateEmailSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, area_id, is_active } = req.body;

    const subscription = await findScopedSubscriptionById(id, req);
    if (!subscription) {
      return res.status(404).json({ error: 'Email subscription not found' });
    }

    // Check if area exists if area_id is being updated
    if (area_id) {
      const area = await findScopedAreaById(area_id, req);
      if (!area) {
        return res.status(404).json({ error: 'Area not found' });
      }
    }

    // Check for duplicate if email or area_id is being updated
    if (email || area_id) {
      const existingSubscription = await Email.findOne({
        where: {
          email: email || subscription.email,
          area_id: area_id || subscription.area_id,
          id: { [require('sequelize').Op.ne]: id },
        },
      });

      if (existingSubscription) {
        return res.status(400).json({
          error: 'Email subscription for this area already exists',
        });
      }
    }

    // Update fields
    if (email) subscription.email = email;
    if (area_id) subscription.area_id = area_id;
    if (typeof is_active === 'boolean') subscription.is_active = is_active;

    await subscription.save();

    const updatedSubscription = await Email.findOne({
      where: { id },
      attributes: EMAIL_PUBLIC_ATTRIBUTES,
      include: [getEmailInclude(req)],
    });

    res.status(200).json(sanitizeSubscription(updatedSubscription));
  } catch (error) {
    if (handleAreaScopeError(res, error)) return;
    logger.error('Update Email Subscription Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete email subscription
exports.deleteEmailSubscription = async (req, res) => {
  try {
    const { id } = req.params;

    const subscription = await Email.findOne({
      where: { id },
      include: [getEmailInclude(req)],
    });
    if (!subscription) {
      return res.status(404).json({ error: 'Email subscription not found' });
    }

    await subscription.destroy();
    res
      .status(200)
      .json({ message: 'Email subscription deleted successfully' });
  } catch (error) {
    if (handleAreaScopeError(res, error)) return;
    logger.error('Delete Email Subscription Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Send prediction notification email
exports.sendPredictionNotification = async (areaId, predictionData) => {
  try {
    // Get all active email subscriptions for this area
    const subscriptions = await Email.findAll({
      where: {
        area_id: areaId,
        is_active: true,
      },
      include: [
        {
          model: Area,
          as: 'area',
          attributes: ['id', 'name', 'area_type'],
        },
      ],
    });

    if (subscriptions.length === 0) {
      logger.info('No active email subscriptions found for area', { areaId });
      return;
    }

    const area = subscriptions[0].area;
    const baseUrl = FRONTEND_BASE_URL;

    // Email content
    const isBatchPrediction = predictionData.batchPrediction;
    const subject = isBatchPrediction
      ? `Dự đoán hàng loạt mới cho khu vực: ${area.name}`
      : `Dự đoán mới cho khu vực: ${area.name}`;

    // Send emails to all subscribers
    const emailPromises = subscriptions.map((subscription) => {
      const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">${isBatchPrediction ? 'Thông báo dự đoán hàng loạt mới' : 'Thông báo dự đoán mới'}</h2>
        <p>Xin chào,</p>
        <p>${isBatchPrediction ? 'Có dự đoán hàng loạt mới' : 'Có dự đoán mới'} cho khu vực <strong>${area.name}</strong> (${area.area_type
        }).</p>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Thông tin dự đoán:</h3>
          <p><strong>Khu vực:</strong> ${area.name}</p>
          <p><strong>Loại khu vực:</strong> ${area.area_type}</p>
          ${isBatchPrediction ? `
          <p><strong>Số lượng dự đoán:</strong> ${predictionData.predictionCount || 'Nhiều'}</p>
          <p><strong>Mô tả:</strong> ${predictionData.result || 'Đã tạo dự đoán hàng loạt'}</p>
          ` : `
          <p><strong>Kết quả dự đoán:</strong> ${resultConvert(predictionData.result) || 'Đang xử lý'
        }</p>
          `}
          <p><strong>Thời gian:</strong> ${new Date().toLocaleString(
          'vi-VN'
        )}</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
              <a href="${baseUrl}/interactive-map?areaId=${areaId}&lat=${area.latitude}&lon=${area.longitude}&zoom=15" 
             style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            ${isBatchPrediction ? 'Xem danh sách dự đoán' : 'Xem chi tiết dự đoán'}
          </a>
        </div>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #666;">
          Bạn nhận được email này vì đã đăng ký nhận thông báo dự đoán cho khu vực ${area.name
        }.<br>
            <a href="${baseUrl}/unsubscribe/${subscription.unsubscribe_token}" 
             style="color: #e74c3c;">Hủy đăng ký nhận thông báo</a>
        </p>
        <p>Trân trọng,<br>Hệ thống Dự đoán Nuôi trồng Thủy sản</p>
      </div>
    `;

      const mailOptions = {
        from: process.env.EMAIL_USER || 'your-email@gmail.com',
        to: subscription.email,
        subject: subject,
        html: htmlContent,
      };

      return transporter.sendMail(mailOptions);
    });

    await Promise.all(emailPromises);
    logger.info('Sent prediction notification emails', {
      areaId,
      subscriptionCount: subscriptions.length,
    });
  } catch (error) {
    logger.error('Send Prediction Notification Error:', error);
    throw error;
  }
};

// Unsubscribe from prediction notifications
exports.unsubscribeFromPredictions = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
      logger.warn('Invalid unsubscribe token format', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      return res.status(400).json({ error: 'Unsubscribe token is required' });
    }

    const tokenHash = hashTokenForAudit(token);
    const subscription = await Email.findOne({
      where: { unsubscribe_token: token },
      include: [
        {
          model: Area,
          as: 'area',
          attributes: ['id', 'name', 'area_type'],
        },
      ],
    });

    if (!subscription) {
      logger.warn('Unsubscribe token not found', {
        tokenHash,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      return res.status(404).json({ error: 'Invalid unsubscribe token' });
    }

    if (!subscription.is_active) {
      logger.info('Unsubscribe token reused for inactive subscription', {
        tokenHash,
        subscriptionId: subscription.id,
        areaId: subscription.area_id,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      return res.status(400).json({
        message:
          'You are already unsubscribed from prediction notifications for this area',
        area: subscription.area,
      });
    }

    subscription.is_active = false;
    await subscription.save();

    logger.info('Subscription unsubscribed by token', {
      tokenHash,
      subscriptionId: subscription.id,
      areaId: subscription.area_id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      message: 'Successfully unsubscribed from prediction notifications',
      area: subscription.area,
    });
  } catch (error) {
    logger.error('Unsubscribe Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Test email sending
exports.testEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: email,
      subject: 'Test Email - Hệ thống Dự đoán Nuôi trồng Thủy sản',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Email Test</h2>
          <p>Đây là email test từ hệ thống Dự đoán Nuôi trồng Thủy sản.</p>
          <p>Nếu bạn nhận được email này, có nghĩa là cấu hình email đã hoạt động.</p>
          <p>Trân trọng,<br>Hệ thống Dự đoán Nuôi trồng Thủy sản</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Test email sent successfully' });
  } catch (error) {
    logger.error('Test Email Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Send manual notification to selected users
exports.sendManualNotification = async (req, res) => {
  try {
    const { areaId, predictionData, selectedEmails, sendToAll = false } = req.body;

    if (!areaId || !predictionData) {
      return res.status(400).json({
        error: 'areaId and predictionData are required'
      });
    }

    // Get area information
    const area = await findScopedAreaById(areaId, req);
    if (!area) {
      return res.status(404).json({ error: 'Area not found' });
    }

    let subscriptions = [];

    if (sendToAll) {
      // Get all active email subscriptions for this area
      subscriptions = await Email.findAll({
        where: {
          area_id: areaId,
          is_active: true,
        },
        attributes: ['email', 'unsubscribe_token']
      });
    } else if (selectedEmails && selectedEmails.length > 0) {
      // Get subscriptions for selected emails
      subscriptions = await Email.findAll({
        where: {
          area_id: areaId,
          email: selectedEmails,
          is_active: true,
        },
        attributes: ['email', 'unsubscribe_token']
      });
    } else {
      return res.status(400).json({
        error: 'Either sendToAll must be true or selectedEmails must be provided'
      });
    }

    if (subscriptions.length === 0) {
      return res.status(404).json({
        error: 'No email subscriptions found for this area'
      });
    }

    const baseUrl = FRONTEND_BASE_URL;
    const subject = `Thông báo dự đoán thủ công - Khu vực: ${area.name}`;

    // Send emails to all target users
    const emailPromises = subscriptions.map((subscription) => {
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Thông báo dự đoán thủ công</h2>
          <p>Xin chào,</p>
          <p>Bạn nhận được thông báo dự đoán thủ công cho khu vực <strong>${area.name}</strong> (${area.area_type
        }).</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Thông tin dự đoán:</h3>
            <p><strong>Khu vực:</strong> ${area.name}</p>
            <p><strong>Loại khu vực:</strong> ${area.area_type}</p>
            <p><strong>Kết quả dự đoán:</strong> ${resultConvert(predictionData.result) || 'Thông tin dự đoán'
        }</p>
            <p><strong>Mô hình sử dụng:</strong> ${predictionData.model || 'Không xác định'
        }</p>
            <p><strong>Thời gian:</strong> ${new Date().toLocaleString(
          'vi-VN'
        )}</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${baseUrl}/interactive-map?areaId=${areaId}&lat=${area.latitude}&lon=${area.longitude}&zoom=15" 
               style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Xem chi tiết dự đoán
            </a>
          </div>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #666;">
            Đây là thông báo dự đoán thủ công được gửi bởi quản trị viên.<br>
            Bạn nhận được email này vì đã đăng ký nhận thông báo dự đoán cho khu vực ${area.name}.<br>
            <a href="${baseUrl}/unsubscribe/${subscription.unsubscribe_token}" 
               style="color: #e74c3c;">Hủy đăng ký nhận thông báo</a>
          </p>
          <p>Trân trọng,<br>Hệ thống Dự đoán Nuôi trồng Thủy sản</p>
        </div>
      `;

      const mailOptions = {
        from: process.env.EMAIL_USER || 'your-email@gmail.com',
        to: subscription.email,
        subject: subject,
        html: htmlContent,
      };

      return transporter.sendMail(mailOptions);
    });

    await Promise.all(emailPromises);

    res.status(200).json({
      success: true,
      message: `Đã gửi thông báo thành công đến ${subscriptions.length} người dùng`,
      sentTo: subscriptions.map(sub => sub.email),
      area: {
        id: area.id,
        name: area.name,
        area_type: area.area_type
      }
    });

  } catch (error) {
    if (handleAreaScopeError(res, error)) return;
    logger.error('Send Manual Notification Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get email subscribers for an area
exports.getAreaSubscribers = async (req, res) => {
  try {
    const { areaId } = req.params;

    if (!areaId) {
      return res.status(400).json({ error: 'areaId is required' });
    }

    // Get area information
    const area = await findScopedAreaById(areaId, req);
    if (!area) {
      return res.status(404).json({ error: 'Area not found' });
    }

    // Get all active email subscriptions for this area
    const subscriptions = await Email.findAll({
      where: {
        area_id: areaId,
        is_active: true,
      },
      attributes: ['id', 'email', 'created_at'],
      order: [['created_at', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: {
        area: {
          id: area.id,
          name: area.name,
          area_type: area.area_type
        },
        subscribers: subscriptions,
        total: subscriptions.length
      }
    });

  } catch (error) {
    if (handleAreaScopeError(res, error)) return;
    logger.error('Get Area Subscribers Error:', error);
    res.status(500).json({ error: error.message });
  }
};
