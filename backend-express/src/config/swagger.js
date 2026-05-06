const swaggerJsdoc = require('swagger-jsdoc');
const { SWAGGER_SERVERS } = require('./publicUrls');
const { AUTH_COOKIE_NAME } = require('./auth');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Aquaculture Prediction System API',
            version: '1.0.0',
            description: 'API documentation for the Aquaculture Prediction System - Hệ thống dự đoán nuôi trồng thủy sản',
            contact: {
                name: 'API Support',
                email: 'support@aquaculture-prediction.com'
            },
            license: {
                name: 'MIT',
                url: 'https://opensource.org/licenses/MIT'
            }
        },
        servers: SWAGGER_SERVERS,
        components: {
            securitySchemes: {
                cookieAuth: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: AUTH_COOKIE_NAME,
                    description: 'HttpOnly authentication cookie issued by the login endpoint'
                }
            },
            schemas: {
                User: {
                    type: 'object',
                    required: ['name', 'email', 'password', 'address', 'phone', 'province', 'role'],
                    properties: {
                        id: {
                            type: 'integer',
                            description: 'User ID'
                        },
                        name: {
                            type: 'string',
                            description: 'Full name of the user'
                        },
                        email: {
                            type: 'string',
                            format: 'email',
                            description: 'User email address'
                        },
                        password: {
                            type: 'string',
                            minLength: 6,
                            description: 'User password (min 6 characters)'
                        },
                        address: {
                            type: 'string',
                            description: 'User address'
                        },
                        phone: {
                            type: 'string',
                            description: 'User phone number'
                        },
                        province: {
                            type: 'integer',
                            description: 'Province ID'
                        },
                        district: {
                            type: 'integer',
                            description: 'District ID (required for expert role)'
                        },
                        role: {
                            type: 'string',
                            enum: ['admin', 'manager', 'expert'],
                            description: 'User role'
                        },
                        status: {
                            type: 'string',
                            enum: ['active', 'inactive'],
                            description: 'User status'
                        },
                        created_at: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Creation timestamp'
                        },
                        updated_at: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Last update timestamp'
                        }
                    }
                },
                Area: {
                    type: 'object',
                    required: ['name', 'latitude', 'longitude', 'province'],
                    properties: {
                        id: {
                            type: 'integer',
                            description: 'Area ID'
                        },
                        name: {
                            type: 'string',
                            description: 'Area name'
                        },
                        latitude: {
                            type: 'number',
                            format: 'float',
                            description: 'Area latitude coordinate'
                        },
                        longitude: {
                            type: 'number',
                            format: 'float',
                            description: 'Area longitude coordinate'
                        },
                        province: {
                            type: 'integer',
                            description: 'Province ID'
                        },
                        district: {
                            type: 'integer',
                            description: 'District ID'
                        },
                        area_type: {
                            type: 'string',
                            enum: ['oyster', 'shrimp', 'fish'],
                            description: 'Type of aquaculture area'
                        },
                        created_at: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Creation timestamp'
                        },
                        updated_at: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Last update timestamp'
                        }
                    }
                },
                Prediction: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'integer',
                            description: 'Prediction ID'
                        },
                        area_id: {
                            type: 'integer',
                            description: 'Area ID'
                        },
                        prediction_date: {
                            type: 'string',
                            format: 'date',
                            description: 'Date of prediction'
                        },
                        prediction_result: {
                            type: 'string',
                            description: 'Prediction result'
                        },
                        confidence_score: {
                            type: 'number',
                            format: 'float',
                            description: 'Confidence score of prediction'
                        },
                        created_at: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Creation timestamp'
                        }
                    }
                },
                EmailSubscription: {
                    type: 'object',
                    required: ['email', 'area_id'],
                    properties: {
                        id: {
                            type: 'integer',
                            description: 'Subscription ID'
                        },
                        email: {
                            type: 'string',
                            format: 'email',
                            description: 'Subscriber email'
                        },
                        area_id: {
                            type: 'integer',
                            description: 'Area ID to subscribe to'
                        },
                        is_verified: {
                            type: 'boolean',
                            description: 'Email verification status'
                        },
                        created_at: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Subscription timestamp'
                        }
                    }
                },
                NatureElement: {
                    type: 'object',
                    required: ['name', 'category', 'unit'],
                    properties: {
                        id: {
                            type: 'integer',
                            description: 'Natural element ID'
                        },
                        name: {
                            type: 'string',
                            description: 'Name of the natural element'
                        },
                        category: {
                            type: 'string',
                            description: 'Category of the element (e.g., temperature, salinity, ph)'
                        },
                        unit: {
                            type: 'string',
                            description: 'Unit of measurement'
                        },
                        description: {
                            type: 'string',
                            description: 'Description of the natural element'
                        },
                        min_value: {
                            type: 'number',
                            format: 'float',
                            description: 'Minimum possible value'
                        },
                        max_value: {
                            type: 'number',
                            format: 'float',
                            description: 'Maximum possible value'
                        },
                        optimal_min: {
                            type: 'number',
                            format: 'float',
                            description: 'Minimum optimal value for aquaculture'
                        },
                        optimal_max: {
                            type: 'number',
                            format: 'float',
                            description: 'Maximum optimal value for aquaculture'
                        },
                        created_at: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Creation timestamp'
                        },
                        updated_at: {
                            type: 'string',
                            format: 'date-time',
                            description: 'Last update timestamp'
                        }
                    }
                },
                Error: {
                    type: 'object',
                    properties: {
                        error: {
                            type: 'string',
                            description: 'Error message'
                        },
                        message: {
                            type: 'string',
                            description: 'Error description'
                        },
                        status: {
                            type: 'integer',
                            description: 'HTTP status code'
                        }
                    }
                },
                Success: {
                    type: 'object',
                    properties: {
                        message: {
                            type: 'string',
                            description: 'Success message'
                        },
                        data: {
                            type: 'object',
                            description: 'Response data'
                        }
                    }
                }
            }
        },
        security: [
            {
                cookieAuth: []
            }
        ],
        tags: [
            {
                name: 'Authentication',
                description: 'User authentication and authorization'
            },
            {
                name: 'Users',
                description: 'User management operations'
            },
            {
                name: 'Areas',
                description: 'Aquaculture area management'
            },
            {
                name: 'Predictions',
                description: 'Prediction data operations'
            },
            {
                name: 'Emails',
                description: 'Email subscription and notification management'
            },
            {
                name: 'Nature Elements',
                description: 'Nature element data management'
            }
        ]
    },
    apis: [
        './src/routes/*.js',
        './src/controllers/*.js'
    ]
};

const specs = swaggerJsdoc(options);

module.exports = specs;
