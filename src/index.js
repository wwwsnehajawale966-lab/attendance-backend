const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const initDb = require('./config/initDb');

// Initialize Database
initDb();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Basic Route
app.get('/', (req, res) => {
    res.json({ message: 'Attendance System API is running' });
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

// Compatibility / Alias Routes (as requested in specifications)
const { auth, authorize } = require('./middleware/auth');
const adminController = require('./controllers/adminController');
const attendanceController = require('./controllers/attendanceController');

// POST /api/employees/add -> /api/admin/add-employee
app.post('/api/employees/add', auth, authorize('admin'), adminController.addEmployee);

// GET /api/employees -> /api/admin/employees
app.get('/api/employees', auth, authorize('admin'), adminController.getEmployees);

// POST /api/attendance/checkin -> /api/attendance/check-in
app.post('/api/attendance/checkin', auth, attendanceController.checkIn);

// POST /api/attendance/checkout -> /api/attendance/check-out
app.post('/api/attendance/checkout', auth, attendanceController.checkOut);

// GET /api/attendance/report -> /api/admin/report
app.get('/api/attendance/report', auth, authorize('admin'), adminController.getAttendanceReport);

// GET /api/dashboard/stats -> /api/admin/stats
app.get('/api/dashboard/stats', auth, authorize('admin'), adminController.getDashboardStats);


// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
