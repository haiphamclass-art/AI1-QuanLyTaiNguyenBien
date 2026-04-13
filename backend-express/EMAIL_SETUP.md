# Email Notification System Setup

This document explains how to set up the email notification system for prediction notifications.

## Features

- Subscribe to receive notifications when new predictions are made for specific areas
- Automatic email notifications when predictions are created
- Unsubscribe functionality via email links
- Manage email subscriptions (admin only)
- Test email functionality
- Modern UI using Ant Design components

## Environment Variables

Add the following environment variables to your `.env` file:

```env
# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

### Gmail Setup

1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security > 2-Step Verification > App passwords
   - Generate a new app password for "Mail"
3. Use the generated password as `EMAIL_PASS`

## Database Migration

Run the migration to create the email subscriptions table:

```bash
npx sequelize-cli db:migrate
```

## API Endpoints

### Email Subscriptions

- `GET /api/express/emails` - Get all email subscriptions (Admin only)
- `GET /api/express/emails/:id` - Get email subscription by ID (Admin only)
- `POST /api/express/emails/subscribe` - Subscribe to prediction notifications (Public)
- `GET /api/express/emails/unsubscribe/:token` - Unsubscribe from notifications (Public)
- `PUT /api/express/emails/:id` - Update email subscription (Admin/Manager)
- `DELETE /api/express/emails/:id` - Delete email subscription (Admin only)
- `POST /api/express/emails/test` - Test email sending (Admin only)

### Request/Response Examples

#### Subscribe to Predictions

```json
POST /api/express/emails/subscribe
{
  "email": "user@example.com",
  "area_id": 1
}
```

Response:

```json
{
  "message": "Successfully subscribed to prediction notifications",
  "subscription": {
    "id": 1,
    "email": "user@example.com",
    "area_id": 1,
    "is_active": true,
    "area": {
      "id": 1,
      "name": "Area Name",
      "area_type": "oyster"
    }
  }
}
```

#### Unsubscribe from Predictions

```
GET /api/express/emails/unsubscribe/abc123token
```

Response:

```json
{
  "message": "Successfully unsubscribed from prediction notifications",
  "area": {
    "id": 1,
    "name": "Area Name",
    "area_type": "oyster"
  }
}
```

#### Test Email

```json
POST /api/express/emails/test
{
  "email": "test@example.com"
}
```

## Automatic Notifications

The system automatically sends email notifications when:

1. **New Prediction**: When a new prediction is created for an area
2. **Prediction Results**: Includes prediction result and model used
3. **Unsubscribe Link**: Each email contains a link to unsubscribe

### Email Template

The notification emails include:

- Area name and type
- Prediction result and model used
- Link to view prediction details
- Unsubscribe link for easy opt-out
- Professional HTML formatting
- Vietnamese language support

## Error Handling

- Email sending failures are logged but don't interrupt the main operations
- Duplicate email-area pairs are prevented
- Invalid email formats are validated
- Missing required fields return appropriate error messages

## Security

- Email routes require authentication
- Different authorization levels for different operations
- Email credentials are stored in environment variables
- Input validation and sanitization

## Frontend Components

### EmailSubscription

- Simple form for users to subscribe to prediction notifications
- Built with Ant Design components (Card, Form, Input, Button, Alert)
- Email validation and error handling
- Success/error feedback

### UnsubscribePage

- Handles unsubscribe requests via token
- Modern UI with Ant Design Result component
- Loading states and error handling
- Area information display

### EmailList (Admin)

- Table view of all email subscriptions
- CRUD operations for managing subscriptions
- Pagination and search functionality
- Modal forms for editing

### TestEmail (Admin)

- Test email sending functionality
- Form validation and feedback
- Helpful instructions for troubleshooting

## Troubleshooting

1. **Email not sending**: Check your email credentials and app password
2. **Database errors**: Ensure the migration has been run
3. **Authentication errors**: Verify JWT token and user permissions
4. **Duplicate subscriptions**: The system prevents duplicate email-area pairs
5. **UI issues**: Ensure Ant Design is properly installed and imported
