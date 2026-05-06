const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const { GOOGLE_REDIRECT_URI } = require('../config/publicUrls');

/**
 * Google Drive Service for uploading ML model files
 * Uses OAuth2 Client authentication
 */

class GoogleDriveService {
  constructor() {
    this.oauth2Client = null;
    this.drive = null;
    this.folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    this.initialized = false;
    this.tokenPath = path.join(__dirname, '../../google-drive-token.json');

    // Debug logging
    console.log('=== Google Drive Service Constructor (OAuth2) ===');
    console.log('GOOGLE_DRIVE_FOLDER_ID:', this.folderId);
    console.log('Token path:', this.tokenPath);
    console.log('====================================================');
  }

  /**
   * Initialize OAuth2 Client
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      console.log('=== Google Drive Initialize (OAuth2) ===');

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = GOOGLE_REDIRECT_URI;

      console.log('Client ID exists:', !!clientId);
      console.log('Client Secret exists:', !!clientSecret);
      console.log('Redirect URI:', redirectUri);

      if (!clientId || !clientSecret) {
        throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment');
      }

      // Create OAuth2 client
      this.oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri
      );

      // Try to load saved tokens
      if (fs.existsSync(this.tokenPath)) {
        console.log('✅ Loading saved tokens from:', this.tokenPath);
        const tokens = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
        this.oauth2Client.setCredentials(tokens);
        console.log('✅ Tokens loaded successfully');
      } else {
        console.log('⚠️  No saved tokens found. Need to authorize first.');
        console.log('📝 Visit /api/express/google/authorize to get authorization URL');
      }

      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
      this.initialized = true;

      console.log('✅ Google Drive OAuth2 client initialized');
      console.log('Folder ID for upload:', this.folderId || 'root');
      console.log('======================================');

      logger.info('Google Drive OAuth2 client initialized successfully');
    } catch (error) {
      console.log('❌ Failed to initialize Google Drive OAuth2:', error.message);
      console.log('======================================');
      logger.error('Failed to initialize Google Drive OAuth2:', error);
      throw error;
    }
  }

  /**
   * Get authorization URL for user to grant access
   */
  async getAuthUrl() {
    await this.initialize();

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file'],
      prompt: 'consent', // Force to get refresh token
    });

    return authUrl;
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokensFromCode(code) {
    await this.initialize();

    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    // Save tokens to file
    fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2));
    console.log('✅ Tokens saved to:', this.tokenPath);
    logger.info('Google Drive tokens obtained and saved');

    return tokens;
  }

  /**
   * Check if we have valid tokens
   */
  hasValidTokens() {
    return fs.existsSync(this.tokenPath);
  }

  /**
   * Upload a file to Google Drive
   * @param {string} filePath - Local file path
   * @param {string} fileName - Name for the file in Google Drive
   * @param {string} mimeType - MIME type of the file
   * @returns {Promise<Object>} - Google Drive file metadata
   */
  async uploadFile(filePath, fileName, mimeType = 'application/octet-stream') {
    await this.initialize();

    try {
      console.log('=== Upload File to Google Drive ===');
      console.log('File path:', filePath);
      console.log('File name:', fileName);
      console.log('Target folder ID:', this.folderId || 'root');

      if (!this.hasValidTokens()) {
        throw new Error('Not authorized! Please visit /api/express/google/authorize first');
      }

      const fileMetadata = {
        name: fileName,
        parents: this.folderId ? [this.folderId] : [], // If no folder, upload to root
      };

      const media = {
        mimeType,
        body: fs.createReadStream(filePath),
      };

      logger.info('Uploading file to Google Drive:', { fileName, folderId: this.folderId || 'root' });

      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink, webContentLink, size',
      });

      // Make file publicly accessible (or share with specific users)
      await this.drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });

      logger.info('File uploaded to Google Drive successfully:', {
        fileId: response.data.id,
        fileName: response.data.name,
      });

      // Generate download link
      const downloadLink = `https://drive.google.com/uc?export=download&id=${response.data.id}`;

      return {
        fileId: response.data.id,
        fileName: response.data.name,
        webViewLink: response.data.webViewLink,
        downloadLink: downloadLink,
        size: response.data.size,
      };
    } catch (error) {
      logger.error('Error uploading file to Google Drive:', {
        error: error.message,
        fileName,
      });
      throw error;
    }
  }

  /**
   * Check if a file exists on Google Drive
   * @param {string} fileId - Google Drive file ID
   * @returns {Promise<boolean>} - True if file exists
   */
  async fileExists(fileId) {
    await this.initialize();

    try {
      if (!this.hasValidTokens()) {
        console.log('Not authorized to check file existence');
        return false;
      }

      const response = await this.drive.files.get({
        fileId: fileId,
        fields: 'id, name, trashed',
      });

      const exists = response.data && !response.data.trashed;
      console.log(`File ${fileId} exists:`, exists);
      return exists;
    } catch (error) {
      if (error.code === 404) {
        console.log(`File ${fileId} not found on Google Drive`);
        return false;
      }
      logger.error('Error checking file existence:', {
        error: error.message,
        fileId,
      });
      return false;
    }
  }

  /**
   * Delete a file from Google Drive
   * @param {string} fileId - Google Drive file ID
   * @returns {Promise<boolean>} - True if deleted successfully
   */
  async deleteFile(fileId) {
    await this.initialize();

    try {
      if (!this.hasValidTokens()) {
        throw new Error('Not authorized!');
      }

      // Check if file exists first
      const exists = await this.fileExists(fileId);
      if (!exists) {
        logger.warn('File not found on Google Drive, skipping deletion:', { fileId });
        return false;
      }

      await this.drive.files.delete({
        fileId: fileId,
      });

      logger.info('File deleted from Google Drive:', { fileId });
      return true;
    } catch (error) {
      logger.error('Error deleting file from Google Drive:', {
        error: error.message,
        fileId,
      });
      throw error;
    }
  }

  /**
   * Generate public download link for a file
   * @param {string} fileId - Google Drive file ID
   * @returns {string} - Public download link
   */
  generateDownloadLink(fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
}

// Export singleton instance
module.exports = new GoogleDriveService();
