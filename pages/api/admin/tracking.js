
const express = require('express');
const router = express.Router();
const pool = require('../../../postgresDB');

// =====================================================
// POST: Automatically record a confirmed pickup
// =====================================================
router.post('/confirm-pickup', async (req, res) => {
    try {
        const {
            pickup_id,
            type,
            actual_quantity,
            diversion_status,
            estimated_carbon_savings,
            tracking_date_time
        } = req.body;

        // 1. Validate required fields
        if (
            !pickup_id ||
            !type ||
            actual_quantity === undefined ||
            !diversion_status ||
            estimated_carbon_savings === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required pickup information.'
            });
        }

        // 2. Validate waste type
        const validTypes = ['Coffee Waste', 'Surplus Food'];

        if (!validTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid waste type.'
            });
        }

        // 3. Validate diversion status
        const validStatuses = ['Diverted', 'Not Diverted'];

        if (!validStatuses.includes(diversion_status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid diversion status.'
            });
        }

        // 4. Validate quantities
        const quantity = Number(actual_quantity);
        const carbonSavings = Number(estimated_carbon_savings);

        if (
            !Number.isFinite(quantity) ||
            quantity < 0 ||
            !Number.isFinite(carbonSavings) ||
            carbonSavings < 0
        ) {
            return res.status(400).json({
                success: false,
                message: 'Quantity and carbon savings must be valid non-negative numbers.'
            });
        }

        if (typeof pickup_id !== 'string' || !pickup_id.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pickup ID.'
            });
        }

        // 5. Automatically insert tracking record
        const query = `
            INSERT INTO tracking_report (
                type,
                actual_quantity,
                tracking_date_time,
                diversion_status,
                estimated_carbon_savings,
                pickup_id
            )
            VALUES (
                $1,
                $2,
                COALESCE($3::timestamptz, NOW()),
                $4,
                $5,
                $6
            )
            RETURNING *;
        `;

        const values = [
            type,
            quantity,
            tracking_date_time || null,
            diversion_status,
            carbonSavings,
            pickup_id.trim()
        ];

        const result = await pool.query(query, values);

        return res.status(201).json({
            success: true,
            message: 'Pickup tracking record created successfully.',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Tracking API Error:', error);

        // Duplicate pickup prevention
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                message: 'This pickup has already been recorded.'
            });
        }

        // Database validation error
        if (error.code === '23514') {
            return res.status(400).json({
                success: false,
                message: 'The tracking information violates a database validation rule.'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Unable to create tracking record.'
        });
    }
});


// =====================================================
// GET: Retrieve all tracking records
// =====================================================
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT *
            FROM tracking_report
            ORDER BY tracking_date_time DESC;
        `);

        return res.status(200).json({
            success: true,
            total_records: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        console.error('Tracking Retrieval Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to retrieve tracking records.'
        });
    }
});


// =====================================================
// GET: Retrieve one tracking record by pickup ID
// =====================================================
router.get('/pickup/:pickup_id', async (req, res) => {
    try {
        const { pickup_id } = req.params;

        const result = await pool.query(
            `SELECT * FROM tracking_report WHERE pickup_id = $1`,
            [pickup_id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tracking record not found.'
            });
        }

        return res.status(200).json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Tracking Retrieval Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to retrieve tracking record.'
        });
    }
});

module.exports = router;
