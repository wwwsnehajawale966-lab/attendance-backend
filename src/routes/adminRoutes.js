const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const {
    getDashboardStats,
    getRecentAttendance,
    addEmployee,
    getEmployees,
    updateEmployee,
    deleteEmployee,
    getAttendanceReport,
    getEmployeeAnalytics
} = require('../controllers/adminController');

// @route   GET api/admin/stats
router.get('/stats', auth, authorize('admin'), getDashboardStats);

// @route   GET api/admin/recent-attendance
router.get('/recent-attendance', auth, authorize('admin'), getRecentAttendance);

// @route   POST api/admin/add-employee
router.post('/add-employee', auth, authorize('admin'), addEmployee);

// @route   GET api/admin/employees
router.get('/employees', auth, authorize('admin'), getEmployees);

// @route   PUT api/admin/employee/:id
router.put('/employee/:id', auth, authorize('admin'), updateEmployee);

// @route   DELETE api/admin/employee/:id
router.delete('/employee/:id', auth, authorize('admin'), deleteEmployee);

// @route   GET api/admin/report
router.get('/report', auth, authorize('admin'), getAttendanceReport);

// @route   GET api/admin/employee/:id/analytics
router.get('/employee/:id/analytics', auth, authorize('admin'), getEmployeeAnalytics);

module.exports = router;

