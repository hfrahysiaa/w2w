
const express = require('express');
const router = express.Router();

const { sql, poolPromise } = require('./db');

// ===================================
// GET ALL FOOD LISTINGS
// ===================================
router.get('/', async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request().query(`
            SELECT *
            FROM Surplus_Food_Listing
            ORDER BY FoodID DESC
        `);

        res.json({
            success: true,
            data: result.recordset
        });

    } catch (err) {
        console.error('Error retrieving food:', err);

        res.status(500).json({
            success: false,
            message: 'Failed to retrieve surplus listings'
        });
    }
});

// ===================================
// GET FOOD BY ID
// ===================================
router.get('/:id', async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input('FoodID', sql.Int, req.params.id)
            .query(`
                SELECT *
                FROM Surplus_Food_Listing
                WHERE FoodID = @FoodID
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Food listing not found'
            });
        }

        res.json({
            success: true,
            data: result.recordset[0]
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            message: 'Failed to retrieve food listing'
        });
    }
});

// ===================================
// POST NEW FOOD LISTING
// ===================================
router.post('/', async (req, res) => {
    try {
        const {
            FoodName,
            FoodCategory,
            FoodSafetyTag,
            AllergenInfo,
            FoodPhoto,
            PreparationDateTime,
            ExpiryDateTime,
            LastPickupTime,
            QualityID,
            StaffID
        } = req.body;

        if (!FoodName || !FoodCategory || !QualityID || !StaffID) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }

        const pool = await poolPromise;

        // Prevent duplicate QualityID posting
        const duplicate = await pool.request()
            .input('QualityID', sql.Int, QualityID)
            .query(`
                SELECT FoodID
                FROM Surplus_Food_Listing
                WHERE QualityID = @QualityID
            `);

        if (duplicate.recordset.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'This Quality Check has already been used for a food listing'
            });
        }

        // Verify quality check
        const quality = await pool.request()
            .input('QualityID', sql.Int, QualityID)
            .query(`
                SELECT *
                FROM Quality_Check
                WHERE QualityID = @QualityID
            `);

        if (quality.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Quality Check record not found'
            });
        }

        const check = quality.recordset[0];

        // Only Passed food can be posted
        if (check.QualityStatus !== 'Passed') {
            return res.status(400).json({
                success: false,
                message: 'Only food with Passed quality status can be posted'
            });
        }

        // Check passed quantity
        if (check.QuantityPassed <= 0) {
            return res.status(400).json({
                success: false,
                message: 'No passed quantity available'
            });
        }

        // Verify food details
        if (
            check.ItemName !== FoodName ||
            check.Category !== FoodCategory
        ) {
            return res.status(400).json({
                success: false,
                message: 'Food details do not match Quality Check record'
            });
        }

        // Insert food listing
        const result = await pool.request()
            .input('FoodName', sql.VarChar, FoodName)
            .input('FoodCategory', sql.VarChar, FoodCategory)
            .input('Quantity', sql.Decimal(10, 2), check.QuantityPassed)
            .input('FoodSafetyTag', sql.VarChar, FoodSafetyTag || null)
            .input('AllergenInfo', sql.VarChar, AllergenInfo || null)
            .input('FoodPhoto', sql.VarChar, FoodPhoto || null)
            .input('PreparationDateTime', sql.DateTime, PreparationDateTime || null)
            .input('ExpiryDateTime', sql.DateTime, ExpiryDateTime || null)
            .input('LastPickupTime', sql.DateTime, LastPickupTime || null)
            .input('QualityID', sql.Int, QualityID)
            .input('StaffID', sql.Int, StaffID)
            .query(`
                INSERT INTO Surplus_Food_Listing (
                    FoodName,
                    FoodCategory,
                    Quantity,
                    FoodSafetyTag,
                    AllergenInfo,
                    FoodPhoto,
                    PreparationDateTime,
                    ExpiryDateTime,
                    LastPickupTime,
                    FoodStatus,
                    QualityID,
                    StaffID
                )
                OUTPUT INSERTED.*
                VALUES (
                    @FoodName,
                    @FoodCategory,
                    @Quantity,
                    @FoodSafetyTag,
                    @AllergenInfo,
                    @FoodPhoto,
                    @PreparationDateTime,
                    @ExpiryDateTime,
                    @LastPickupTime,
                    'Available',
                    @QualityID,
                    @StaffID
                )
            `);

        res.status(201).json({
            success: true,
            message: 'Food listing created successfully!',
            data: result.recordset[0]
        });

    } catch (err) {
        console.error('Error creating food listing:', err);

        res.status(500).json({
            success: false,
            message: 'Failed to create food listing',
            error: err.message
        });
    }
});

module.exports = router;
