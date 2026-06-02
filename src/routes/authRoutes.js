const express = require('express');
const router = express.Router();
const { register, login, adminLogin, employeeLogin, getMe, resetPassword, updateProfile, deleteProfile } = require('../controllers/authController');
const { auth } = require('../middleware/auth');

// @route   POST api/auth/register
// @desc    Register user
// @access  Public (In a real app, this might be restricted to admin)
router.post('/register', register);

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', login);

// @route   POST api/auth/admin-login
// @desc    Dedicated administrator portal authentication
// @access  Public
router.post('/admin-login', adminLogin);

// @route   POST api/auth/employee-login
// @desc    Dedicated employee portal authentication
// @access  Public
router.post('/employee-login', employeeLogin);

// @route   GET api/auth/me
// @desc    Get currently authenticated user's profile
// @access  Private
router.get('/me', auth, getMe);

// @route   PUT api/auth/profile
// @desc    Update currently authenticated user's profile
// @access  Private
router.put('/profile', auth, updateProfile);

// @route   DELETE api/auth/profile
// @desc    Delete currently authenticated user's profile
// @access  Private
router.delete('/profile', auth, deleteProfile);

// @route   POST api/auth/reset-password
// @desc    Verify credentials and reset user's password
// @access  Public
router.post('/reset-password', resetPassword);

module.exports = router;
