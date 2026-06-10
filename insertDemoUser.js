const bcrypt = require('bcryptjs');
const pool = require('./src/config/db');

async function insertDemoUser() {
    try {
        const hashedPassword = await bcrypt.hash('password123', 10);
        
        await pool.query(
            "INSERT INTO users (name, email, password, role, department, phone, gender, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            ['Demo Admin', 'demo.admin@example.com', hashedPassword, 'admin', 'Management', '+123', 'Other', 'approved']
        );

        await pool.query(
            "INSERT INTO users (name, email, password, role, department, phone, gender, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            ['Demo Pending User', 'demo.pending@example.com', hashedPassword, 'employee', 'IT', '+1234567890', 'Other', 'pending']
        );
        console.log('Demo users inserted');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

insertDemoUser();
