
const express = require('express');
const router = express.Router();
const pool = require('../../../postgresDB');

// Generate an analytics report manually
router.post('/generate', async (req, res) => {
    try {
        const {
            report_type,
            period_start_date,
            period_end_date,
            staff_id
        } = req.body;

        if (!report_type || !period_start_date ||
            !period_end_date || !staff_id) {
            return res.status(400).json({
                success: false,
                message: 'Please provide report type, start date, end date and staff ID.'
            });
        }

        if (period_end_date < period_start_date) {
            return res.status(400).json({
                success: false,
                message: 'End date cannot be earlier than start date.'
            });
        }

        // Calculate analytics from tracking_report
        const summary = await pool.query(
            `SELECT
                COALESCE(SUM(
                    CASE WHEN type = 'Coffee Waste'
                    THEN actual_quantity ELSE 0 END
                ), 0) AS total_coffee_waste,

                COALESCE(SUM(
                    CASE WHEN type = 'Surplus Food'
                    THEN actual_quantity ELSE 0 END
                ), 0) AS total_surplus_food,

                COUNT(*) FILTER (
                    WHERE diversion_status = 'Diverted'
                ) AS successful_pickup_count,

                COUNT(*) FILTER (
                    WHERE diversion_status = 'Not Diverted'
                ) AS failed_pickup_count

             FROM tracking_report
             WHERE tracking_date_time >= $1::date
               AND tracking_date_time < ($2::date + INTERVAL '1 day')`,
            [period_start_date, period_end_date]
        );

        const result = await pool.query(
            `INSERT INTO analytics_report (
                report_type,
                period_start_date,
                period_end_date,
                total_coffee_waste,
                total_surplus_food,
                successful_pickup_count,
                failed_pickup_count,
                staff_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
                report_type,
                period_start_date,
                period_end_date,
                summary.rows[0].total_coffee_waste,
                summary.rows[0].total_surplus_food,
                summary.rows[0].successful_pickup_count,
                summary.rows[0].failed_pickup_count,
                staff_id
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Analytics report generated successfully.',
            report: result.rows[0]
        });

    } catch (err) {
        console.error('Analytics report error:', err);

        res.status(500).json({
            success: false,
            message: 'Failed to generate analytics report.'
        });
    }
});

// Retrieve all analytics reports
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT *
             FROM analytics_report
             ORDER BY generated_at DESC`
        );

        res.json({
            success: true,
            reports: result.rows
        });

    } catch (err) {
        console.error('Retrieve analytics reports error:', err);

        res.status(500).json({
            success: false,
            message: 'Failed to retrieve analytics reports.'
        });
    }
});

// Retrieve one analytics report
router.get('/:report_id', async (req, res) => {
    try {
        const { report_id } = req.params;

        const result = await pool.query(
            `SELECT *
             FROM analytics_report
             WHERE report_id = $1`,
            [report_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Analytics report not found.'
            });
        }

        res.json({
            success: true,
            report: result.rows[0]
        });

    } catch (err) {
        console.error('Retrieve analytics report error:', err);

        res.status(500).json({
            success: false,
            message: 'Failed to retrieve analytics report.'
        });
    }
});

module.exports = router;
