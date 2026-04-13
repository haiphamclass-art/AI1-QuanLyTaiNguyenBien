const express = require('express');
const {
  login,
  updateUserById,
  getAllUser,
  getUsersPaginated,
  deactiveUser,
  createManagerUser,
  activateUser,
  deleteUser,
  getUserById,
  getCurrentUser,
  changePassword,
  getUserStats,
  checkLoginName,
  adminResetPassword,
  sendResetPasswordOTP,
  verifyOTPAndResetPassword,
  //createAdminUser,
} = require('../controllers/authController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const router = express.Router();

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: User login
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT token
 *                 role:
 *                   type: string
 *                   enum: [admin, manager, expert]
     *                 user:
     *                   type: object
     *                   properties:
     *                     id:
     *                       type: integer
     *                       description: User ID
     *                       example: 1
     *                     username:
     *                       type: string
     *                       description: Username
     *                       example: "john_doe"
     *                     email:
     *                       type: string
     *                       format: email
     *                       description: User email
     *                       example: "user@example.com"
     *                     province:
     *                       type: string
     *                       format: uuid
     *                       description: Province ID
     *                       example: "123e4567-e89b-12d3-a456-426614174000"
     *                     district:
     *                       type: string
     *                       format: uuid
     *                       description: District ID
     *                       example: "123e4567-e89b-12d3-a456-426614174001"
     *                     address:
     *                       type: string
     *                       description: User address
     *                       example: "123 Main Street, Ho Chi Minh City"
     *                     phone:
     *                       type: string
     *                       description: User phone number
     *                       example: "+84901234567"
     *                     role:
     *                       type: string
     *                       enum: [expert, admin, manager]
     *                       description: User role
     *                       example: "expert"
     *                     status:
     *                       type: string
     *                       enum: [active, inactive]
     *                       description: User status
     *                       example: "active"
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/login', login);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user information from token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 username:
 *                   type: string
 *                   example: "john_doe"
 *                 email:
 *                   type: string
 *                   format: email
 *                   example: "john@example.com"
 *                 login_name:
 *                   type: string
 *                   example: "john_doe"
 *                 role:
 *                   type: string
 *                   enum: [admin, manager, expert]
 *                   example: "expert"
 *                 status:
 *                   type: string
 *                   example: "active"
 *                 address:
 *                   type: string
 *                   example: "123 Main St"
 *                 phone:
 *                   type: string
 *                   example: "0123456789"
 *                 province:
 *                   type: integer
 *                   example: 1
 *                 district:
 *                   type: integer
 *                   example: 1
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/me', authenticate, getCurrentUser);

/**
 * @swagger
 * /auth/check-login-name:
 *   get:
 *     summary: Check if login name is available
 *     description: Check if a login name is already taken. Can exclude a user ID when updating.
 *     tags: [Authentication]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: login_name
 *         required: true
 *         schema:
 *           type: string
 *         description: Login name to check
 *         example: "john_doe"
 *       - in: query
 *         name: exclude_id
 *         required: false
 *         schema:
 *           type: string
 *         description: User ID to exclude from check (useful when updating existing user)
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available:
 *                   type: boolean
 *                   description: Whether the login name is available
 *                   example: true
 *                 message:
 *                   type: string
 *                   description: Status message
 *                   example: "Tên đăng nhập có thể sử dụng"
 *       400:
 *         description: Bad request - login_name is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/check-login-name', checkLoginName);

/**
 * @swagger
 * /auth/update/{id}:
 *   post:
 *     summary: Update user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               address:
 *                 type: string
 *               phone:
 *                 type: string
 *               province:
 *                 type: integer
 *               district:
 *                 type: integer
 *               role:
 *                 type: string
 *                 enum: [admin, manager, expert]
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
router.post('/update/:id', authenticate, authorize(['admin', 'manager']), updateUserById);

/**
 * @swagger
 * /auth:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of users per page
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, manager, expert]
 *         description: Filter by role
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/', authenticate, authorize(['admin', 'manager']), getAllUser);

/**
 * @swagger
 * /auth/paginated:
 *   get:
 *     summary: Get users with pagination
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, manager, expert]
 *         description: Filter by user role
 *       - in: query
 *         name: province
 *         schema:
 *           type: integer
 *         description: Filter by province ID
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by username
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of users per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of users to skip
 *     responses:
 *       200:
 *         description: Users retrieved successfully with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 total:
 *                   type: integer
 *                   description: Total number of users
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/paginated', authenticate, authorize(['admin', 'manager']), getUsersPaginated);

/**
 * @swagger
 * /auth/stats/summary:
 *   get:
 *     summary: Get user statistics (total users)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, manager]
 *         description: Role of the requesting user (used for filtering)
 *       - in: query
 *         name: province
 *         schema:
 *           type: integer
 *         description: Province ID (used for manager scope)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Optional search by username
 *     responses:
 *       200:
 *         description: User stats summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUsers:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get(
  '/stats/summary',
  authenticate,
  authorize(['admin', 'manager']),
  getUserStats
);

/**
 * @swagger
 * /auth/deactivate/{id}:
 *   patch:
 *     summary: Deactivate user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deactivated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
router.patch(
  '/deactivate/:id',
  authenticate,
  authorize(['admin', 'manager']),
  deactiveUser
);

/**
 * @swagger
 * /auth/activate/{id}:
 *   patch:
 *     summary: Activate user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User activated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
router.patch(
  '/activate/:id',
  authenticate,
  authorize(['admin', 'manager']),
  activateUser
);

/**
 * @swagger
 * /auth/create-user:
 *   post:
 *     summary: Create new user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - address
 *               - phone
 *               - province
 *               - role
 *             properties:
 *               name:
 *                 type: string
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john@example.com"
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: "password123"
 *               address:
 *                 type: string
 *                 example: "123 Main St"
 *               phone:
 *                 type: string
 *                 example: "0123456789"
 *               province:
 *                 type: integer
 *                 example: 1
 *               district:
 *                 type: integer
 *                 example: 1
 *               role:
 *                 type: string
 *                 enum: [admin, manager, expert]
 *                 example: "expert"
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post(
  '/create-user',
  authenticate,
  authorize(['admin']),
  createManagerUser
);

/**
 * @swagger
 * /auth/user/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get('/user/:id', authenticate, getUserById);

/**
 * @swagger
 * /auth/delete/{id}:
 *   delete:
 *     summary: Delete user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
router.delete(
  '/delete/:id',
  authenticate,
  authorize(['admin']), // chỉ admin mới được phép
  deleteUser
);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change current user's password (requires old password)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - oldPassword
 *               - newPassword
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 example: "oldpassword123"
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 example: "newpassword123"
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized - Invalid old password
 */
router.post('/change-password', authenticate, changePassword);

/**
 * @swagger
 * /auth/admin-reset-password/{id}:
 *   post:
 *     summary: Admin force reset password for a user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Target User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 example: "newpassword123"
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Bad request
 *       403:
 *         description: Forbidden - Cannot reset admin password
 *       404:
 *         description: User not found
 */
router.post(
  '/admin-reset-password/:id',
  authenticate,
  authorize(['admin']),
  adminResetPassword
);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset OTP (Forgot Password)
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: OTP sent to email if user exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Mã OTP đã được gửi đến email của bạn"
 *                 email:
 *                   type: string
 *                   example: "user@example.com"
 *       500:
 *         description: Server error
 */
router.post('/forgot-password', sendResetPasswordOTP);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Verify OTP and reset password
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp_code
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               otp_code:
 *                 type: string
 *                 example: "123456"
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 example: "newpassword123"
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Invalid or expired OTP
 *       404:
 *         description: User not found
 */
router.post('/reset-password', verifyOTPAndResetPassword);

module.exports = router;
