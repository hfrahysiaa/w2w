
const express = require('express');
const router = express.Router();

const { sql, poolPromise } = require('../../../db');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ===================================
// IMAGE UPLOAD SETTINGS
// ===================================

const uploadFolder = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(uploadFolder)) {
    fs.mkdirSync(uploadFolder, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadFolder);
    },

    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const filename = `food-${Date.now()}${ext}`;

        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {
        const allowedTypes = [
            'image/jpeg',
            'image/png',
            'image/webp'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPG, JPEG, PNG and WEBP images are allowed.'));
        }
    }
});

// ===================================
// HELPER: CONVERT DATETIME
// ===================================

function convertDate(value) {
    if (!value) return null;

    const date = new Date(value);

    if (isNaN(date.getTime())) {
        throw new Error('Invalid date or time provided.');
    }

    return date;
}

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
            .input('FoodID', sql.Int, Number(req.params.id))
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
        console.error('Error retrieving food:', err);

        res.status(500).json({
            success: false,
            message: 'Failed to retrieve food listing'
        });
    }
});

// ===================================
// POST NEW FOOD LISTING
// ===================================

router.post(
    '/',
    (req, res, next) => {
        upload.single('FoodPhoto')(req, res, (err) => {
            if (err) {
                return res.status(400).json({
                    success: false,
                    message: err.message
                });
            }

            next();
        });
    },

    async (req, res) => {
        try {
            const {
                FoodName,
                FoodCategory,
                FoodSafetyTag,
                AllergenInfo,
                PreparationDateTime,
                ExpiryDateTime,
                LastPickupTime,
                QualityID,
                StaffID
            } = req.body;

            // Check required fields

            if (!FoodName || !FoodCategory || !QualityID || !StaffID) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide all required fields.'
                });
            }

            // Check uploaded image

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'Please upload a food photo.'
                });
            }

            const qualityID = Number(QualityID);
            const staffID = Number(StaffID);

            if (!Number.isInteger(qualityID) || !Number.isInteger(staffID)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid Quality ID or Staff ID.'
                });
            }

            const pool = await poolPromise;

            // Check duplicate QualityID

            const duplicate = await pool.request()
                .input('QualityID', sql.Int, qualityID)
                .query(`
                    SELECT FoodID
                    FROM Surplus_Food_Listing
                    WHERE QualityID = @QualityID
                `);

            if (duplicate.recordset.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'This Quality Check has already been used for a food listing.'
                });
            }

            // Verify Quality Check record

            const quality = await pool.request()
                .input('QualityID', sql.Int, qualityID)
                .query(`
                    SELECT *
                    FROM Quality_Check
                    WHERE QualityID = @QualityID
                `);

            if (quality.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Quality Check record not found.'
                });
            }

            const check = quality.recordset[0];

          // Allow Passed and Partially Passed records

const qualityStatus = String(check.QualityStatus)
    .trim()
    .toLowerCase();

if (
    qualityStatus !== 'passed' &&
    qualityStatus !== 'partially passed'
) {
    return res.status(400).json({
        success: false,
        message: 'Only Passed or Partially Passed records can be posted.'
    });
}

            // Check quantity

            if (Number(check.QuantityPassed) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No passed quantity available.'
                });
            }

            // Verify food details

            if (
                String(check.ItemName).trim().toLowerCase() !==
                    String(FoodName).trim().toLowerCase() ||

                String(check.Category).trim().toLowerCase() !==
                    String(FoodCategory).trim().toLowerCase()
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Food details do not match Quality Check record.'
                });
            }

            // Convert dates

            const preparationDate = convertDate(PreparationDateTime);
            const expiryDate = convertDate(ExpiryDateTime);
            const pickupDate = convertDate(LastPickupTime);

            if (
                expiryDate &&
                preparationDate &&
                expiryDate < preparationDate
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Expiry date cannot be earlier than preparation date.'
                });
            }

            if (
                pickupDate &&
                expiryDate &&
                pickupDate > expiryDate
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Last pickup time cannot be later than expiry time.'
                });
            }

            // Save image path

            const foodPhoto = '/uploads/' + req.file.filename;

            // Insert into SQL Server

            const result = await pool.request()

                .input('FoodName', sql.VarChar(255), FoodName)
                .input('FoodCategory', sql.VarChar(100), FoodCategory)

                .input(
                    'Quantity',
                    sql.Decimal(10, 2),
                    check.QuantityPassed
                )

                .input(
                    'FoodSafetyTag',
                    sql.VarChar(100),
                    FoodSafetyTag || null
                )

                .input(
                    'AllergenInfo',
                    sql.VarChar(500),
                    AllergenInfo || null
                )

                .input(
                    'FoodPhoto',
                    sql.VarChar(500),
                    foodPhoto
                )

                .input(
                    'PreparationDateTime',
                    sql.DateTime,
                    preparationDate
                )

                .input(
                    'ExpiryDateTime',
                    sql.DateTime,
                    expiryDate
                )

                .input(
                    'LastPickupTime',
                    sql.DateTime,
                    pickupDate
                )

                .input('QualityID', sql.Int, qualityID)
                .input('StaffID', sql.Int, staffID)

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
                message: err.message || 'Failed to create food listing.'
            });
        }
    }
);

module.exports = router;
