const express = require('express');
const router = express.Router();
const googleDriveService = require('../services/googleDriveService');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

/**
 * @route GET /api/express/google/setup
 * @desc Initial setup - Get Google OAuth authorization URL
 * @access Public (for initial setup only)
 */
router.get('/setup', async (req, res) => {
    try {
        await googleDriveService.initialize();

        if (googleDriveService.hasValidTokens()) {
            return res.send(`
                <html>
                    <head>
                        <style>
                            body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
                            .success { color: #52c41a; font-size: 48px; }
                            h1 { color: #333; }
                            p { color: #666; }
                            .button { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #1890ff; color: white; text-decoration: none; border-radius: 4px; }
                        </style>
                    </head>
                    <body>
                        <div class="success">✅</div>
                        <h1>Already Authorized!</h1>
                        <p>Google Drive is already set up and ready to use.</p>
                        <p>You can now upload ML model files.</p>
                        <a href="/" class="button">Go to Dashboard</a>
                    </body>
                </html>
            `);
        }

        const authUrl = await googleDriveService.getAuthUrl();

        res.send(`
            <html>
                <head>
                    <style>
                        body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
                        h1 { color: #333; }
                        p { color: #666; line-height: 1.6; }
                        .button { display: inline-block; margin-top: 20px; padding: 15px 30px; background: #1890ff; color: white; text-decoration: none; border-radius: 4px; font-size: 16px; }
                        .button:hover { background: #40a9ff; }
                        .info { background: #f0f2f5; padding: 15px; border-radius: 4px; margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <h1>🔐 Google Drive Authorization</h1>
                    <p>Click the button below to authorize this application to upload files to your Google Drive.</p>
                    <div class="info">
                        <strong>⚠️ Important:</strong> You will be redirected to Google to grant permission.
                        This is a <strong>one-time setup</strong>.
                    </div>
                    <a href="${authUrl}" class="button">Authorize with Google</a>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Error generating auth URL:', error);
        res.status(500).send(`
            <html>
                <body>
                    <h1>❌ Error</h1>
                    <p>${error.message}</p>
                    <p>Please check your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env file</p>
                </body>
            </html>
        `);
    }
});

/**
 * @route GET /api/express/google/authorize
 * @desc Get Google OAuth authorization URL
 * @access Admin only
 */
router.get('/authorize', authenticate, authorize(['admin']), async (req, res) => {
    try {
        await googleDriveService.initialize();

        if (googleDriveService.hasValidTokens()) {
            return res.status(200).json({
                success: true,
                message: 'Already authorized. Tokens exist.',
                hasTokens: true,
            });
        }

        const authUrl = await googleDriveService.getAuthUrl();

        res.status(200).json({
            success: true,
            authUrl,
            message: 'Please visit this URL to authorize the application',
        });
    } catch (error) {
        console.error('Error generating auth URL:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * @route GET /api/express/google/callback
 * @desc OAuth callback to receive authorization code
 * @access Public (called by Google)
 */
router.get('/callback', async (req, res) => {
    try {
        const { code, error } = req.query;

        if (error) {
            return res.status(400).send(`
        <html>
          <body>
            <h1>❌ Authorization Failed</h1>
            <p>Error: ${error}</p>
            <p><a href="/api/express/google/authorize">Try again</a></p>
          </body>
        </html>
      `);
        }

        if (!code) {
            return res.status(400).send(`
        <html>
          <body>
            <h1>❌ No authorization code received</h1>
            <p><a href="/api/express/google/authorize">Try again</a></p>
          </body>
        </html>
      `);
        }

        await googleDriveService.initialize();
        await googleDriveService.getTokensFromCode(code);

        res.send(`
      <html>
        <head>
          <meta http-equiv="refresh" content="3;url=/" />
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            .success {
              color: #52c41a;
              font-size: 48px;
            }
            h1 {
              color: #333;
            }
            p {
              color: #666;
              line-height: 1.6;
            }
            .button {
              display: inline-block;
              margin-top: 20px;
              padding: 10px 20px;
              background: #1890ff;
              color: white;
              text-decoration: none;
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <div class="success">✅</div>
          <h1>Authorization Successful!</h1>
          <p>Google Drive has been authorized successfully.</p>
          <p>You can now upload ML model files to Google Drive.</p>
          <a href="/" class="button">Go to Dashboard</a>
        </body>
      </html>
    `);
    } catch (error) {
        console.error('Error in OAuth callback:', error);
        res.status(500).send(`
      <html>
        <body>
          <h1>❌ Error</h1>
          <p>${error.message}</p>
        </body>
      </html>
    `);
    }
});

/**
 * @route GET /api/express/google/status
 * @desc Check Google Drive authorization status
 * @access Admin only
 */
router.get('/status', authenticate, authorize(['admin']), async (req, res) => {
    try {
        await googleDriveService.initialize();
        const hasTokens = googleDriveService.hasValidTokens();

        res.status(200).json({
            success: true,
            authorized: hasTokens,
            message: hasTokens
                ? 'Google Drive is authorized and ready to use'
                : 'Need to authorize Google Drive. Visit /api/express/google/authorize',
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            authorized: false,
        });
    }
});

module.exports = router;

