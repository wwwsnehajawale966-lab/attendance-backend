const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const os = require('os');
const pool = require('../config/db');

exports.checkIn = async (req, res) => {
    try {
        const userId = req.user.id;
        const { latitude, longitude, method } = req.body;

        // Fetch user from DB to verify user exists
        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const today = `${y}-${m}-${d}`;

        const existingRecord = await pool.query(
            'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
            [userId, today]
        );

        if (existingRecord.rows.length > 0) {
            return res.status(400).json({ message: 'Attendance Already Marked' });
        }

        // Late Logic: After 10:00 AM
        const hour = now.getHours();
        const minute = now.getMinutes();
        const isLate = (hour > 10) || (hour === 10 && minute > 0);
        const status = isLate ? 'Late' : 'Present';

        const newRecord = await pool.query(
            'INSERT INTO attendance (user_id, check_in, date, attendance_date, latitude, longitude, status, attendance_method) VALUES ($1, CURRENT_TIMESTAMP, $2, $2, $3, $4, $5, $6) RETURNING *',
            [userId, today, latitude !== undefined && latitude !== null ? latitude : null, longitude !== undefined && longitude !== null ? longitude : null, status, method || 'TOGGLE']
        );

        const empName = userRes.rows[0].name;
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const checkInMethod = method || 'TOGGLE';

        await pool.query(
            'INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)',
            [userId, 'Attendance Checked In', `You checked in successfully at ${timeStr} via ${checkInMethod}.`]
        );

        await pool.query(
            'INSERT INTO notifications (user_id, title, message) VALUES (NULL, $1, $2)',
            ['Employee Checked In', `${empName} checked in at ${timeStr} via ${checkInMethod}.`]
        );

        res.status(201).json(newRecord.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.checkOut = async (req, res) => {
    try {
        const userId = req.user.id;
        const localNow = new Date();
        const y = localNow.getFullYear();
        const m = String(localNow.getMonth() + 1).padStart(2, '0');
        const d = String(localNow.getDate()).padStart(2, '0');
        const today = `${y}-${m}-${d}`;

        const record = await pool.query(
            'SELECT * FROM attendance WHERE user_id = $1 AND date = $2 AND check_out IS NULL',
            [userId, today]
        );

        if (record.rows.length === 0) {
            return res.status(400).json({ message: 'No active check-in found for today' });
        }

        const checkInTime = new Date(record.rows[0].check_in);
        const checkOutTime = new Date();
        const diffInMs = checkOutTime - checkInTime;

        const hours = Math.floor(diffInMs / 3600000);
        const minutes = Math.floor((diffInMs % 3600000) / 60000);
        const workingHours = `${hours}h ${minutes}m`;

        const updatedRecord = await pool.query(
            'UPDATE attendance SET check_out = CURRENT_TIMESTAMP, working_hours = $1 WHERE id = $2 RETURNING *',
            [workingHours, record.rows[0].id]
        );

        const userRes = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
        const empName = userRes.rows[0]?.name || 'An employee';
        const timeStr = checkOutTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        await pool.query(
            'INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)',
            [userId, 'Attendance Checked Out', `You checked out successfully at ${timeStr}. Working hours: ${workingHours}.`]
        );

        await pool.query(
            'INSERT INTO notifications (user_id, title, message) VALUES (NULL, $1, $2)',
            ['Employee Checked Out', `${empName} checked out at ${timeStr}. Working hours: ${workingHours}.`]
        );

        res.json(updatedRecord.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getTodayStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const localNow = new Date();
        const y = localNow.getFullYear();
        const m = String(localNow.getMonth() + 1).padStart(2, '0');
        const d = String(localNow.getDate()).padStart(2, '0');
        const today = `${y}-${m}-${d}`;

        const record = await pool.query(
            'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
            [userId, today]
        );

        if (record.rows.length === 0) {
            return res.json({ status: 'Not Checked In' });
        }

        res.json(record.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getAttendanceHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const records = await pool.query(
            'SELECT * FROM attendance WHERE user_id = $1 ORDER BY date DESC LIMIT 30',
            [userId]
        );
        res.json(records.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getEmployeeLeaves = async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Fetch employee joining date (created_at)
        const userRes = await pool.query('SELECT created_at FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        let joinDate = new Date(userRes.rows[0].created_at);
        const today = new Date();

        // Safety check: if joinDate is invalid or in the future
        if (isNaN(joinDate.getTime()) || joinDate > today) {
            joinDate = new Date();
            joinDate.setDate(joinDate.getDate() - 30); // Default to last 30 days
        }

        // 2. Fetch all attendance records for this user
        const attendanceRes = await pool.query(
            "SELECT date, status FROM attendance WHERE user_id = $1 ORDER BY date ASC",
            [userId]
        );

        // Map existing attendance records by YYYY-MM-DD
        const attendanceMap = {};
        attendanceRes.rows.forEach(row => {
            let dateKey;
            if (row.date instanceof Date) {
                const y = row.date.getFullYear();
                const m = String(row.date.getMonth() + 1).padStart(2, '0');
                const d = String(row.date.getDate()).padStart(2, '0');
                dateKey = `${y}-${m}-${d}`;
            } else {
                dateKey = String(row.date).split('T')[0];
            }
            attendanceMap[dateKey] = row.status ? row.status.toLowerCase() : '';
        });

        // 3. Loop through days from joinDate to today and identify leaves (absences)
        const leaves = [];
        let current = new Date(joinDate);

        // Normalize current and today to midnight for precise daily iteration
        current.setHours(0, 0, 0, 0);
        const end = new Date(today);
        end.setHours(0, 0, 0, 0);

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        while (current <= end) {
            const dayOfWeek = current.getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6); // 0 = Sunday, 6 = Saturday

            if (!isWeekend) {
                const y = current.getFullYear();
                const m = String(current.getMonth() + 1).padStart(2, '0');
                const d = String(current.getDate()).padStart(2, '0');
                const dateStr = `${y}-${m}-${d}`;

                const status = attendanceMap[dateStr];

                // If there's no record (Absent) or explicit status is 'leave' or 'absent'
                if (!status || status === 'leave' || status === 'absent') {
                    leaves.push({
                        date: new Date(current),
                        dayName: dayNames[dayOfWeek],
                        status: 'Leave'
                    });
                }
            }

            // Move to next day
            current.setDate(current.getDate() + 1);
        }

        // Return leaves list (newest first)
        res.json(leaves.reverse());
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.generateQrToken = async (req, res) => {
    try {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes validity

        const newQr = await pool.query(
            'INSERT INTO qr_tokens (token, expires_at) VALUES ($1, $2) RETURNING token, expires_at',
            [token, expiresAt]
        );

        // Auto-detect local network IP of the host machine
        const networkInterfaces = os.networkInterfaces();
        let localIp = 'localhost';
        for (const interfaceName in networkInterfaces) {
            const interfaces = networkInterfaces[interfaceName];
            for (const iface of interfaces) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    localIp = iface.address;
                    break;
                }
            }
            if (localIp !== 'localhost') break;
        }

        const frontendUrl = process.env.FRONTEND_URL || 'https://attendance-frontend-e6zs.vercel.app';
        const qrUrl = `${frontendUrl}/employee?qr=true&token=${token}`;

        res.json({
            token: newQr.rows[0].token,
            expires_at: newQr.rows[0].expires_at,
            qrUrl
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.scanQr = async (req, res) => {
    try {
        const userId = req.user.id;
        const { token, latitude, longitude } = req.body;

        console.log('--- scanQr Debug ---');
        console.log('Received Body:', { token, latitude, longitude });
        console.log('User ID:', userId);

        if (!token) {
            return res.status(400).json({ message: 'QR token is required' });
        }

        // Support full URL token extraction for custom scanner compatibility
        let verifyToken = token;
        if (token) {
            // Robust check to extract 'token' param whether protocol is present or not
            const tokenMatch = token.match(/[?&]token=([^&]+)/);
            if (tokenMatch) {
                verifyToken = tokenMatch[1];
                console.log('Extracted Token from URL query:', verifyToken);
            } else if (token.includes('/employee?')) {
                try {
                    const urlStr = token.startsWith('http') ? token : 'http://' + token;
                    const url = new URL(urlStr);
                    const tokenParam = url.searchParams.get('token');
                    if (tokenParam) {
                        verifyToken = tokenParam;
                        console.log('Extracted Token via URL parsing:', verifyToken);
                    }
                } catch (e) {
                    console.error('URL parsing failed:', e.message);
                }
            }
        }

        // 1. Validate Token
        const tokenRes = await pool.query(
            'SELECT *, CURRENT_TIMESTAMP as db_now FROM qr_tokens WHERE token = $1',
            [verifyToken]
        );

        console.log('Token Query Result:', tokenRes.rows);

        if (tokenRes.rows.length === 0) {
            console.log('Token not found in database.');
            return res.status(400).json({ message: 'Invalid or expired QR code token.' });
        }

        const dbToken = tokenRes.rows[0];
        const now = new Date();
        const expiresAt = new Date(dbToken.expires_at);
        console.log('Time Comparison:', {
            serverTime: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            dbNow: dbToken.db_now,
            isExpired: now > expiresAt
        });

        // Perform timezone-drift immune validation check in JavaScript (uses server's clock that generated the token)
        if (now > expiresAt) {
            console.log('Token is expired according to server time comparison.');
            return res.status(400).json({ message: 'Invalid or expired QR code token.' });
        }

        // Fetch user from DB to verify user exists
        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const today = `${y}-${m}-${d}`;

        // 2. Check if already checked in today
        const existingRecord = await pool.query(
            'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
            [userId, today]
        );

        if (existingRecord.rows.length > 0) {
            const record = existingRecord.rows[0];
            // If already checked in and checked out
            if (record.check_out) {
                return res.status(400).json({ message: 'Attendance Already Marked for today' });
            }

            // Perform Check-Out
            const checkInTime = new Date(record.check_in);
            const checkOutTime = new Date();
            const diffInMs = checkOutTime - checkInTime;

            const hours = Math.floor(diffInMs / 3600000);
            const minutes = Math.floor((diffInMs % 3600000) / 60000);
            const workingHours = `${hours}h ${minutes}m`;

            const updatedRecord = await pool.query(
                'UPDATE attendance SET check_out = CURRENT_TIMESTAMP, working_hours = $1, latitude = COALESCE($2, latitude), longitude = COALESCE($3, longitude) WHERE id = $4 RETURNING *',
                [workingHours, latitude !== undefined && latitude !== null ? latitude : null, longitude !== undefined && longitude !== null ? longitude : null, record.id]
            );

            const empName = userRes.rows[0].name;
            const timeStr = checkOutTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            await pool.query(
                'INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)',
                [userId, 'Attendance Checked Out', `You checked out successfully at ${timeStr} via QR code. Working hours: ${workingHours}.`]
            );

            await pool.query(
                'INSERT INTO notifications (user_id, title, message) VALUES (NULL, $1, $2)',
                ['Employee Checked Out', `${empName} checked out at ${timeStr} via QR code. Working hours: ${workingHours}.`]
            );

            return res.json({
                message: 'Check-out successful via QR',
                attendance: updatedRecord.rows[0]
            });
        }

        // 3. Perform Check-In
        // Late Logic: After 10:00 AM
        const hour = now.getHours();
        const minute = now.getMinutes();
        const isLate = (hour > 10) || (hour === 10 && minute > 0);
        const status = isLate ? 'Late' : 'Present';

        const newRecord = await pool.query(
            'INSERT INTO attendance (user_id, check_in, date, attendance_date, latitude, longitude, status, attendance_method) VALUES ($1, CURRENT_TIMESTAMP, $2, $2, $3, $4, $5, $6) RETURNING *',
            [userId, today, latitude !== undefined && latitude !== null ? latitude : null, longitude !== undefined && longitude !== null ? longitude : null, status, 'QR']
        );

        const empName = userRes.rows[0].name;
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        await pool.query(
            'INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)',
            [userId, 'Attendance Checked In', `You checked in successfully at ${timeStr} via QR code.`]
        );

        await pool.query(
            'INSERT INTO notifications (user_id, title, message) VALUES (NULL, $1, $2)',
            ['Employee Checked In', `${empName} checked in at ${timeStr} via QR code.`]
        );

        res.status(201).json({
            message: 'Check-in successful via QR',
            attendance: newRecord.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

