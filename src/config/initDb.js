const pool = require('./db');
const seedUsers = require('./seed');

const initDb = async () => {
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      employee_id VARCHAR(20) UNIQUE,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
      department VARCHAR(50),
      phone VARCHAR(20),
      gender VARCHAR(20),
      status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      check_in TIMESTAMP WITH TIME ZONE,
      check_out TIMESTAMP WITH TIME ZONE,
      status VARCHAR(20) DEFAULT 'Present',
      date DATE DEFAULT CURRENT_DATE,
      working_hours VARCHAR(20),
      latitude DECIMAL(10, 8),
      longitude DECIMAL(11, 8),
      attendance_date DATE DEFAULT CURRENT_DATE,
      attendance_method VARCHAR(20) DEFAULT 'TOGGLE',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS qr_tokens (
      id SERIAL PRIMARY KEY,
      token VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(100) NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason TEXT,
      status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // Migration for existing tables
  const migrations = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id VARCHAR(20) UNIQUE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(50)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(20)",
    "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS working_hours VARCHAR(20)",
    "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8)",
    "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8)",
    "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendance_date DATE DEFAULT CURRENT_DATE",
    "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendance_method VARCHAR(20) DEFAULT 'TOGGLE'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Pending'",
    "UPDATE users SET status = 'Approved' WHERE status IS NULL"
  ];

  try {
    await pool.query(createUsersTable);
    for (const migration of migrations) {
      await pool.query(migration);
    }
    console.log('Database tables verified/updated');
    // await seedUsers();
  } catch (err) {
    console.error('Error creating users table:', err);
  }
};

module.exports = initDb;
