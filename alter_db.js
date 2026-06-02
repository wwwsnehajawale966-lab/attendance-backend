const pool = require('./src/config/db');

const run = async () => {
    try {
        await pool.query("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendance_method VARCHAR(50) DEFAULT 'TOGGLE'");
        console.log("Database altered successfully: added attendance_method column.");
        process.exit(0);
    } catch (err) {
        console.error("Error altering database:", err);
        process.exit(1);
    }
};

run();
