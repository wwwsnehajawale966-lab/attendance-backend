const pool = require('../config/db');

exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        let queryText = '';
        let params = [userId];

        if (userRole === 'admin') {
            queryText = `
                SELECT id, user_id, title, message, is_read, created_at, related_id 
                FROM notifications 
                WHERE user_id = $1 OR user_id IS NULL 
                ORDER BY created_at DESC 
                LIMIT 15
            `;
        } else {
            queryText = `
                SELECT id, user_id, title, message, is_read, created_at, related_id 
                FROM notifications 
                WHERE user_id = $1 
                ORDER BY created_at DESC 
                LIMIT 15
            `;
        }

        const result = await pool.query(queryText, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        let queryText = '';
        let params = [id];

        if (userRole === 'admin') {
            // Admins can read their own or general/admin notifications (user_id IS NULL)
            queryText = `
                UPDATE notifications 
                SET is_read = TRUE 
                WHERE id = $1 AND (user_id = $2 OR user_id IS NULL) 
                RETURNING *
            `;
            params.push(userId);
        } else {
            // Employees can only mark their own notifications as read
            queryText = `
                UPDATE notifications 
                SET is_read = TRUE 
                WHERE id = $1 AND user_id = $2 
                RETURNING *
            `;
            params.push(userId);
        }

        const result = await pool.query(queryText, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Notification not found or unauthorized' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        let queryText = '';
        let params = [];

        if (userRole === 'admin') {
            queryText = `
                UPDATE notifications 
                SET is_read = TRUE 
                WHERE (user_id = $1 OR user_id IS NULL) AND is_read = FALSE
            `;
            params.push(userId);
        } else {
            queryText = `
                UPDATE notifications 
                SET is_read = TRUE 
                WHERE user_id = $1 AND is_read = FALSE
            `;
            params.push(userId);
        }

        await pool.query(queryText, params);
        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        let queryText = '';
        let params = [id];

        if (userRole === 'admin') {
            queryText = `
                DELETE FROM notifications 
                WHERE id = $1 AND (user_id = $2 OR user_id IS NULL) 
                RETURNING *
            `;
            params.push(userId);
        } else {
            queryText = `
                DELETE FROM notifications 
                WHERE id = $1 AND user_id = $2 
                RETURNING *
            `;
            params.push(userId);
        }

        const result = await pool.query(queryText, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Notification not found or unauthorized' });
        }

        res.json({ message: 'Notification deleted' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
