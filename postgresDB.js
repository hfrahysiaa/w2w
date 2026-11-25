
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'waste_tracking',
    user: 'postgres',
    password: process.env.PG_PASSWORD
});

pool.on('connect', () => {
    console.log('Module 5 PostgreSQL connected!');
});

pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err);
});

module.exports = pool;
