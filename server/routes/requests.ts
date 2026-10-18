import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.ts';
import { requireAuth } from '../auth.ts';
import { broadcastToUser } from '../ws.ts';

const router = Router();

// In-memory rate limiting map for chat requests: userId -> timestamps[]
const requestRateLimits = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 10;

  const timestamps = (requestRateLimits.get(userId) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    return false;
  }
  timestamps.push(now);
  requestRateLimits.set(userId, timestamps);
  return true;
}

// Send chat request
router.post('/', requireAuth, (req, res) => {
  try {
    const senderId = req.user!.id;
    const { targetUserId, message } = req.body; // targetUserId can be user internal id or USR-xxxx

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required.' });
    }

    if (!checkRateLimit(senderId)) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment before sending more requests.' });
    }

    // Resolve target user
    const targetUser = db.prepare('SELECT id, user_id, display_name FROM users WHERE id = ? OR user_id = ?').get(targetUserId, targetUserId.toUpperCase()) as any;
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found.' });
    }

    const receiverId = targetUser.id;

    // Rule: Cannot send request to yourself
    if (senderId === receiverId) {
      return res.status(400).json({ error: 'You cannot send a chat request to yourself.' });
    }

    // Rule: Check if either user has blocked the other
    const isBlocked = db.prepare(`
      SELECT 1 FROM blocked_users
      WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
    `).get(senderId, receiverId, receiverId, senderId);
    if (isBlocked) {
      return res.status(403).json({ error: 'Unable to send chat request to this user.' });
    }

    // Rule: Check if direct conversation already exists
    const existingConv = db.prepare(`
      SELECT cm1.conversation_id
      FROM conversation_members cm1
      JOIN conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
      WHERE cm1.user_id = ? AND cm2.user_id = ?
    `).get(senderId, receiverId) as any;

    if (existingConv) {
      return res.status(400).json({
        error: 'You are already connected with this user.',
        conversationId: existingConv.conversation_id,
      });
    }

    // Rule: Check if reverse pending request exists
    const reverseReq = db.prepare(`
      SELECT id FROM chat_requests
      WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'
    `).get(receiverId, senderId) as any;

    const now = new Date().toISOString();

    if (reverseReq) {
      // Reverse request exists: auto-accept and create conversation!
      db.prepare(`UPDATE chat_requests SET status = 'accepted', updated_at = ? WHERE id = ?`).run(now, reverseReq.id);

      const convId = `conv_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(`INSERT INTO conversations (id, type, created_at, updated_at) VALUES (?, 'direct', ?, ?)`).run(convId, now, now);
      db.prepare(`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`).run(convId, senderId, now);
      db.prepare(`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`).run(convId, receiverId, now);

      // Notify User B that request was mutually accepted
      const notifId = `notif_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, link, data_json, created_at)
        VALUES (?, ?, 'request_accepted', 'Chat Request Accepted', ?, ?, ?, ?)
      `).run(notifId, receiverId, `${req.user!.displayName} accepted your chat request.`, `/chat/${convId}`, JSON.stringify({ conversationId: convId }), now);

      broadcastToUser(receiverId, 'request_accepted', {
        requestId: reverseReq.id,
        conversationId: convId,
        user: { id: senderId, userId: req.user!.userId, displayName: req.user!.displayName },
      });

      return res.json({
        status: 'accepted',
        message: 'Mutual chat request connected! Conversation created.',
        conversationId: convId,
      });
    }

    // Rule: Check if pending request from sender to receiver already exists
    const existingReq = db.prepare(`
      SELECT id, status FROM chat_requests
      WHERE sender_id = ? AND receiver_id = ?
    `).get(senderId, receiverId) as any;

    if (existingReq) {
      if (existingReq.status === 'pending') {
        return res.status(409).json({ error: 'A pending chat request has already been sent to this user.' });
      } else if (existingReq.status === 'accepted') {
        return res.status(409).json({ error: 'Chat request has already been accepted.' });
      }
      // If rejected or cancelled, allow re-requesting by updating existing record
      db.prepare(`
        UPDATE chat_requests
        SET status = 'pending', message = ?, updated_at = ?
        WHERE id = ?
      `).run(message || '', now, existingReq.id);

      // Create notification for recipient
      const notifId = `notif_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, link, data_json, created_at)
        VALUES (?, ?, 'chat_request', 'New Chat Request', ?, '/requests', ?, ?)
      `).run(notifId, receiverId, `${req.user!.displayName} (${req.user!.userId}) sent you a chat request.`, JSON.stringify({ requestId: existingReq.id, senderId }), now);

      broadcastToUser(receiverId, 'new_chat_request', {
        requestId: existingReq.id,
        sender: { id: senderId, userId: req.user!.userId, displayName: req.user!.displayName },
        message: message || '',
        createdAt: now,
      });

      return res.json({
        status: 'pending',
        message: 'Chat request sent successfully.',
        requestId: existingReq.id,
      });
    }

    // Create new request
    const requestId = `req_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO chat_requests (id, sender_id, receiver_id, status, message, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?, ?)
    `).run(requestId, senderId, receiverId, message || '', now, now);

    // Notify receiver
    const notifId = `notif_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, link, data_json, created_at)
      VALUES (?, ?, 'chat_request', 'New Chat Request', ?, '/requests', ?, ?)
    `).run(notifId, receiverId, `${req.user!.displayName} (${req.user!.userId}) sent you a chat request.`, JSON.stringify({ requestId, senderId }), now);

    broadcastToUser(receiverId, 'new_chat_request', {
      requestId,
      sender: { id: senderId, userId: req.user!.userId, displayName: req.user!.displayName },
      message: message || '',
      createdAt: now,
    });

    return res.status(201).json({
      status: 'pending',
      message: 'Chat request sent successfully.',
      requestId,
    });
  } catch (err) {
    console.error('Send request error:', err);
    return res.status(500).json({ error: 'Failed to send chat request.' });
  }
});

// List incoming and outgoing requests
router.get('/', requireAuth, (req, res) => {
  try {
    const currentUserId = req.user!.id;

    const incoming = db.prepare(`
      SELECT r.id, r.sender_id, r.status, r.message, r.created_at, r.updated_at,
             u.id as user_db_id, u.user_id, u.username, u.display_name, u.avatar_url, u.status as user_status, u.last_seen_at
      FROM chat_requests r
      JOIN users u ON r.sender_id = u.id
      WHERE r.receiver_id = ?
      ORDER BY r.created_at DESC
    `).all(currentUserId) as any[];

    const outgoing = db.prepare(`
      SELECT r.id, r.receiver_id, r.status, r.message, r.created_at, r.updated_at,
             u.id as user_db_id, u.user_id, u.username, u.display_name, u.avatar_url, u.status as user_status, u.last_seen_at
      FROM chat_requests r
      JOIN users u ON r.receiver_id = u.id
      WHERE r.sender_id = ?
      ORDER BY r.created_at DESC
    `).all(currentUserId) as any[];

    return res.json({
      incoming: incoming.map((item) => ({
        id: item.id,
        status: item.status,
        message: item.message,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        sender: {
          id: item.user_db_id,
          userId: item.user_id,
          username: item.username,
          displayName: item.display_name,
          avatarUrl: item.avatar_url,
          status: item.user_status,
          lastSeenAt: item.last_seen_at,
        },
      })),
      outgoing: outgoing.map((item) => ({
        id: item.id,
        status: item.status,
        message: item.message,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        recipient: {
          id: item.user_db_id,
          userId: item.user_id,
          username: item.username,
          displayName: item.display_name,
          avatarUrl: item.avatar_url,
          status: item.user_status,
          lastSeenAt: item.last_seen_at,
        },
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch requests.' });
  }
});

// Accept chat request
router.post('/:id/accept', requireAuth, (req, res) => {
  try {
    const requestId = req.params.id;
    const currentUserId = req.user!.id;

    const request = db.prepare('SELECT * FROM chat_requests WHERE id = ?').get(requestId) as any;
    if (!request) {
      return res.status(404).json({ error: 'Chat request not found.' });
    }

    // Authorization: Only the intended recipient can accept
    if (request.receiver_id !== currentUserId) {
      return res.status(403).json({ error: 'You are not authorized to accept this request.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Cannot accept request with status '${request.status}'.` });
    }

    const now = new Date().toISOString();

    // Update request status
    db.prepare(`UPDATE chat_requests SET status = 'accepted', updated_at = ? WHERE id = ?`).run(now, requestId);

    // Create or find conversation
    let conv = db.prepare(`
      SELECT cm1.conversation_id
      FROM conversation_members cm1
      JOIN conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
      WHERE cm1.user_id = ? AND cm2.user_id = ?
    `).get(request.sender_id, currentUserId) as any;

    let conversationId = conv?.conversation_id;

    if (!conversationId) {
      conversationId = `conv_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(`INSERT INTO conversations (id, type, created_at, updated_at) VALUES (?, 'direct', ?, ?)`).run(conversationId, now, now);
      db.prepare(`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`).run(conversationId, request.sender_id, now);
      db.prepare(`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)`).run(conversationId, currentUserId, now);
    }

    // Send notification to sender
    const notifId = `notif_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, link, data_json, created_at)
      VALUES (?, ?, 'request_accepted', 'Chat Request Accepted', ?, ?, ?, ?)
    `).run(notifId, request.sender_id, `${req.user!.displayName} accepted your chat request!`, `/chat/${conversationId}`, JSON.stringify({ conversationId, acceptedBy: currentUserId }), now);

    broadcastToUser(request.sender_id, 'request_accepted', {
      requestId,
      conversationId,
      acceptedBy: {
        id: currentUserId,
        userId: req.user!.userId,
        displayName: req.user!.displayName,
      },
    });

    return res.json({
      success: true,
      message: 'Chat request accepted.',
      conversationId,
    });
  } catch (err) {
    console.error('Accept request error:', err);
    return res.status(500).json({ error: 'Failed to accept chat request.' });
  }
});

// Reject chat request
router.post('/:id/reject', requireAuth, (req, res) => {
  try {
    const requestId = req.params.id;
    const currentUserId = req.user!.id;

    const request = db.prepare('SELECT * FROM chat_requests WHERE id = ?').get(requestId) as any;
    if (!request) {
      return res.status(404).json({ error: 'Chat request not found.' });
    }

    if (request.receiver_id !== currentUserId) {
      return res.status(403).json({ error: 'You are not authorized to reject this request.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Cannot reject request with status '${request.status}'.` });
    }

    const now = new Date().toISOString();
    db.prepare(`UPDATE chat_requests SET status = 'rejected', updated_at = ? WHERE id = ?`).run(now, requestId);

    broadcastToUser(request.sender_id, 'request_rejected', {
      requestId,
      rejectedBy: { id: currentUserId, displayName: req.user!.displayName },
    });

    return res.json({ success: true, message: 'Chat request rejected.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reject chat request.' });
  }
});

// Cancel outgoing chat request
router.post('/:id/cancel', requireAuth, (req, res) => {
  try {
    const requestId = req.params.id;
    const currentUserId = req.user!.id;

    const request = db.prepare('SELECT * FROM chat_requests WHERE id = ?').get(requestId) as any;
    if (!request) {
      return res.status(404).json({ error: 'Chat request not found.' });
    }

    if (request.sender_id !== currentUserId) {
      return res.status(403).json({ error: 'You can only cancel your own outgoing requests.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Cannot cancel request with status '${request.status}'.` });
    }

    const now = new Date().toISOString();
    db.prepare(`UPDATE chat_requests SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(now, requestId);

    return res.json({ success: true, message: 'Chat request cancelled.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to cancel chat request.' });
  }
});

export default router;
