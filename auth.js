
const express = require('express');
const bcrypt = require('bcrypt');
const { sql, poolPromise } = require('./db');

const router = express.Router();

// ======================================
// ADMIN / HUB STAFF / BRANCH STAFF LOGIN
// ======================================

router.post('/login', async (req, res) => {

    try {

        const { username, password } = req.body;

        // 1. Check empty input
        if (!username || !password) {

            return res.status(400).json({
                success: false,
                message: 'Please enter username and password.'
            });

        }

        // 2. Connect to SQL Server
        const pool = await poolPromise;

        // 3. Find staff by username
        const result = await pool.request()

            .input(
                'Username',
                sql.VarChar(50),
                username.trim()
            )

            .query(`
                SELECT
                    StaffID,
                    FullName,
                    Username,
                    [Password],
                    PhoneNumber,
                    Role,
                    BranchID,
                    AccountStatus
                FROM dbo.Staff
                WHERE Username = @Username
            `);


        // 4. Check whether username exists
        if (result.recordset.length === 0) {

            return res.status(401).json({
                success: false,
                message: 'Invalid username or password.'
            });

        }

        const staff = result.recordset[0];


        // 5. Check account status
        const accountStatus = String(staff.AccountStatus || '')
            .trim()
            .toLowerCase();

        if (accountStatus !== 'active') {

            return res.status(403).json({
                success: false,
                message: 'Your account is inactive.'
            });

        }


        // 6. Verify password using bcrypt
        const passwordMatch = await bcrypt.compare(
            password,
            staff.Password
        );

        if (!passwordMatch) {

            return res.status(401).json({
                success: false,
                message: 'Invalid username or password.'
            });

        }


        // 7. Normalize user role
        const role = String(staff.Role || '')
            .trim()
            .toLowerCase();


        // 8. Allowed roles
        const allowedRoles = [
            'admin',
            'hubstaff',
            'branchstaff'
        ];

        if (!allowedRoles.includes(role)) {

            return res.status(403).json({
                success: false,
                message: 'You are not allowed to access this login.'
            });

        }


        // 9. Successful login
        return res.status(200).json({

            success: true,

            message: 'Login successful!',

            user: {

                staffID: staff.StaffID,

                fullName: staff.FullName,

                username: staff.Username,

                phoneNumber: staff.PhoneNumber,

                role: staff.Role,

                branchID: staff.BranchID

            }

        });

    }

    catch (err) {

        console.error('Login error:', err);

        return res.status(500).json({

            success: false,

            message: 'Internal server error.'

        });

    }

});


// Export router
module.exports = router;
