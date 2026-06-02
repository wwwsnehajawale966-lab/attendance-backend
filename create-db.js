const { Client } = require('pg');
require('dotenv').config();

async function createDatabase() {
    // Connect to 'postgres' database which always exists
    const config = {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 5432,
        database: 'postgres'
    };

    const client = new Client(config);

    try {
        await client.connect();

        // Check if database exists
        const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'attendance_db'");

        if (res.rowCount === 0) {
            await client.query('CREATE DATABASE attendance_db');
            console.log('✅ DATABASE CREATED: attendance_db created successfully.');
        } else {
            console.log('ℹ️ DATABASE EXISTS: attendance_db already exists.');
        }
    } catch (err) {
        console.error('❌ ERROR:', err.message);
        if (err.code === '28P01') {
            console.log('Hint: Check your database password in .env');
        }
    } finally {
        await client.end();
    }
}

createDatabase();
