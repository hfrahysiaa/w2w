
const sql = require('mssql/msnodesqlv8');
require('dotenv').config();

const config = {
    server: process.env.DB_SERVER,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,

    options: {
        trustedConnection: true,
        trustServerCertificate: true,
        encrypt: false
    },

    beforeConnect: (conn) => {

        conn.conn_str = conn.conn_str.replace(
            /Driver=[^;]+/i,
            'Driver={ODBC Driver 17 for SQL Server}'
        );

        console.log('Using:', conn.conn_str);
    },

    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('Connected to SQL Server successfully!');
        return pool;
    })
    .catch(err => {
        console.error('Database connection failed:', err);
        throw err;
    });

module.exports = { sql, poolPromise };


