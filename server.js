
const express = require('express');
const cors = require('cors');
const path = require('path');

const { sql, poolPromise } = require('./db');
const authRoutes = require('./auth');
const qualityCheckRoutes = require('./Quality_Check');
const foodListingRoutes = require('./Food_Listing');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Frontend
app.use(express.static('public'));

// Authentication Routes
app.use('/api/auth', authRoutes);

// Quality Check Routes
app.use('/api/quality-check', qualityCheckRoutes);

// Food Listing Routes
app.use('/api/food-listing', foodListingRoutes);

// Test Database Connection
app.get('/api/test-db', async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request().query(
            'SELECT DB_NAME() AS DatabaseName'
        );

        res.json({
            success: true,
            message: 'Database connected successfully!',
            database: result.recordset[0].DatabaseName
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            message: 'Database connection failed'
        });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Waste2Worth server running at http://localhost:${PORT}`);
});
