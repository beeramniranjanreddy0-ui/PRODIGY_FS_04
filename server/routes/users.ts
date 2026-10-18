import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.ts';
import { requireAuth } from '../auth.ts';

const router = Router();

// Search users by public User ID (e.g. USR-1042) or username/display name
router.get('/search', requireAuth, (req, res) => {
  try {
    const q = ((req.query.q as string) || '').trim();
    if (!q) {
      return res.json({ users: [] });
    }

    const currentUserId = req.user!.id;

    // Search query: exact match on USR-xxxx or fuzzy match on username / display_name
    let users: any[] = [];
    if (q.toUpperCase().startsWith('USR-') || /^USR/i.test(q)) {
      users = db.prepare(`
        SELECT id, user_id, username, display_name, avatar_url, bio, status, last_seen_at
        FROM users
        WHERE UPPER(user_id) LIKE ? AND id != ?
        LIMIT 15
      `).all(`${q.toUpperCase()}%`, currentUserId);
    } else {
      users = db.prepare(`
        SELECT id, user_id, username, display_name, avatar_url, bio, status, last_seen_at
        FROM users
        WHERE (LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?) AND id != ?
        LIMIT 15
      `).all(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`, currentUserId);
    }

    // Filter out users who have blocked the current user or are blocked by current user
    const results = users.map((u) => {
      const isBlocked = db.prepare(`
        SELECT 1 FROM blocked_users
        WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
      `).get(currentUserId, u.id, u.id, currentUserId);

      if (isBlocked) {
        return null;
      }

      // Check relationship status with this user
      // 1. Direct conversation exists?
      const existingConv = db.prepare(`
        SELECT cm1.conversation_id
        FROM conversation_members cm1
        JOIN conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
        WHERE cm1.user_id = ? AND cm2.user_id = ?
      `).get(currentUserId, u.id) as any;

      // 2. Chat request status?
      const chatReq = db.prepare(`
        SELECT id, sender_id, receiver_id, status
        FROM chat_requests
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `).get(currentUserId, u.id, u.id, currentUserId) as any;

      let relationship = 'none'; // 'none' | 'pending_sent' | 'pending_received' | 'connected'
      if (existingConv) {
        relationship = 'connected';
      } else if (chatReq) {
        if (chatReq.status === 'accepted') {
          relationship = 'connected';
        } else if (chatReq.status === 'pending') {
          relationship = chatReq.sender_id === currentUserId ? 'pending_sent' : 'pending_received';
        }
      }

      return {
        id: u.id,
        userId: u.user_id,
        username: u.username,
        displayName: u.display_name,
        avatarUrl: u.avatar_url,
        bio: u.bio,
        status: u.status,
        lastSeenAt: u.last_seen_at,
        relationship,
        conversationId: existingConv?.conversation_id || null,
        requestId: chatReq?.id || null,
      };
    }).filter(Boolean);

    return res.json({ users: results });
  } catch (err) {
    console.error('User search error:', err);
    return res.status(500).json({ error: 'Search failed.' });
  }
});

// Get user profile by ID or User ID
router.get('/profile/:id', requireAuth, (req, res) => {
  const target = req.params.id;
  const user = db.prepare(`
    SELECT id, user_id, username, display_name, avatar_url, bio, status_message, status, last_seen_at, created_at
    FROM users
    WHERE id = ? OR user_id = ?
  `).get(target, target.toUpperCase()) as any;

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Check relationship
  const currentUserId = req.user!.id;
  const isBlocked = !!db.prepare('SELECT 1 FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?').get(currentUserId, user.id);

  return res.json({
    user: {
      id: user.id,
      userId: user.user_id,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      bio: user.bio,
      statusMessage: user.status_message,
      status: user.status,
      lastSeenAt: user.last_seen_at,
      createdAt: user.created_at,
      isBlocked,
    },
  });
});

// Update own profile
router.patch('/me/profile', requireAuth, (req, res) => {
  try {
    const { displayName, bio, statusMessage, avatarUrl, status } = req.body;
    const now = new Date().toISOString();

    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as any;
    if (!current) return res.status(404).json({ error: 'User not found' });

    const newDisplayName = displayName !== undefined ? displayName.trim() : current.display_name;
    const newBio = bio !== undefined ? bio.trim() : current.bio;
    const newStatusMsg = statusMessage !== undefined ? statusMessage.trim() : current.status_message;
    const newAvatar = avatarUrl !== undefined ? avatarUrl : current.avatar_url;
    const newStatus = status !== undefined ? status : current.status;

    db.prepare(`
      UPDATE users
      SET display_name = ?, bio = ?, status_message = ?, avatar_url = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(newDisplayName, newBio, newStatusMsg, newAvatar, newStatus, now, req.user!.id);

    return res.json({
      user: {
        id: req.user!.id,
        userId: current.user_id,
        username: current.username,
        email: current.email,
        displayName: newDisplayName,
        avatarUrl: newAvatar,
        bio: newBio,
        statusMessage: newStatusMsg,
        status: newStatus,
        lastSeenAt: current.last_seen_at,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Profile update failed.' });
  }
});

// Block user
router.post('/block', requireAuth, (req, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId || targetUserId === req.user!.id) {
      return res.status(400).json({ error: 'Invalid user to block.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id, created_at)
      VALUES (?, ?, ?)
    `).run(req.user!.id, targetUserId, now);

    // Cancel any pending chat requests between them
    db.prepare(`
      UPDATE chat_requests
      SET status = 'cancelled', updated_at = ?
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) AND status = 'pending'
    `).run(now, req.user!.id, targetUserId, targetUserId, req.user!.id);

    return res.json({ success: true, message: 'User blocked.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to block user.' });
  }
});

// Unblock user
router.post('/unblock', requireAuth, (req, res) => {
  try {
    const { targetUserId } = req.body;
    db.prepare('DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?').run(req.user!.id, targetUserId);
    return res.json({ success: true, message: 'User unblocked.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to unblock user.' });
  }
});

// List blocked users
router.get('/blocked', requireAuth, (req, res) => {
  const blocked = db.prepare(`
    SELECT u.id, u.user_id, u.username, u.display_name, u.avatar_url, b.created_at as blocked_at
    FROM blocked_users b
    JOIN users u ON b.blocked_id = u.id
    WHERE b.blocker_id = ?
    ORDER BY b.created_at DESC
  `).all(req.user!.id);

  return res.json({ blocked });
});

// Report user or message
router.post('/report', requireAuth, (req, res) => {
  try {
    const { reportedUserId, reason, details, messageId } = req.body;
    if (!reportedUserId || !reason) {
      return res.status(400).json({ error: 'Reported user ID and reason are required.' });
    }

    const reportId = `rep_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO user_reports (id, reporter_id, reported_user_id, reason, details, message_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(reportId, req.user!.id, reportedUserId, reason, details || '', messageId || null, now);

    return res.status(201).json({ success: true, message: 'Report submitted for review.' });
  } catch (err) {
    return res.status(500).json({ error: 'Report submission failed.' });
  }
});

export default router;
