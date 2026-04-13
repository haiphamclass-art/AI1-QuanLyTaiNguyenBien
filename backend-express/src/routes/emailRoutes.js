const express = require('express');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const {
  getAllEmailSubscriptions,
  getAllEmailSubscriptionsNoPagination,
  getEmailSubscriptionById,
  subscribeToPredictions,
  updateEmailSubscription,
  deleteEmailSubscription,
  unsubscribeFromPredictions,
  testEmail,
  sendOTP,
  verifyOTPAndSubscribe,
  sendManualNotification,
  getAreaSubscribers,
  getEmailSubscriptionStats,
} = require('../controllers/emailController');

const router = express.Router();

/**
 * @swagger
 * /emails:
 *   get:
 *     summary: Get all email subscriptions (Admin/Manager only)
 *     tags: [Emails]
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
 *         description: Number of subscriptions per page
 *       - in: query
 *         name: area_id
 *         schema:
 *           type: integer
 *         description: Filter by area ID
 *     responses:
 *       200:
 *         description: List of email subscriptions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
     *                 subscriptions:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       id:
     *                         type: integer
     *                         description: Subscription ID
     *                         example: 1
     *                       email:
     *                         type: string
     *                         format: email
     *                         description: Subscriber email address
     *                         example: "subscriber@example.com"
     *                       area_id:
     *                         type: integer
     *                         description: Area ID for subscription
     *                         example: 1
     *                       is_active:
     *                         type: boolean
     *                         description: Subscription status
     *                         example: true
     *                       unsubscribe_token:
     *                         type: string
     *                         description: Unique unsubscribe token
     *                         example: "abc123def456ghi789"
     *                       created_at:
     *                         type: string
     *                         format: date-time
     *                         description: Subscription creation time
     *                         example: "2024-01-01T00:00:00Z"
     *                       updated_at:
     *                         type: string
     *                         format: date-time
     *                         description: Last update time
     *                         example: "2024-01-01T00:00:00Z"
 *                 total:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/', authenticate, authorize(['admin', 'manager']), getAllEmailSubscriptions);
router.get('/all', authenticate, authorize(['admin', 'manager']), getAllEmailSubscriptionsNoPagination);

/**
 * @swagger
 * /emails/stats/subscriptions:
 *   get:
 *     summary: Get email subscription statistics (cumulative by day)
 *     tags: [Emails]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Filter by subscription active status
 *     responses:
 *       200:
 *         description: Email subscription stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 series:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         example: "2024-01-01"
 *                       value:
 *                         type: integer
 *                 totalSubscriptions:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get(
  '/stats/subscriptions',
  authenticate,
  authorize(['admin', 'manager']),
  getEmailSubscriptionStats
);

/**
 * @swagger
 * /emails/{id}:
 *   get:
 *     summary: Get email subscription by ID (Admin only)
 *     tags: [Emails]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Subscription ID
 *     responses:
 *       200:
 *         description: Email subscription details
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 id:
     *                   type: integer
     *                   description: Subscription ID
     *                   example: 1
     *                 email:
     *                   type: string
     *                   format: email
     *                   description: Subscriber email address
     *                   example: "subscriber@example.com"
     *                 area_id:
     *                   type: integer
     *                   description: Area ID for subscription
     *                   example: 1
     *                 is_active:
     *                   type: boolean
     *                   description: Subscription status
     *                   example: true
     *                 unsubscribe_token:
     *                   type: string
     *                   description: Unique unsubscribe token
     *                   example: "abc123def456ghi789"
     *                 created_at:
     *                   type: string
     *                   format: date-time
     *                   description: Subscription creation time
     *                   example: "2024-01-01T00:00:00Z"
     *                 updated_at:
     *                   type: string
     *                   format: date-time
     *                   description: Last update time
     *                   example: "2024-01-01T00:00:00Z"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Subscription not found
 */
router.get(
  '/:id',
  authenticate,
  authorize(['admin', 'manager']),
  getEmailSubscriptionById
);

/**
 * @swagger
 * /emails/send-otp:
 *   post:
 *     summary: Send OTP for email subscription
 *     tags: [Emails]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - area_id
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               area_id:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.post('/send-otp', sendOTP);

/**
 * @swagger
 * /emails/verify-otp:
 *   post:
 *     summary: Verify OTP and subscribe to notifications
 *     tags: [Emails]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *               - area_id
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *               area_id:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Successfully subscribed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Invalid OTP or bad request
 *       500:
 *         description: Server error
 */
router.post('/verify-otp', verifyOTPAndSubscribe);

/**
 * @swagger
 * /emails/subscribe:
 *   post:
 *     summary: Subscribe to prediction notifications (Legacy endpoint)
 *     tags: [Emails]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - area_id
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               area_id:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Successfully subscribed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.post('/subscribe', subscribeToPredictions);

/**
 * @swagger
 * /emails/unsubscribe/{token}:
 *   get:
 *     summary: Unsubscribe from prediction notifications
 *     tags: [Emails]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Unsubscribe token
 *     responses:
 *       200:
 *         description: Successfully unsubscribed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Invalid token
 *       404:
 *         description: Subscription not found
 */
router.get('/unsubscribe/:token', unsubscribeFromPredictions);

/**
 * @swagger
 * /emails/{id}:
 *   put:
 *     summary: Update email subscription
 *     tags: [Emails]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Subscription ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               area_id:
 *                 type: integer
 *               is_verified:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Subscription updated successfully
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
 *       404:
 *         description: Subscription not found
 */
router.put(
  '/:id',
  authenticate,
  authorize(['admin', 'manager']),
  updateEmailSubscription
);

/**
 * @swagger
 * /emails/{id}:
 *   delete:
 *     summary: Delete email subscription (Admin only)
 *     tags: [Emails]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Subscription ID
 *     responses:
 *       200:
 *         description: Subscription deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Subscription not found
 */
router.delete(
  '/:id',
  authenticate,
  authorize(['admin', 'manager']),
  deleteEmailSubscription
);

/**
 * @swagger
 * /emails/test:
 *   post:
 *     summary: Test email sending (Admin only)
 *     tags: [Emails]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - subject
 *               - content
 *             properties:
 *               to:
 *                 type: string
 *                 format: email
 *                 example: "test@example.com"
 *               subject:
 *                 type: string
 *                 example: "Test Email"
 *               content:
 *                 type: string
 *                 example: "This is a test email"
 *     responses:
 *       200:
 *         description: Test email sent successfully
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
router.post('/test', authenticate, authorize(['admin', 'manager']), testEmail);

/**
 * @swagger
 * /emails/area/{areaId}/subscribers:
 *   get:
 *     summary: Get email subscribers for an area
 *     tags: [Emails]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: areaId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Area ID
 *     responses:
 *       200:
 *         description: List of subscribers for the area
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/EmailSubscription'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Area not found
 */
router.get('/area/:areaId/subscribers', authenticate, authorize(['admin', 'manager']), getAreaSubscribers);

/**
 * @swagger
 * /emails/send-manual:
 *   post:
 *     summary: Send manual notification
 *     tags: [Emails]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - area_id
 *               - subject
 *               - content
 *             properties:
 *               area_id:
 *                 type: integer
 *                 example: 1
 *               subject:
 *                 type: string
 *                 example: "Thông báo quan trọng"
 *               content:
 *                 type: string
 *                 example: "Nội dung thông báo"
 *     responses:
 *       200:
 *         description: Manual notification sent successfully
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
router.post('/send-manual', authenticate, authorize(['admin', 'manager']), sendManualNotification);

module.exports = router;
