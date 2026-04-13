require('dotenv').config();
const { User } = require('../models');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const logger = require('../config/logger');
const EMAIL_USER = process.env.EMAIL_USER || 'your-email@gmail.com';
const EMAIL_PASSWORD = (process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD || 'your-app-password')
  .replace(/\s+/g, '');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { [Op.or]: [{ email: email }, { login_name: email }] } });
    if (!user)
      return res.status(401).json({ error: 'Invalid credentials' });
    if (!await bcrypt.compare(password, user.password))
      return res.status(401).json({ error: 'Mật khẩu không chính xác' });

    if (user.status === 'inactivate')
      return res.status(403).json({ error: 'Your account is deactivated' });
    const token = jwt.sign(
      {
        id: user.id,
        name: user.username || user.name,
        role: user.role,
        province: user.province,
        district: user.district,
      },
      'SECRET_KEY',
      { expiresIn: '10d' }
    );

    res.status(200).json({ token, role: user.role });
  } catch (error) {
    logger.error('Login Error:', {
      message: error.message,
      stack: error.stack,
      email: req.body.email,
    });
    res.status(500).json({ error: error.message });
  }
};

exports.createManagerUser = async (req, res) => {
  try {
    const {
      name,
      login_name,
      email,
      password,
      address = null,
      phone = null,
      province,
      district,
      role,
    } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate login_name if provided
    if (login_name && !/^[a-zA-Z0-9_]+$/.test(login_name)) {
      return res.status(400).json({ error: 'Login name can only contain letters, numbers and underscores' });
    }

    // Validate district requirement for expert role
    if (role === 'expert' && !district) {
      return res
        .status(400)
        .json({ error: 'District is required for expert role' });
    }

    // Validate province/district relationship
    if (province) {
      const provinceObj = await require('../models').Province.findOne({ where: { id: province } });
      if (!provinceObj) return res.status(400).json({ error: 'Province not found' });
    }
    if (district) {
      const districtObj = await require('../models').District.findOne({ where: { id: district } });
      if (!districtObj) return res.status(400).json({ error: 'District not found' });
      if (province && String(districtObj.province_id) !== String(province)) {
        return res.status(400).json({ error: 'District does not belong to the selected province' });
      }
    }

    // Check if email already exists
    const emailExists = await User.findOne({ where: { email } });
    if (emailExists) return res.status(403).json({ error: 'Email already exists' });

    // Check if login_name already exists
    if (login_name) {
      const loginNameExists = await User.findOne({ where: { login_name } });
      if (loginNameExists) return res.status(403).json({ error: 'Login name already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Determine login_name: use provided value, or fallback to email prefix
    const finalLoginName = login_name || email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    let dupCount = 0;
    while (await User.findOne({ where: { login_name: finalLoginName } })) {
      dupCount++;
      finalLoginName = `${finalLoginName}${dupCount}`;
    }
    const user = await User.create({
      username: name || email.split('@')[0],
      login_name: finalLoginName,
      email: email,
      password: hashedPassword,
      address,
      phone,
      province: province || null,
      district: district || null,
      status: 'active',
      role: role || 'expert',
    });
    return res.status(200).json({ message: 'Register successful' });
  } catch (error) {
    logger.error('Create Manager User Error:', {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.checkLoginName = async (req, res) => {
  try {
    const { login_name, exclude_id } = req.query;

    if (!login_name || login_name.trim() === '') {
      return res.status(400).json({ error: 'login_name is required' });
    }

    // Build where condition
    const whereCondition = {
      login_name: login_name.trim(),
    };

    // Exclude current user when updating (if exclude_id is provided)
    if (exclude_id) {
      whereCondition.id = { [Op.ne]: exclude_id };
    }

    const existingUser = await User.findOne({ where: whereCondition });

    const minLength = 3;
    const isMinLength = login_name.length >= minLength;
    return res.status(200).json({
      available: !existingUser && isMinLength,
      message: existingUser ? 'Tên đăng nhập đã được sử dụng' : isMinLength ? 'Tên đăng nhập có thể sử dụng' : 'Tên đăng nhập phải có ít nhất 3 ký tự'
    });
  } catch (error) {
    logger.error('Check Login Name Error:', {
      message: error.message,
      stack: error.stack,
      login_name: req.query.login_name,
      exclude_id: req.query.exclude_id,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getAllUser = async (req, res) => {
  try {
    const { role, province, search = null } = req.query;
    logger.log(req.query);

    let whereCondition = {};
    if (role === 'manager') {
      whereCondition = {
        role: role,
        province: province,
        district: {
          [Op.ne]: null, // Ensure district is not null
        },
      };
    }
    if (search) {
      whereCondition.username = {
        [Op.iLike]: `%${search}%`,
      };
    }
    const userList = await User.findAll({
      where: whereCondition,
      order: [['id', 'ASC']],
    });
    return res.status(200).json({ data: userList });
  } catch (error) {
    logger.error('Get All Users Error:', {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Get users with pagination (for tables, lists)
exports.getUsersPaginated = async (req, res) => {
  try {
    const { role, province, search = null, limit = 10, offset = 0 } = req.query;
    logger.log(req.query);

    let whereCondition = {};
    if (role === 'manager') {
      whereCondition = {
        role: role,
        province: province,
        district: {
          [Op.ne]: null, // Ensure district is not null
        },
      };
    }
    if (search) {
      whereCondition.username = {
        [Op.iLike]: `%${search}%`,
      };
    }

    const options = {
      where: whereCondition,
      order: [['id', 'ASC']],
    };

    // Add pagination
    if (limit) {
      options.limit = parseInt(limit, 10);
    }
    if (offset) {
      options.offset = parseInt(offset, 10);
    }

    const userList = await User.findAll(options);
    const total = await User.count({ where: whereCondition });

    return res.status(200).json({
      users: userList,
      total: total
    });
  } catch (error) {
    logger.error('Get Users Paginated Error:', {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Stats for users: total users within current manager scope
exports.getUserStats = async (req, res) => {
  try {
    const { role, province, search = null } = req.query;

    let whereCondition = {};

    // Admin sees all users, no filter
    // Manager only sees users within their province
    if (role === 'manager') {
      whereCondition = {
        role: role,
        province: province,
        district: {
          [Op.ne]: null,
        },
      };
    }
    // For admin, whereCondition remains empty = all users

    if (search) {
      whereCondition.username = {
        [Op.iLike]: `%${search}%`,
      };
    }

    const total = await User.count({ where: whereCondition });

    return res.status(200).json({
      totalUsers: total,
    });
  } catch (error) {
    logger.error('Get User Stats Error:', {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.deactiveUser = async (req, res) => {
  try {
    const { id } = req.params;
    logger.log('Deactivating user with ID:', id);

    const user = await User.findOne({ where: { id: id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Managers can only deactivate users within their province and not admins
    if (req.user.role === 'manager') {
      if (user.role === 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (user.province !== req.user.province) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    user.status = 'inactive';
    await user.save();
    return res
      .status(200)
      .json({ message: `User ${user.username} is deactivated` });
  } catch (error) {
    logger.error('Deactivate User Error:', {
      message: error.message,
      stack: error.stack,
      userId: req.params.id,
    });
    return res.status(500).json({ error: error.message });
  }
};

exports.activateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findOne({ where: { id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Managers can only activate users within their province and not admins
    if (req.user.role === 'manager') {
      if (user.role === 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (user.province !== req.user.province) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    user.status = 'active';
    await user.save();
    return res
      .status(200)
      .json({ message: `User ${user.username} is activated` });
  } catch (error) {
    logger.error('Activate User Error:', {
      message: error.message,
      stack: error.stack,
      userId: req.params.id,
    });
    return res.status(500).json({ error: error.message });
  }
};

exports.updateUserById = async (req, res) => {
  try {
    const { id } = req.params;
    logger.log('Updating user with ID:', id, 'Data:', req.body);

    const {
      name = null,
      login_name = null,
      address = null,
      phone = null,
      province = null,
      district = null,
      email = null,
      role = null,
    } = req.body;
    const user = await User.findOne({ where: { id: id } });
    if (!user) res.status(404).json({ message: 'User not found' });

    // Managers can only update users within their province and cannot modify admins
    if (req.user.role === 'manager') {
      if (user.role === 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (user.province !== req.user.province) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      // Prevent managers from changing a user's province outside their own
      if (province && province !== req.user.province) {
        return res.status(400).json({ error: 'Managers cannot assign other provinces' });
      }
    }

    // Validate login_name if provided
    if (login_name && !/^[a-zA-Z0-9_]+$/.test(login_name)) {
      return res.status(400).json({ error: 'Login name can only contain letters, numbers and underscores' });
    }

    // Check if login_name is being changed and already exists
    if (login_name && login_name !== user.login_name) {
      const loginNameExists = await User.findOne({ where: { login_name, id: { [Op.ne]: id } } });
      if (loginNameExists) {
        return res.status(403).json({ error: 'Login name already exists' });
      }
    }

    // Check if email is being changed and already exists
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ where: { email, id: { [Op.ne]: id } } });
      if (emailExists) {
        return res.status(403).json({ error: 'Email already exists' });
      }
    }

    // Validate province/district relationship if provided
    if (province) {
      const provinceObj = await require('../models').Province.findOne({ where: { id: province } });
      if (!provinceObj) return res.status(400).json({ error: 'Province not found' });
    }
    if (district) {
      const districtObj = await require('../models').District.findOne({ where: { id: district } });
      if (!districtObj) return res.status(400).json({ error: 'District not found' });
      const effectiveProvince = province || user.province;
      if (effectiveProvince && String(districtObj.province_id) !== String(effectiveProvince)) {
        return res.status(400).json({ error: 'District does not belong to the selected province' });
      }
    }

    user.username = name ? name : user.username;
    user.login_name = login_name ? login_name : user.login_name;
    user.address = address ? address : user.address;
    user.phone = phone ? phone : user.phone;
    user.province = province ? province : user.province;
    user.district = district ? district : user.district;
    user.email = email ? email : user.email;
    user.role = role ? role : user.role;

    await user.save();
    return res.status(200).json({ message: 'Update successful' });
  } catch (error) {
    logger.error('Update User Error:', {
      message: error.message,
      stack: error.stack,
      userId: req.params.id,
      updateData: req.body,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    logger.log('Deleting user with ID:', id);

    // Tìm xem user có tồn tại không
    const user = await User.findOne({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Xóa hẳn user. Nếu bạn chỉ muốn "soft-delete", có thể dùng user.update({ status: 'deleted' }, ...) thay thế
    await user.destroy();

    return res
      .status(200)
      .json({ message: `User ${user.username} has been deleted` });
  } catch (error) {
    logger.error('Delete User Error:', {
      message: error.message,
      stack: error.stack,
      userId: req.params.id,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findOne({ where: { id } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove sensitive information
    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      address: user.address,
      phone: user.phone,
      province: user.province,
      district: user.district,
      login_name: user.login_name,
    };

    return res.status(200).json(userData);
  } catch (error) {
    logger.error('Get User Error:', {
      message: error.message,
      stack: error.stack,
      userId: req.params.id,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Get current user info from token
exports.getCurrentUser = async (req, res) => {
  try {
    // req.user comes from authenticate middleware (decoded from token)
    const userId = req.user.id;
    
    const user = await User.findOne({ 
      where: { id: userId },
      attributes: { exclude: ['password'] } // Exclude password field
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return user data without sensitive information
    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      address: user.address,
      phone: user.phone,
      province: user.province,
      district: user.district,
      login_name: user.login_name,
    };

    return res.status(200).json(userData);
  } catch (error) {
    logger.error('Get Current User Error:', {
      message: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    // Lấy user từ req.user (authenticate middleware) thay vì từ params
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    const user = await User.findOne({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Mật khẩu cũ không đúng' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    logger.info('Password changed successfully', { userId });
    return res.status(200).json({ message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    logger.error('Change Password Error:', {
      message: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Admin force reset password cho user khác
exports.adminResetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'Mật khẩu mới là bắt buộc' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    const user = await User.findOne({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Admin không thể reset password của admin khác (trừ chính mình)
    if (user.role === 'admin' && user.id !== req.user.id) {
      return res.status(403).json({ error: 'Không thể đặt lại mật khẩu của admin khác' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    logger.info('Admin reset password successfully', {
      adminId: req.user.id,
      targetUserId: id,
      targetUsername: user.username
    });

    return res.status(200).json({
      message: `Đã đặt lại mật khẩu cho người dùng ${user.username} thành công`
    });
  } catch (error) {
    logger.error('Admin Reset Password Error:', {
      message: error.message,
      stack: error.stack,
      adminId: req.user?.id,
      targetUserId: req.params.id,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Gửi OTP để reset password (quên mật khẩu)
exports.sendResetPasswordOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email là bắt buộc' });
    }

    // Tìm user với email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Không tiết lộ user có tồn tại hay không vì lý do bảo mật
      return res.status(200).json({
        message: 'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được mã OTP'
      });
    }

    // Import Otp model
    const { Otp } = require('../models');
    const nodemailer = require('nodemailer');

    // Generate OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 phút

    // Xóa OTP cũ cho email này (loại reset_password)
    await Otp.destroy({
      where: {
        email,
        area_id: 0 // Sử dụng area_id = 0 để đánh dấu đây là OTP reset password
      },
    });

    // Lưu OTP mới
    await Otp.create({
      email,
      area_id: 0, // 0 = reset password OTP
      otp_code: otpCode,
      expires_at: expiresAt,
      is_used: false,
    });

    // Gửi email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD,
      },
    });
    const mailOptions = {
      from: EMAIL_USER,
      to: email,
      subject: 'Mã xác thực đặt lại mật khẩu - Hệ thống Dự đoán Nuôi trồng Thủy sản',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Đặt lại mật khẩu</h2>
          <p>Xin chào <strong>${user.username}</strong>,</p>
          <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản của mình.</p>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center;">
            <h3 style="margin-top: 0; color: #2c3e50;">Mã xác thực của bạn:</h3>
            <div style="font-size: 32px; font-weight: bold; color: #e74c3c; letter-spacing: 5px; padding: 10px;">
              ${otpCode}
            </div>
            <p style="font-size: 14px; color: #666; margin-top: 10px;">
              Mã này sẽ hết hạn sau 10 phút
            </p>
          </div>
          <p>Vui lòng nhập mã này vào form đặt lại mật khẩu để tiếp tục.</p>
          <p style="color: #e74c3c;"><strong>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này và đảm bảo tài khoản của bạn an toàn.</strong></p>
          <p>Trân trọng,<br>Hệ thống Dự đoán Nuôi trồng Thủy sản</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);


    return res.status(200).json({
      message: 'Mã OTP đã được gửi đến email của bạn',
      email: email
    });
  } catch (error) {
    logger.error('Send Reset Password OTP Error:', {
      message: error.message,
      stack: error.stack,
      email: req.body.email,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Xác thực OTP và đặt lại mật khẩu
exports.verifyOTPAndResetPassword = async (req, res) => {
  try {
    const { email, otp_code, newPassword } = req.body;

    if (!email || !otp_code || !newPassword) {
      return res.status(400).json({ error: 'Email, mã OTP và mật khẩu mới là bắt buộc' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    // Import Otp model
    const { Otp } = require('../models');

    // Tìm OTP record
    const otpRecord = await Otp.findOne({
      where: {
        email,
        area_id: 0, // Reset password OTP
        otp_code,
        is_used: false
      },
    });

    if (!otpRecord) {
      return res.status(400).json({ error: 'Mã OTP không hợp lệ' });
    }

    // Kiểm tra hết hạn
    if (new Date() > otpRecord.expires_at) {
      return res.status(400).json({ error: 'Mã OTP đã hết hạn' });
    }

    // Tìm user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Đánh dấu OTP đã sử dụng
    otpRecord.is_used = true;
    await otpRecord.save();

    // Cập nhật mật khẩu mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    logger.info('Password reset successfully via OTP', { userId: user.id, email });

    return res.status(200).json({
      message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập với mật khẩu mới.'
    });
  } catch (error) {
    logger.error('Verify OTP and Reset Password Error:', {
      message: error.message,
      stack: error.stack,
      email: req.body.email,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};
