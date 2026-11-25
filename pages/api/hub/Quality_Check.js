
const express = require('express');
const router = express.Router();

const { sql, poolPromise } = require('../../../db');

// ===================================
// GET ALL QUALITY CHECK RECORDS
// ===================================
router.get('/', async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request().query(`
            SELECT *
            FROM dbo.Quality_Check
            ORDER BY CheckDateTime DESC
        `);

        res.json({
            success: true,
            data: result.recordset
        });

    } catch (err) {
        console.error('Error retrieving Quality Checks:', err);

        res.status(500).json({
            success: false,
            message: 'Failed to retrieve Quality Checks'
        });
    }
});

// ===================================
// GET QUALITY CHECK BY ID
// ===================================
router.get('/:id', async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input('QualityID', sql.Int, req.params.id)
            .query(`
                SELECT *
                FROM dbo.Quality_Check
                WHERE QualityID = @QualityID
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Quality Check not found'
            });
        }

        res.json({
            success: true,
            data: result.recordset[0]
        });

    } catch (err) {
        console.error('Error retrieving Quality Check:', err);

        res.status(500).json({
            success: false,
            message: 'Failed to retrieve Quality Check'
        });
    }
});

// ===================================
// POST - CREATE QUALITY CHECK
// ===================================
router.post('/', async (req, res) => {
    try {
        const {
            ItemName,
            Category,
            QuantityReceived,
            QuantityPassed,
            QuantityRejected,
            QualityStatus,
            InspectionNotes,
            StaffID,
            TransferID
        } = req.body;

        // Validate required fields
        if (
            !ItemName ||
            !Category ||
            !QualityStatus ||
            StaffID === undefined ||
            StaffID === null ||
            QuantityReceived === undefined ||
            QuantityPassed === undefined ||
            QuantityRejected === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields.'
            });
        }

        const received = Number(QuantityReceived);
        const passed = Number(QuantityPassed);
        const rejected = Number(QuantityRejected);
        const staffID = Number(StaffID);

        if (
            !Number.isFinite(received) ||
            !Number.isFinite(passed) ||
            !Number.isFinite(rejected) ||
            !Number.isInteger(staffID) ||
            received < 0 ||
            passed < 0 ||
            rejected < 0 ||
            staffID <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid quantity or StaffID.'
            });
        }

        if (passed + rejected !== received) {
            return res.status(400).json({
                success: false,
                message: 'Quantity Passed and Quantity Rejected must equal Quantity Received.'
            });
        }

        const transferID =
            TransferID === undefined || TransferID === null || TransferID === ''
                ? null
                : Number(TransferID);

        if (
            transferID !== null &&
            (!Number.isInteger(transferID) || transferID <= 0)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid TransferID.'
            });
        }

        const pool = await poolPromise;

        const result = await pool.request()
            .input('ItemName', sql.VarChar(sql.MAX), ItemName)
            .input('Category', sql.VarChar(sql.MAX), Category)
            .input('QuantityReceived', sql.Decimal(18, 2), received)
            .input('QuantityPassed', sql.Decimal(18, 2), passed)
            .input('QuantityRejected', sql.Decimal(18, 2), rejected)
            .input('QualityStatus', sql.VarChar(sql.MAX), QualityStatus)
            .input('InspectionNotes', sql.VarChar(sql.MAX), InspectionNotes || null)
            .input('StaffID', sql.Int, staffID)
            .input('TransferID', sql.Int, transferID)
            .query(`
                INSERT INTO dbo.Quality_Check (
                    ItemName,
                    Category,
                    CheckDateTime,
                    QuantityReceived,
                    QuantityPassed,
                    QuantityRejected,
                    QualityStatus,
                    InspectionNotes,
                    StaffID,
                    TransferID
                )
                OUTPUT INSERTED.*
                VALUES (
                    @ItemName,
                    @Category,
                    GETDATE(),
                    @QuantityReceived,
                    @QuantityPassed,
                    @QuantityRejected,
                    @QualityStatus,
                    @InspectionNotes,
                    @StaffID,
                    @TransferID
                )
            `);

        res.status(201).json({
            success: true,
            message: 'Quality Check recorded successfully!',
            data: result.recordset[0]
        });

    } catch (err) {
        console.error('Error creating Quality Check:', err);

        res.status(500).json({
            success: false,
            message: 'Failed to create Quality Check',
            error: err.message
        });
    }
});

module.exports = router;
