const bcrypt = require('bcryptjs');
const pool = require('./src/config/db');

async function createAdmin() {
    const args = process.argv.slice(2);
    if (args.length < 3) {
        console.log('Usage: node create-admin.js <email> <name> <password> <department>');
        console.log('Example: node create-admin.js john.doe@company.com "John Doe" "mysecurepassword" "HR"');
        process.exit(1);
    }

    const [email, name, password, department] = args;

    try {
        console.log('Connecting to database...');
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Check if user exists
        const exist = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (exist.rows.length > 0) {
            console.log(`❌ ERROR: A user with email ${email} already exists!`);
            process.exit(1);
        }

        // Insert Admin
        await pool.query(
            "INSERT INTO users (name, email, password, role, department) VALUES ($1, $2, $3, 'admin', $4)",
            [name, email, hashedPassword, department || 'Management']
        );

        console.log(`\n✅ SUCCESS: Admin user "${name}" created successfully!`);
        console.log(`Email: ${email}`);
        console.log(`Role: admin`);
        console.log(`You can now log in using your frontend and start adding real employees.`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Database Error:', err.message);
        process.exit(1);
    }
}

createAdmin();
