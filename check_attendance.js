const pool = require('./src/config/db');
async function check() {
    try {
        const res = await pool.query(`
            SELECT a.*, u.email, u.name 
            FROM attendance a 
            JOIN users u ON a.user_id = u.id 
            WHERE u.email = 'employee@company.com' 
            AND a.date = CURRENT_DATE
        `);
        console.log('--- DATA FOUND ---');
        console.log(JSON.stringify(res.rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
