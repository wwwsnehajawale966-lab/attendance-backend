const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { auth, authorize } = require('../middleware/auth');

router.post('/check-in', auth, attendanceController.checkIn);
router.post('/check-out', auth, attendanceController.checkOut);
router.get('/today', auth, attendanceController.getTodayStatus);
router.get('/history', auth, attendanceController.getAttendanceHistory);
router.get('/leaves', auth, attendanceController.getEmployeeLeaves);

// QR Code Attendance Routes
router.get('/qr-token', auth, authorize('admin'), attendanceController.generateQrToken);
router.post('/scan-qr', auth, attendanceController.scanQr);

module.exports = router;
