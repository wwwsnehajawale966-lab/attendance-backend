const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { auth, authorize } = require('../middleware/auth');

router.post('/check-in', auth, attendanceController.checkIn);
router.post('/check-out', auth, attendanceController.checkOut);
router.get('/today', auth, attendanceController.getTodayStatus);
router.get('/history', auth, attendanceController.getAttendanceHistory);
router.get('/leaves', auth, attendanceController.getEmployeeLeaves);

// Interactive Employee Reports & Leave Routes
router.get('/analytics', auth, attendanceController.getSelfAnalytics);
router.post('/leave-request', auth, attendanceController.submitLeaveRequest);
router.get('/leave-requests', auth, attendanceController.getLeaveRequests);
router.get('/report/pdf', auth, attendanceController.downloadPdfReport);
router.get('/report/excel', auth, attendanceController.downloadExcelReport);

// QR Code Attendance Routes
router.get('/qr-token', auth, authorize('admin'), attendanceController.generateQrToken);
router.post('/scan-qr', auth, attendanceController.scanQr);

module.exports = router;
