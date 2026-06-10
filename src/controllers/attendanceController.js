const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const os = require('os');
const pool = require('../config/db');

exports.checkIn = async (req, res) => {
    try {
        const userId = req.user.id;
        const { method } = req.body;
        
        // Foolproof Deep Search for React Native & Web location payloads
        let finalLat = null, finalLng = null;
        const searchLoc = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.latitude !== undefined && obj.longitude !== undefined) {
                finalLat = obj.latitude; finalLng = obj.longitude; return;
            }
            if (obj.lat !== undefined && (obj.lng !== undefined || obj.long !== undefined)) {
                finalLat = obj.lat; finalLng = obj.lng !== undefined ? obj.lng : obj.long; return;
            }
            Object.values(obj).forEach(searchLoc);
        };
        searchLoc(req.body);
        if (finalLat === null && finalLng === null) searchLoc(req.query);

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
        const istDateStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
        const istDate = new Date(istDateStr);
        const hour = istDate.getHours();
        const minute = istDate.getMinutes();
        const isLate = (hour > 10) || (hour === 10 && minute > 0);
        const status = isLate ? 'Late' : 'Present';

        const newRecord = await pool.query(
            'INSERT INTO attendance (user_id, check_in, date, attendance_date, latitude, longitude, status, attendance_method) VALUES ($1, CURRENT_TIMESTAMP, $2, $2, $3, $4, $5, $6) RETURNING *',
            [userId, today, finalLat, finalLng, status, method || 'TOGGLE']
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
        const { method } = req.body;
        
        // Foolproof Deep Search for React Native & Web location payloads
        let finalLat = null, finalLng = null;
        const searchLoc = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.latitude !== undefined && obj.longitude !== undefined) {
                finalLat = obj.latitude; finalLng = obj.longitude; return;
            }
            if (obj.lat !== undefined && (obj.lng !== undefined || obj.long !== undefined)) {
                finalLat = obj.lat; finalLng = obj.lng !== undefined ? obj.lng : obj.long; return;
            }
            Object.values(obj).forEach(searchLoc);
        };
        searchLoc(req.body);
        if (finalLat === null && finalLng === null) searchLoc(req.query);

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
            'UPDATE attendance SET check_out = CURRENT_TIMESTAMP, working_hours = $1, latitude = COALESCE($2, latitude), longitude = COALESCE($3, longitude) WHERE id = $4 RETURNING *',
            [workingHours, finalLat, finalLng, record.rows[0].id]
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

        if (req.user.role === 'admin') {
            const records = await pool.query(
                `SELECT a.*, 
                        a.user_id as "userId",
                        a.check_in as "checkIn",
                        a.check_out as "checkOut",
                        a.working_hours as "workingHours",
                        a.attendance_method as "attendanceMethod",
                        a.attendance_date as "attendanceDate",
                        u.name, 
                        u.email, 
                        u.department, 
                        u.role as user_role 
                 FROM attendance a 
                 JOIN users u ON a.user_id = u.id 
                 WHERE a.date = $1`,
                [today]
            );
            return res.json(records.rows);
        }

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
        const { token } = req.body;

        try {
            await pool.query('INSERT INTO scan_logs (body, query) VALUES ($1, $2)', [JSON.stringify(req.body), JSON.stringify(req.query)]);
        } catch(e) {
            console.error('Failed to log scan:', e);
        }

        // Foolproof Deep Search for React Native & Web location payloads
        let finalLat = null, finalLng = null;
        const searchLoc = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.latitude !== undefined && obj.longitude !== undefined) {
                finalLat = obj.latitude; finalLng = obj.longitude; return;
            }
            if (obj.lat !== undefined && (obj.lng !== undefined || obj.long !== undefined)) {
                finalLat = obj.lat; finalLng = obj.lng !== undefined ? obj.lng : obj.long; return;
            }
            Object.values(obj).forEach(searchLoc);
        };
        searchLoc(req.body);
        
        // Also check query parameters just in case the React Native app sends it in the URL
        if (finalLat === null && finalLng === null) {
            searchLoc(req.query);
        }

        console.log('--- scanQr Debug ---');
        console.log('Received Body:', JSON.stringify(req.body, null, 2));
        console.log('Parsed Location:', { finalLat, finalLng });
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
                [workingHours, finalLat, finalLng, record.id]
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
        const istDateStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
        const istDate = new Date(istDateStr);
        const hour = istDate.getHours();
        const minute = istDate.getMinutes();
        const isLate = (hour > 10) || (hour === 10 && minute > 0);
        const status = isLate ? 'Late' : 'Present';

        const newRecord = await pool.query(
            'INSERT INTO attendance (user_id, check_in, date, attendance_date, latitude, longitude, status, attendance_method) VALUES ($1, CURRENT_TIMESTAMP, $2, $2, $3, $4, $5, $6) RETURNING *',
            [userId, today, finalLat, finalLng, status, 'QR']
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

exports.getSelfAnalytics = async (req, res) => {
    const id = req.user.id;
    let { startDate, endDate } = req.query;

    try {
        const employeeRes = await pool.query(
            "SELECT id, name, email, role, employee_id, department, phone, gender, created_at FROM users WHERE id = $1",
            [id]
        );
        if (employeeRes.rows.length === 0) {
            return res.status(404).json({ message: 'Employee not found' });
        }
        const employee = employeeRes.rows[0];

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const defaultStart = `${year}-${month}-01`;
        const defaultEnd = `${year}-${month}-${String(now.getDate()).padStart(2, '0')}`;

        if (!startDate) startDate = defaultStart;
        if (!endDate) endDate = defaultEnd;

        const attendanceRes = await pool.query(
            "SELECT * FROM attendance WHERE user_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date ASC",
            [id, startDate, endDate]
        );
        const attendanceRows = attendanceRes.rows;

         const attendanceMap = {};
         attendanceRows.forEach(row => {
             let dateKey;
             if (row.date instanceof Date) {
                 const y = row.date.getFullYear();
                 const m = String(row.date.getMonth() + 1).padStart(2, '0');
                 const d = String(row.date.getDate()).padStart(2, '0');
                 dateKey = `${y}-${m}-${d}`;
             } else {
                 dateKey = String(row.date).split('T')[0];
             }
             attendanceMap[dateKey] = row;
         });

        const logs = [];
        const [sYear, sMonth, sDay] = startDate.split('-').map(Number);
        const [eYear, eMonth, eDay] = endDate.split('-').map(Number);

        const start = new Date(sYear, sMonth - 1, sDay);
        const end = new Date(eYear, eMonth - 1, eDay);

        let totalPresent = 0;
        let totalAbsent = 0;
        let totalLate = 0;
        let totalLeave = 0;
        let totalHoliday = 0;
        let totalWeekend = 0;
        let totalWorkingHoursDecimal = 0;
        let totalExtraHoursDecimal = 0;

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        const parseWorkingHours = (str) => {
            if (!str) return 0;
            const match = str.match(/(\d+)h\s*(\d+)m/);
            if (match) {
                const h = parseInt(match[1], 10);
                const m = parseInt(match[2], 10);
                return h + m / 60;
            }
            const decimalVal = parseFloat(str);
            return isNaN(decimalVal) ? 0 : decimalVal;
        };

        const formatDecimalHours = (decimalHours) => {
            const hours = Math.floor(decimalHours);
            const minutes = Math.round((decimalHours - hours) * 60);
            return `${hours}h ${minutes}m`;
        };

        const nowLocal = new Date();
        const tY = nowLocal.getFullYear();
        const tM = String(nowLocal.getMonth() + 1).padStart(2, '0');
        const tD = String(nowLocal.getDate()).padStart(2, '0');
        const todayStr = `${tY}-${tM}-${tD}`;

        const joinDate = new Date(employee.created_at);
        const jy = joinDate.getFullYear();
        const jm = String(joinDate.getMonth() + 1).padStart(2, '0');
        const jd = String(joinDate.getDate()).padStart(2, '0');
        const joinDateStr = `${jy}-${jm}-${jd}`;

        let current = new Date(start);
        while (current <= end) {
            const cy = current.getFullYear();
            const cm = String(current.getMonth() + 1).padStart(2, '0');
            const cd = String(current.getDate()).padStart(2, '0');
            const dateStr = `${cy}-${cm}-${cd}`;

            if (dateStr > todayStr || dateStr < joinDateStr) {
                current.setDate(current.getDate() + 1);
                continue;
            }

            const dOfWeek = current.getDay();
            const dayName = dayNames[dOfWeek];
            const isWeekend = (dOfWeek === 0 || dOfWeek === 6);

            const record = attendanceMap[dateStr];

            if (record) {
                const status = record.status || 'Present';
                const lowercaseStatus = status.toLowerCase();

                if (lowercaseStatus === 'present') {
                    totalPresent++;
                } else if (lowercaseStatus === 'late') {
                    totalPresent++;
                    totalLate++;
                } else if (lowercaseStatus === 'leave') {
                    totalLeave++;
                } else if (lowercaseStatus === 'holiday') {
                    totalHoliday++;
                } else if (lowercaseStatus === 'weekend') {
                    totalWeekend++;
                }

                let lateEarlyStatus = 'On Time';
                if (record.check_in && (lowercaseStatus === 'present' || lowercaseStatus === 'late')) {
                    const checkInTime = new Date(record.check_in);
                    const checkInHour = checkInTime.getHours();
                    const checkInMinute = checkInTime.getMinutes();
                    const checkInMinutesSinceMidnight = checkInHour * 60 + checkInMinute;
                    const targetMinutesSinceMidnight = 10 * 60;

                    const diffInMins = checkInMinutesSinceMidnight - targetMinutesSinceMidnight;
                    if (diffInMins > 0) {
                        lateEarlyStatus = `Late by ${diffInMins} mins`;
                    } else if (diffInMins < 0) {
                        lateEarlyStatus = `Early by ${Math.abs(diffInMins)} mins`;
                    }
                }

                let extraWorkingTime = 'N/A';
                if (record.check_out) {
                    const checkOutTime = new Date(record.check_out);
                    const checkOutHour = checkOutTime.getHours();
                    const checkOutMinute = checkOutTime.getMinutes();
                    const checkOutMinutesSinceMidnight = checkOutHour * 60 + checkOutMinute;
                    const targetOutMinutesSinceMidnight = 19 * 60;

                    const diffOutInMins = checkOutMinutesSinceMidnight - targetOutMinutesSinceMidnight;
                    if (diffOutInMins > 0) {
                        const hours = Math.floor(diffOutInMins / 60);
                        const mins = diffOutInMins % 60;
                        extraWorkingTime = `Extra Work: ${hours}h ${mins}m`;
                        totalExtraHoursDecimal += (hours + mins / 60);
                    }
                }

                if (record.working_hours) {
                    totalWorkingHoursDecimal += parseWorkingHours(record.working_hours);
                }

                logs.push({
                    id: record.id,
                    date: dateStr,
                    dayName,
                    check_in: record.check_in,
                    check_out: record.check_out,
                    working_hours: record.working_hours || '--',
                    status: status,
                    late_early_status: lateEarlyStatus,
                    extra_working_time: extraWorkingTime,
                    latitude: record.latitude,
                    longitude: record.longitude
                });
            } else {
                let status = 'Absent';
                if (isWeekend) {
                    status = 'Weekend';
                    totalWeekend++;
                } else {
                    totalAbsent++;
                }

                logs.push({
                    id: null,
                    date: dateStr,
                    dayName,
                    check_in: null,
                    check_out: null,
                    working_hours: '--',
                    status: status,
                    late_early_status: 'N/A',
                    extra_working_time: 'N/A',
                    latitude: null,
                    longitude: null
                });
            }

            current.setDate(current.getDate() + 1);
        }

        res.json({
            employee,
            summary: {
                totalPresent,
                totalAbsent,
                totalLate,
                totalLeave,
                totalHoliday,
                totalWeekend,
                totalWorkingHours: formatDecimalHours(totalWorkingHoursDecimal),
                extraWorkingHours: formatDecimalHours(totalExtraHoursDecimal),
                averageWorkingHours: totalPresent > 0 ? formatDecimalHours(totalWorkingHoursDecimal / totalPresent) : '0h 0m'
            },
            logs: logs.reverse()
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.submitLeaveRequest = async (req, res) => {
    const userId = req.user.id;
    const { startDate, endDate, reason } = req.body;

    if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Start date and end date are required' });
    }

    try {
        const userRes = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
        const userName = userRes.rows[0]?.name || 'Employee';

        const result = await pool.query(
            'INSERT INTO leave_requests (user_id, start_date, end_date, reason) VALUES ($1, $2, $3, $4) RETURNING *',
            [userId, startDate, endDate, reason || '']
        );

        // Notify Admins
        await pool.query(
            'INSERT INTO notifications (user_id, title, message) VALUES (NULL, $1, $2)',
            ['New Leave Request', `${userName} requested leave from ${startDate} to ${endDate}. Reason: ${reason || 'Not specified'}.`]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getLeaveRequests = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            'SELECT * FROM leave_requests WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.downloadPdfReport = async (req, res) => {
    const id = req.user.id;
    let { startDate, endDate } = req.query;

    try {
        const employeeRes = await pool.query(
            "SELECT id, name, email, employee_id, department FROM users WHERE id = $1",
            [id]
        );
        if (employeeRes.rows.length === 0) {
            return res.status(404).send('Employee not found');
        }
        const employee = employeeRes.rows[0];

        const attendanceRes = await pool.query(
            "SELECT * FROM attendance WHERE user_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date DESC",
            [id, startDate, endDate]
        );
        const records = attendanceRes.rows;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Attendance Report - ${employee.name}</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 40px; }
                h1 { color: #1E293B; font-size: 24px; margin-bottom: 5px; }
                h2 { color: #64748B; font-size: 14px; margin-top: 0; margin-bottom: 20px; font-weight: normal; }
                .info-box { background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 15px; border-radius: 8px; margin-bottom: 30px; display: flex; justify-content: space-between; }
                .info-item { margin-bottom: 5px; font-size: 14px; }
                .info-label { font-weight: bold; color: #475569; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #CBD5E1; padding: 12px; text-align: left; font-size: 13px; }
                th { background-color: #F1F5F9; color: #1E293B; font-weight: bold; }
                tr:nth-child(even) { background-color: #F8FAFC; }
                .status { font-weight: bold; padding: 3px 8px; border-radius: 4px; font-size: 11px; text-transform: uppercase; }
                .present { background-color: #DCFCE7; color: #15803D; }
                .absent { background-color: #FEE2E2; color: #B91C1C; }
                .late { background-color: #FEF9C3; color: #A16207; }
                .leave { background-color: #DBEAFE; color: #1D4ED8; }
                @media print {
                    body { margin: 20px; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h1>Attendance Report</h1>
                    <h2>For the period ${startDate} to ${endDate}</h2>
                </div>
                <button class="no-print" onclick="window.print()" style="padding: 10px 15px; background: #1E293B; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Print / Save PDF</button>
            </div>
            
            <div class="info-box">
                <div>
                    <div class="info-item"><span class="info-label">Name:</span> ${employee.name}</div>
                    <div class="info-item"><span class="info-label">Employee ID:</span> ${employee.employee_id || 'N/A'}</div>
                </div>
                <div>
                    <div class="info-item"><span class="info-label">Email:</span> ${employee.email}</div>
                    <div class="info-item"><span class="info-label">Department:</span> ${employee.department || 'Software Engineering'}</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Day</th>
                        <th>Status</th>
                        <th>Check In</th>
                        <th>Check Out</th>
                        <th>Working Hours</th>
                        <th>Method</th>
                    </tr>
                </thead>
                <tbody>
                    ${records.map(r => {
                        const d = new Date(r.date);
                        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        const dayName = days[d.getDay()];
                        const dateStr = d.toISOString().split('T')[0];
                        const statusClass = r.status.toLowerCase();
                        
                        const formatTime = (ts) => {
                            if (!ts) return '--';
                            return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        };

                        return `
                            <tr>
                                <td>${dateStr}</td>
                                <td>${dayName}</td>
                                <td><span class="status ${statusClass}">${r.status}</span></td>
                                <td>${formatTime(r.check_in)}</td>
                                <td>${formatTime(r.check_out)}</td>
                                <td>${r.working_hours || '--'}</td>
                                <td>${r.attendance_method || 'N/A'}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </body>
        </html>
        `;

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.downloadExcelReport = async (req, res) => {
    const id = req.user.id;
    let { startDate, endDate } = req.query;

    try {
        const employeeRes = await pool.query(
            "SELECT name, employee_id FROM users WHERE id = $1",
            [id]
        );
        if (employeeRes.rows.length === 0) {
            return res.status(404).send('Employee not found');
        }
        const employee = employeeRes.rows[0];

        const attendanceRes = await pool.query(
            "SELECT * FROM attendance WHERE user_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date ASC",
            [id, startDate, endDate]
        );
        const records = attendanceRes.rows;

        let csv = 'Attendance Report\n';
        csv += `Employee Name,${employee.name}\n`;
        csv += `Employee ID,${employee.employee_id || 'N/A'}\n`;
        csv += `Period,${startDate} to ${endDate}\n\n`;
        
        csv += 'Date,Day,Status,Check In,Check Out,Working Hours,Method\n';

        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        records.forEach(r => {
            const d = new Date(r.date);
            const dayName = days[d.getDay()];
            const dateStr = d.toISOString().split('T')[0];
            
            const formatTime = (ts) => {
                if (!ts) return '--';
                return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(/,/g, '');
            };

            const workingHours = r.working_hours ? r.working_hours.replace(/,/g, '') : '--';
            const method = r.attendance_method || 'N/A';

            csv += `${dateStr},${dayName},${r.status},${formatTime(r.check_in)},${formatTime(r.check_out)},${workingHours},${method}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${startDate}_to_${endDate}.csv`);
        res.send(csv);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

