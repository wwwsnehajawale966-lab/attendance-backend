const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const register = async (req, res) => {
    const { name, email, password, role, full_name, phone, gender } = req.body;
    const finalName = name || full_name;

    try {
        // Check if user exists
        const userExist = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExist.rows.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Generate Employee ID robustly (find max ID for current year and increment)
        let employee_id = null;
        if ((role || 'employee') === 'employee') {
            const currentYear = new Date().getFullYear();
            const yearPrefix = `EMP-${currentYear}-`;
            const maxIdRes = await pool.query(
                "SELECT employee_id FROM users WHERE employee_id LIKE $1 ORDER BY employee_id DESC LIMIT 1",
                [`${yearPrefix}%`]
            );
            let nextNumber = 1;
            if (maxIdRes.rows.length > 0) {
                const lastId = maxIdRes.rows[0].employee_id;
                const lastNumStr = lastId.replace(yearPrefix, '');
                const lastNum = parseInt(lastNumStr, 10);
                if (!isNaN(lastNum)) {
                    nextNumber = lastNum + 1;
                }
            }
            employee_id = `EMP-${currentYear}-${String(nextNumber).padStart(3, '0')}`;
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert user
        const newUser = await pool.query(
            'INSERT INTO users (name, email, password, role, employee_id, phone, gender) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, email, role, employee_id, phone, gender',
            [finalName, email, hashedPassword, role || 'employee', employee_id, phone || null, gender || null]
        );

        res.status(201).json(newUser.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (user.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid Credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.rows[0].password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid Credentials' });
        }

        const payload = {
            user: {
                id: user.rows[0].id,
                role: user.rows[0].role
            }
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });



        res.json({
            token,
            user: {
                id: user.rows[0].id,
                name: user.rows[0].name,
                email: user.rows[0].email,
                role: user.rows[0].role
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

const adminLogin = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (user.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid Credentials' });
        }

        if (user.rows[0].role !== 'admin') {
            return res.status(403).json({ message: 'Access denied: Admin role required' });
        }

        const isMatch = await bcrypt.compare(password, user.rows[0].password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid Credentials' });
        }

        const payload = {
            user: {
                id: user.rows[0].id,
                role: user.rows[0].role
            }
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.json({
            token,
            user: {
                id: user.rows[0].id,
                name: user.rows[0].name,
                email: user.rows[0].email,
                role: user.rows[0].role
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

const employeeLogin = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (user.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid Credentials' });
        }

        if (user.rows[0].role !== 'employee') {
            return res.status(403).json({ message: 'Access denied: Employee role required' });
        }

        const isMatch = await bcrypt.compare(password, user.rows[0].password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid Credentials' });
        }

        const payload = {
            user: {
                id: user.rows[0].id,
                role: user.rows[0].role
            }
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });



        res.json({
            token,
            user: {
                id: user.rows[0].id,
                name: user.rows[0].name,
                email: user.rows[0].email,
                role: user.rows[0].role
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

const getMe = async (req, res) => {
    try {
        const user = await pool.query(
            'SELECT id, name, email, role, employee_id, department, phone, gender, created_at FROM users WHERE id = $1',
            [req.user.id]
        );
        if (user.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

const resetPassword = async (req, res) => {
    const { email, employeeId, newPassword } = req.body;

    try {
        // Find user by email
        const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid Email or Employee ID' });
        }
        const user = userRes.rows[0];

        // Verify case-insensitive employee ID matching
        if (!employeeId || !user.employee_id || employeeId.trim().toLowerCase() !== user.employee_id.trim().toLowerCase()) {
            return res.status(400).json({ message: 'Invalid Email or Employee ID' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update password in DB
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, user.id]);

        res.json({ message: 'Password reset successful' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

const updateProfile = async (req, res) => {
    const { name, email, phone, gender } = req.body;
    try {
        if (email) {
            const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, req.user.id]);
            if (emailCheck.rows.length > 0) {
                return res.status(400).json({ message: 'Email already in use by another user' });
            }
        }

        const updated = await pool.query(
            'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email), phone = $3, gender = $4 WHERE id = $5 RETURNING id, name, email, role, employee_id, department, phone, gender, created_at',
            [name, email, phone || null, gender || null, req.user.id]
        );

        if (updated.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(updated.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

const deleteProfile = async (req, res) => {
    try {
        const deleted = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.user.id]);
        if (deleted.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ message: 'Profile deleted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

module.exports = {
    register,
    login,
    adminLogin,
    employeeLogin,
    getMe,
    resetPassword,
    updateProfile,
    deleteProfile
};
