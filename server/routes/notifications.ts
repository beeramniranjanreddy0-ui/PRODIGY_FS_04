import { Router } from 'express';
import { db } from '../db.ts';
import { requireAuth } from '../auth.ts';

const router = Router();

// Get notifications
router.get('/', requireAuth, (req, res) => {
  try {
    const currentUserId = req.user!.id;
    const notifications = db.prepare(`
      SELECT id, type, title, body, link, data_json, is_read, created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(currentUserId) as any[];

    return res.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        data: JSON.parse(n.data_json || '{}'),
        isRead: !!n.is_read,
        createdAt: n.created_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

// Mark single notification read
router.post('/:id/read', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, req.user!.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to mark notification read.' });
  }
});

// Mark all read
router.post('/read-all', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to mark all read.' });
  }
});

export default router;
