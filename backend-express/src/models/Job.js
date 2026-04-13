const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Job = sequelize.define('Job', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: 'Job type: csv-import, xlsx-import, area-xlsx-import, prediction-export',
    },
    state: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'created',
        comment: 'Job state: created, active, completed, failed, cancelled',
    },
    data: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Job input data (filters, file info, etc.)',
    },
    output: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Job output/result data',
    },
    error: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Error message if job failed',
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id',
        },
        comment: 'User who created the job',
    },
    started_on: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    completed_on: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    tableName: 'jobs',
    timestamps: true,
    createdAt: 'created_on',
    updatedAt: 'updated_on',
    indexes: [
        { fields: ['name'] },
        { fields: ['state'] },
        { fields: ['user_id'] },
        { fields: ['created_on'] },
    ],
});

Job.associate = (models) => {
    Job.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'User',
    });
};

module.exports = Job;

