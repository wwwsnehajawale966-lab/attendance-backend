const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const getDashboardStats = async (req, res) => {
    try {
        // 1. Total Employees
        const totalEmpRes = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'employee'");
        const totalEmployees = parseInt(totalEmpRes.rows[0].count);

        // 2. Today's Presence (Only employees)
        const todayAtRes = await pool.query(`
            SELECT COUNT(DISTINCT a.user_id) 
            FROM attendance a
            JOIN users u ON a.user_id = u.id
            WHERE a.date = CURRENT_DATE 
              AND LOWER(a.status) IN ('present', 'late')
              AND u.role = 'employee'
        `);
        const presentToday = parseInt(todayAtRes.rows[0].count);

        // 3. Late Arrivals (Only employees)
        const lateRes = await pool.query(`
            SELECT COUNT(DISTINCT a.user_id) 
            FROM attendance a
            JOIN users u ON a.user_id = u.id
            WHERE a.date = CURRENT_DATE 
              AND LOWER(a.status) = 'late'
              AND u.role = 'employee'
        `);
        const lateToday = parseInt(lateRes.rows[0].count);

        // 4. On Leave / Absent Today
        // Calculates anyone who did not check in today (Total Employees - Present Today)
        const onLeave = Math.max(0, totalEmployees - presentToday);

        // 5. Weekly Attendance Trend (Last 7 Days)
        const weeklyRes = await pool.query(`
            SELECT a.date, COUNT(DISTINCT a.user_id) as present_count 
            FROM attendance a
            JOIN users u ON a.user_id = u.id
            WHERE a.date >= CURRENT_DATE - INTERVAL '6 days' 
              AND LOWER(a.status) IN ('present', 'late') 
              AND u.role = 'employee'
            GROUP BY a.date 
            ORDER BY a.date ASC
        `);
        
        const weeklyMap = {};
        weeklyRes.rows.forEach(row => {
            const dObj = new Date(row.date);
            const y = dObj.getFullYear();
            const m = String(dObj.getMonth() + 1).padStart(2, '0');
            const d = String(dObj.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;
            weeklyMap[dateStr] = parseInt(row.present_count, 10);
        });

        const weeklyTrend = [];
        const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const cy = d.getFullYear();
            const cm = String(d.getMonth() + 1).padStart(2, '0');
            const cd = String(d.getDate()).padStart(2, '0');
            const dateStr = `${cy}-${cm}-${cd}`;
            
            const dOfWeek = d.getDay();
            const dayName = dayNamesShort[dOfWeek];
            
            const presentCount = weeklyMap[dateStr] || 0;
            let percentage = totalEmployees > 0 ? Math.round((presentCount / totalEmployees) * 100) : 0;
            
            // Force 0% on Saturdays (6) and Sundays (0) per business rules
            if (dOfWeek === 0 || dOfWeek === 6) {
                percentage = 0;
            }
            
            // Cap at 100% to prevent calculations over 100% due to legacy data
            percentage = Math.min(100, percentage);
            
            weeklyTrend.push({
                day: dayName,
                val: percentage
            });
        }

        res.json({
            totalEmployees,
            presentToday,
            onLeave,
            lateToday,
            weeklyTrend
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

const getRecentAttendance = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT a.*, u.name, u.role as user_role 
            FROM attendance a 
            JOIN users u ON a.user_id = u.id 
            ORDER BY a.created_at DESC 
            LIMIT 5
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

const addEmployee = async (req, res) => {
    const { name, email, password, role, department, full_name, phone, gender } = req.body;
    const finalName = name || full_name;

    try {
        const userExist = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExist.rows.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Generate Employee ID robustly (find max ID for current year and increment)
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
        const employee_id = `EMP-${currentYear}-${String(nextNumber).padStart(3, '0')}`;

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await pool.query(
            'INSERT INTO users (name, email, password, role, employee_id, department, phone, gender) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name, email, role, employee_id, department, phone, gender',
            [finalName, email, hashedPassword, role || 'employee', employee_id, department, phone || null, gender || null]
        );

        res.status(201).json({
            message: 'Employee added successfully',
            user: newUser.rows[0],
            generatedPassword: password // Simple implementation as requested
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

const getEmployees = async (req, res) => {
    try {
        const employees = await pool.query("SELECT id, name, email, role, employee_id, department, phone, gender, created_at FROM users WHERE role = 'employee' ORDER BY created_at DESC");
        res.json(employees.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

const updateEmployee = async (req, res) => {
    const { id } = req.params;
    const { name, email, department, role, phone, gender } = req.body;
    try {
        const updated = await pool.query(
            'UPDATE users SET name = $1, email = $2, department = $3, role = $4, phone = $5, gender = $6 WHERE id = $7 RETURNING *',
            [name, email, department, role, phone || null, gender || null, id]
        );
        res.json(updated.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

const deleteEmployee = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ message: 'Employee deleted' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

const getAttendanceReport = async (req, res) => {
    const { startDate, endDate, userId } = req.query;
    try {
        let query = `
            SELECT a.*, u.name, u.employee_id, u.department 
            FROM attendance a 
            JOIN users u ON a.user_id = u.id 
            WHERE 1=1
        `;
        const params = [];

        if (startDate && endDate) {
            params.push(startDate, endDate);
            query += ` AND a.date BETWEEN $${params.length - 1} AND $${params.length}`;
        }
        if (userId) {
            params.push(userId);
            query += ` AND a.user_id = $${params.length}`;
        }

        query += " ORDER BY a.date DESC";
        const result = await pool.query(query, params);

        const enrichedReport = result.rows.map(item => {
            let late_early_status = 'N/A';
            let extra_working_time = 'N/A';

            if (item.check_in) {
                const checkIn = new Date(item.check_in);
                const checkInHour = checkIn.getHours();
                const checkInMinute = checkIn.getMinutes();
                const checkInMinutesSinceMidnight = checkInHour * 60 + checkInMinute;
                const targetMinutesSinceMidnight = 10 * 60; // 10:00 AM

                const diffInMins = checkInMinutesSinceMidnight - targetMinutesSinceMidnight;
                if (diffInMins > 0) {
                    late_early_status = `Late by ${diffInMins} mins`;
                } else if (diffInMins < 0) {
                    late_early_status = `Early by ${Math.abs(diffInMins)} mins`;
                } else {
                    late_early_status = 'On Time';
                }
            }

            if (item.check_out) {
                const checkOut = new Date(item.check_out);
                const checkOutHour = checkOut.getHours();
                const checkOutMinute = checkOut.getMinutes();
                const checkOutMinutesSinceMidnight = checkOutHour * 60 + checkOutMinute;
                const targetOutMinutesSinceMidnight = 19 * 60; // 7:00 PM

                const diffOutInMins = checkOutMinutesSinceMidnight - targetOutMinutesSinceMidnight;
                if (diffOutInMins > 0) {
                    const hours = Math.floor(diffOutInMins / 60);
                    const mins = diffOutInMins % 60;
                    extra_working_time = `Extra Work: ${hours}h ${mins}m`;
                }
            }

            return {
                ...item,
                late_early_status,
                extra_working_time
            };
        });

        res.json(enrichedReport);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

const getEmployeeAnalytics = async (req, res) => {
    const { id } = req.params;
    let { startDate, endDate } = req.query;

    try {
        // 1. Get employee details
        const employeeRes = await pool.query(
            "SELECT id, name, email, role, employee_id, department, phone, gender, created_at FROM users WHERE id = $1 AND role = 'employee'",
            [id]
        );
        if (employeeRes.rows.length === 0) {
            return res.status(404).json({ message: 'Employee not found' });
        }
        const employee = employeeRes.rows[0];

        // 2. Set default date range if missing (default to current month)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const defaultStart = `${year}-${month}-01`;
        const defaultEnd = `${year}-${month}-${String(now.getDate()).padStart(2, '0')}`;

        if (!startDate) startDate = defaultStart;
        if (!endDate) endDate = defaultEnd;

        // 3. Get all attendance records in range
        const attendanceRes = await pool.query(
            "SELECT * FROM attendance WHERE user_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date ASC",
            [id, startDate, endDate]
        );
        const attendanceRows = attendanceRes.rows;

        // Map rows by YYYY-MM-DD date key
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

        // 4. Generate daily logs day-by-day
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

        let current = new Date(start);
        while (current <= end) {
            const cy = current.getFullYear();
            const cm = String(current.getMonth() + 1).padStart(2, '0');
            const cd = String(current.getDate()).padStart(2, '0');
            const dateStr = `${cy}-${cm}-${cd}`;
            
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

                // Late / Early Check-In Logic
                let lateEarlyStatus = 'On Time';
                if (record.check_in && (lowercaseStatus === 'present' || lowercaseStatus === 'late')) {
                    const checkInTime = new Date(record.check_in);
                    const checkInHour = checkInTime.getHours();
                    const checkInMinute = checkInTime.getMinutes();
                    const checkInMinutesSinceMidnight = checkInHour * 60 + checkInMinute;
                    const targetMinutesSinceMidnight = 10 * 60; // 10:00 AM

                    const diffInMins = checkInMinutesSinceMidnight - targetMinutesSinceMidnight;
                    if (diffInMins > 0) {
                        lateEarlyStatus = `Late by ${diffInMins} mins`;
                    } else if (diffInMins < 0) {
                        lateEarlyStatus = `Early by ${Math.abs(diffInMins)} mins`;
                    }
                }

                // Extra Work Check-Out Logic
                let extraWorkingTime = 'N/A';
                if (record.check_out) {
                    const checkOutTime = new Date(record.check_out);
                    const checkOutHour = checkOutTime.getHours();
                    const checkOutMinute = checkOutTime.getMinutes();
                    const checkOutMinutesSinceMidnight = checkOutHour * 60 + checkOutMinute;
                    const targetOutMinutesSinceMidnight = 19 * 60; // 7:00 PM

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
                // No record found
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

            // Move to next day
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
        res.status(500).send('Server Error');
    }
};

module.exports = {
    getDashboardStats,
    getRecentAttendance,
    addEmployee,
    getEmployees,
    updateEmployee,
    deleteEmployee,
    getAttendanceReport,
    getEmployeeAnalytics
};
