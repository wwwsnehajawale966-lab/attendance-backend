const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
});

async function testConnection() {
    console.log('--- Testing PostgreSQL Connection ---');
    console.log('Config:', {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD ? '********' : 'NOT SET',
        port: process.env.DB_PORT
    });

    try {
        const start = Date.now();
        const res = await pool.query('SELECT NOW() as current_time');
        const duration = Date.now() - start;

        console.log('\n✅ CONNECTION SUCCESSFUL!');
        console.log('Server Time:', res.rows[0].current_time);
        console.log('Query Duration:', duration + 'ms');

    } catch (err) {
        console.error('\n❌ CONNECTION FAILED!');
        console.log('Error Details:', err.message);

        if (err.code === 'ECONNREFUSED') {
            console.log('Hint: Is PostgreSQL running on this port?');
        } else if (err.code === '28P01') {
            console.log('Hint: Invalid password.');
        } else if (err.code === '3D000') {
            console.log(`Hint: Database "${process.env.DB_NAME}" does not exist.`);
        }
    } finally {
        await pool.end();
        process.exit();
    }
}

testConnection();
