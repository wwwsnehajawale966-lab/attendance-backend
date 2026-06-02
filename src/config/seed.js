const bcrypt = require('bcryptjs');
const pool = require('./db');

const seedUsers = async () => {
    try {
        const salt = await bcrypt.genSalt(10);

        // Admin
        const adminEmail = 'admin@company.com';
        const adminExist = await pool.query('SELECT * FROM users WHERE email = $1', [adminEmail]);
        if (adminExist.rows.length === 0) {
            const hashedAdminPass = await bcrypt.hash('admin123', salt);
            await pool.query(
                'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
                ['Admin User', adminEmail, hashedAdminPass, 'admin']
            );
            console.log('Seed: Admin user created');
        }

        // Employee
        const empEmail = 'employee@company.com';
        const empExist = await pool.query('SELECT * FROM users WHERE email = $1', [empEmail]);
        if (empExist.rows.length === 0) {
            const hashedEmpPass = await bcrypt.hash('emp123', salt);
            await pool.query(
                'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
                ['Employee User', empEmail, hashedEmpPass, 'employee']
            );
            console.log('Seed: Employee user created');
        }
    } catch (err) {
        console.error('Error seeding users:', err);
    }
};

module.exports = seedUsers;
