const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { auth } = require('../middleware/auth');

// @route   GET api/notifications
// @desc    Get user's or admin's recent notifications
// @access  Private
router.get('/', auth, notificationController.getNotifications);

// @route   PUT api/notifications/read-all
// @desc    Mark all notifications for this user as read
// @access  Private
router.put('/read-all', auth, notificationController.markAllAsRead);

// @route   PUT api/notifications/:id/read
// @desc    Mark a specific notification as read
// @access  Private
router.put('/:id/read', auth, notificationController.markAsRead);

// @route   DELETE api/notifications/:id
// @desc    Delete a specific notification
// @access  Private
router.delete('/:id', auth, notificationController.deleteNotification);

module.exports = router;
