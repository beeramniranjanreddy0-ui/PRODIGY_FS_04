import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.ts';
import { requireAuth } from '../auth.ts';
import { broadcastToConversation, broadcastToUser } from '../ws.ts';

const router = Router();

// Helper to check conversation membership
function verifyConversationMember(conversationId: string, userId: string): boolean {
  const member = db.prepare(`
    SELECT 1 FROM conversation_members
    WHERE conversation_id = ? AND user_id = ?
  `).get(conversationId, userId);
  return !!member;
}

// List conversations for authenticated user
router.get('/', requireAuth, (req, res) => {
  try {
    const currentUserId = req.user!.id;

    const convs = db.prepare(`
      SELECT c.id, c.type, c.created_at, c.updated_at,
             cm.last_read_message_id, cm.is_muted, cm.is_archived
      FROM conversations c
      JOIN conversation_members cm ON c.id = cm.conversation_id
      WHERE cm.user_id = ?
      ORDER BY c.updated_at DESC
    `).all(currentUserId) as any[];

    const result = convs.map((c) => {
      // Find the other member in direct chat
      const otherMember = db.prepare(`
        SELECT u.id, u.user_id, u.username, u.display_name, u.avatar_url, u.status, u.last_seen_at
        FROM conversation_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.conversation_id = ? AND cm.user_id != ?
      `).get(c.id, currentUserId) as any;

      // Get last message
      const lastMsg = db.prepare(`
        SELECT id, sender_id, content, file_name, file_url, is_deleted, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(c.id) as any;

      // Calculate unread count
      let unreadCount = 0;
      if (lastMsg) {
        if (c.last_read_message_id) {
          const unreadRecord = db.prepare(`
            SELECT COUNT(*) as count FROM messages
            WHERE conversation_id = ? AND created_at > (SELECT created_at FROM messages WHERE id = ?) AND sender_id != ?
          `).get(c.id, c.last_read_message_id, currentUserId) as any;
          unreadCount = unreadRecord?.count || 0;
        } else {
          const countAll = db.prepare(`
            SELECT COUNT(*) as count FROM messages
            WHERE conversation_id = ? AND sender_id != ?
          `).get(c.id, currentUserId) as any;
          unreadCount = countAll?.count || 0;
        }
      }

      return {
        id: c.id,
        type: c.type,
        updatedAt: c.updated_at,
        isMuted: !!c.is_muted,
        isArchived: !!c.is_archived,
        unreadCount,
        participant: otherMember ? {
          id: otherMember.id,
          userId: otherMember.user_id,
          username: otherMember.username,
          displayName: otherMember.display_name,
          avatarUrl: otherMember.avatar_url,
          status: otherMember.status,
          lastSeenAt: otherMember.last_seen_at,
        } : null,
        lastMessage: lastMsg ? {
          id: lastMsg.id,
          senderId: lastMsg.sender_id,
          content: lastMsg.is_deleted ? 'Message deleted' : (lastMsg.content || (lastMsg.file_name ? `📎 ${lastMsg.file_name}` : '')),
          createdAt: lastMsg.created_at,
        } : null,
      };
    });

    return res.json({ conversations: result });
  } catch (err) {
    console.error('List conversations error:', err);
    return res.status(500).json({ error: 'Failed to load conversations.' });
  }
});

// Get conversation details & membership
router.get('/:id', requireAuth, (req, res) => {
  const convId = req.params.id;
  const currentUserId = req.user!.id;

  if (!verifyConversationMember(convId, currentUserId)) {
    return res.status(403).json({ error: 'Access denied. You are not a member of this conversation.' });
  }

  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId) as any;
  if (!conv) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  const otherMember = db.prepare(`
    SELECT u.id, u.user_id, u.username, u.display_name, u.avatar_url, u.bio, u.status, u.last_seen_at
    FROM conversation_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.conversation_id = ? AND cm.user_id != ?
  `).get(convId, currentUserId) as any;

  const membership = db.prepare(`
    SELECT is_muted, is_archived, last_read_message_id
    FROM conversation_members
    WHERE conversation_id = ? AND user_id = ?
  `).get(convId, currentUserId) as any;

  // Get pinned messages
  const pinnedMessages = db.prepare(`
    SELECT id, sender_id, content, file_name, file_url, created_at
    FROM messages
    WHERE conversation_id = ? AND is_pinned = 1 AND is_deleted = 0
    ORDER BY created_at DESC
  `).all(convId) as any[];

  return res.json({
    conversation: {
      id: conv.id,
      type: conv.type,
      updatedAt: conv.updated_at,
      isMuted: !!membership?.is_muted,
      isArchived: !!membership?.is_archived,
      participant: otherMember,
      pinnedMessages,
    },
  });
});

// Get messages for conversation (with pagination & search)
router.get('/:id/messages', requireAuth, (req, res) => {
  try {
    const convId = req.params.id;
    const currentUserId = req.user!.id;

    if (!verifyConversationMember(convId, currentUserId)) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this conversation.' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
    const before = req.query.before as string; // message created_at timestamp cursor
    const query = ((req.query.q as string) || '').trim().toLowerCase();

    let sql = `
      SELECT m.id, m.conversation_id, m.sender_id, m.content, m.reply_to_id,
             m.file_url, m.file_name, m.file_size, m.file_type,
             m.is_pinned, m.is_edited, m.is_deleted, m.created_at, m.updated_at,
             u.user_id as sender_user_id, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ?
    `;
    const params: any[] = [convId];

    if (query) {
      sql += ` AND LOWER(m.content) LIKE ?`;
      params.push(`%${query}%`);
    }

    if (before) {
      sql += ` AND m.created_at < ?`;
      params.push(before);
    }

    sql += ` ORDER BY m.created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as any[];

    // Format messages with reactions, replies, and read receipts
    const messages = rows.reverse().map((msg) => {
      // Fetch reactions
      const reactions = db.prepare(`
        SELECT emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as user_ids
        FROM message_reactions
        WHERE message_id = ?
        GROUP BY emoji
      `).all(msg.id) as any[];

      const formattedReactions = reactions.map((r) => ({
        emoji: r.emoji,
        count: r.count,
        hasReacted: (r.user_ids || '').split(',').includes(currentUserId),
      }));

      // Fetch reply info if applicable
      let replyTo = null;
      if (msg.reply_to_id) {
        const parent = db.prepare(`
          SELECT m.id, m.content, m.is_deleted, u.display_name as sender_name
          FROM messages m
          JOIN users u ON m.sender_id = u.id
          WHERE m.id = ?
        `).get(msg.reply_to_id) as any;
        if (parent) {
          replyTo = {
            id: parent.id,
            content: parent.is_deleted ? 'Message deleted' : parent.content,
            senderName: parent.sender_name,
          };
        }
      }

      // Check receipt status
      const receipts = db.prepare(`
        SELECT status FROM message_receipts WHERE message_id = ? AND user_id != ?
      `).all(msg.id, msg.sender_id) as any[];
      const isRead = receipts.some((r) => r.status === 'read');

      return {
        id: msg.id,
        conversationId: msg.conversation_id,
        senderId: msg.sender_id,
        sender: {
          id: msg.sender_id,
          userId: msg.sender_user_id,
          username: msg.sender_username,
          displayName: msg.sender_name,
          avatarUrl: msg.sender_avatar,
        },
        content: msg.is_deleted ? 'This message was deleted' : msg.content,
        replyTo,
        fileUrl: msg.is_deleted ? null : msg.file_url,
        fileName: msg.is_deleted ? null : msg.file_name,
        fileSize: msg.is_deleted ? null : msg.file_size,
        fileType: msg.is_deleted ? null : msg.file_type,
        isPinned: !!msg.is_pinned,
        isEdited: !!msg.is_edited,
        isDeleted: !!msg.is_deleted,
        status: isRead ? 'read' : 'delivered',
        reactions: formattedReactions,
        createdAt: msg.created_at,
        updatedAt: msg.updated_at,
      };
    });

    return res.json({ messages });
  } catch (err) {
    console.error('Fetch messages error:', err);
    return res.status(500).json({ error: 'Failed to fetch messages.' });
  }
});

// Send message to conversation
router.post('/:id/messages', requireAuth, (req, res) => {
  try {
    const convId = req.params.id;
    const currentUserId = req.user!.id;
    const { content, replyToId, fileUrl, fileName, fileSize, fileType, clientMessageId } = req.body;

    if (!verifyConversationMember(convId, currentUserId)) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this conversation.' });
    }

    if ((!content || !content.trim()) && !fileUrl) {
      return res.status(400).json({ error: 'Message content or file attachment is required.' });
    }

    // Idempotency check: if client supplied clientMessageId, check if already created
    if (clientMessageId) {
      const existingMsg = db.prepare('SELECT id FROM messages WHERE id = ?').get(clientMessageId) as any;
      if (existingMsg) {
        return res.json({ messageId: existingMsg.id, status: 'already_processed' });
      }
    }

    const messageId = clientMessageId || `msg_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();

    // Insert message into DB
    db.prepare(`
      INSERT INTO messages (id, conversation_id, room_id, sender_id, content, reply_to_id, file_url, file_name, file_size, file_type, is_pinned, is_edited, is_deleted, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
    `).run(
      messageId,
      convId,
      currentUserId,
      (content || '').trim(),
      replyToId || null,
      fileUrl || null,
      fileName || null,
      fileSize || null,
      fileType || null,
      now,
      now
    );

    // Update conversation timestamp
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, convId);

    // Update sender's last_read_message_id
    db.prepare(`
      UPDATE conversation_members
      SET last_read_message_id = ?
      WHERE conversation_id = ? AND user_id = ?
    `).run(messageId, convId, currentUserId);

    // Build message payload
    let replyTo = null;
    if (replyToId) {
      const parent = db.prepare(`
        SELECT m.id, m.content, u.display_name as sender_name
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.id = ?
      `).get(replyToId) as any;
      if (parent) {
        replyTo = { id: parent.id, content: parent.content, senderName: parent.sender_name };
      }
    }

    const messagePayload = {
      id: messageId,
      conversationId: convId,
      senderId: currentUserId,
      sender: {
        id: currentUserId,
        userId: req.user!.userId,
        username: req.user!.username,
        displayName: req.user!.displayName,
        avatarUrl: req.user!.avatarUrl || '',
      },
      content: (content || '').trim(),
      replyTo,
      fileUrl: fileUrl || null,
      fileName: fileName || null,
      fileSize: fileSize || null,
      fileType: fileType || null,
      isPinned: false,
      isEdited: false,
      isDeleted: false,
      status: 'delivered',
      reactions: [],
      createdAt: now,
      updatedAt: now,
    };

    // Broadcast over WebSocket to all members in conversation
    broadcastToConversation(convId, 'chat:message', messagePayload);

    // Also notify other member if conversation is not muted
    const otherMember = db.prepare(`
      SELECT cm.user_id, cm.is_muted
      FROM conversation_members cm
      WHERE cm.conversation_id = ? AND cm.user_id != ?
    `).get(convId, currentUserId) as any;

    if (otherMember && !otherMember.is_muted) {
      const snippet = content ? content.trim().substring(0, 80) : `Sent an attachment: ${fileName || 'file'}`;
      const notifId = `notif_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, link, data_json, created_at)
        VALUES (?, ?, 'new_message', ?, ?, ?, ?, ?)
      `).run(notifId, otherMember.user_id, `New message from ${req.user!.displayName}`, snippet, `/chat/${convId}`, JSON.stringify({ conversationId: convId, messageId }), now);

      broadcastToUser(otherMember.user_id, 'notification:new', {
        id: notifId,
        title: `New message from ${req.user!.displayName}`,
        body: snippet,
        link: `/chat/${convId}`,
      });
    }

    return res.status(201).json({ message: messagePayload });
  } catch (err) {
    console.error('Send message error:', err);
    return res.status(500).json({ error: 'Failed to send message.' });
  }
});

// Edit message (author only)
router.patch('/:id/messages/:msgId', requireAuth, (req, res) => {
  try {
    const { id: convId, msgId } = req.params;
    const { content } = req.body;
    const currentUserId = req.user!.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content cannot be empty.' });
    }

    const message = db.prepare('SELECT * FROM messages WHERE id = ? AND conversation_id = ?').get(msgId, convId) as any;
    if (!message) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    if (message.sender_id !== currentUserId) {
      return res.status(403).json({ error: 'You can only edit your own messages.' });
    }

    if (message.is_deleted) {
      return res.status(400).json({ error: 'Cannot edit a deleted message.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE messages
      SET content = ?, is_edited = 1, updated_at = ?
      WHERE id = ?
    `).run(content.trim(), now, msgId);

    broadcastToConversation(convId, 'chat:edit', {
      conversationId: convId,
      messageId: msgId,
      content: content.trim(),
      updatedAt: now,
    });

    return res.json({ success: true, messageId: msgId, content: content.trim() });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to edit message.' });
  }
});

// Delete message (author only)
router.delete('/:id/messages/:msgId', requireAuth, (req, res) => {
  try {
    const { id: convId, msgId } = req.params;
    const currentUserId = req.user!.id;

    const message = db.prepare('SELECT * FROM messages WHERE id = ? AND conversation_id = ?').get(msgId, convId) as any;
    if (!message) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    if (message.sender_id !== currentUserId) {
      return res.status(403).json({ error: 'You can only delete your own messages.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE messages
      SET content = 'This message was deleted', is_deleted = 1, file_url = NULL, updated_at = ?
      WHERE id = ?
    `).run(now, msgId);

    broadcastToConversation(convId, 'chat:delete', {
      conversationId: convId,
      messageId: msgId,
    });

    return res.json({ success: true, messageId: msgId });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete message.' });
  }
});

// Toggle Pin message
router.post('/:id/messages/:msgId/pin', requireAuth, (req, res) => {
  try {
    const { id: convId, msgId } = req.params;
    const currentUserId = req.user!.id;

    if (!verifyConversationMember(convId, currentUserId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const message = db.prepare('SELECT is_pinned FROM messages WHERE id = ? AND conversation_id = ?').get(msgId, convId) as any;
    if (!message) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    const newPinned = message.is_pinned ? 0 : 1;
    const now = new Date().toISOString();
    db.prepare('UPDATE messages SET is_pinned = ?, updated_at = ? WHERE id = ?').run(newPinned, now, msgId);

    broadcastToConversation(convId, 'chat:pin', {
      conversationId: convId,
      messageId: msgId,
      isPinned: !!newPinned,
    });

    return res.json({ success: true, messageId: msgId, isPinned: !!newPinned });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to toggle pin.' });
  }
});

// Toggle Emoji Reaction
router.post('/:id/messages/:msgId/reactions', requireAuth, (req, res) => {
  try {
    const { id: convId, msgId } = req.params;
    const { emoji } = req.body;
    const currentUserId = req.user!.id;

    if (!verifyConversationMember(convId, currentUserId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required.' });
    }

    const existing = db.prepare(`
      SELECT id FROM message_reactions
      WHERE message_id = ? AND user_id = ? AND emoji = ?
    `).get(msgId, currentUserId, emoji) as any;

    if (existing) {
      db.prepare('DELETE FROM message_reactions WHERE id = ?').run(existing.id);
    } else {
      const reactId = `react_${crypto.randomBytes(8).toString('hex')}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO message_reactions (id, message_id, user_id, emoji, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(reactId, msgId, currentUserId, emoji, now);
    }

    // Return updated reactions for this message
    const reactions = db.prepare(`
      SELECT emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as user_ids
      FROM message_reactions
      WHERE message_id = ?
      GROUP BY emoji
    `).all(msgId) as any[];

    const formatted = reactions.map((r) => ({
      emoji: r.emoji,
      count: r.count,
      hasReacted: (r.user_ids || '').split(',').includes(currentUserId),
    }));

    broadcastToConversation(convId, 'chat:reaction', {
      conversationId: convId,
      messageId: msgId,
      reactions: formatted,
    });

    return res.json({ success: true, reactions: formatted });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update reaction.' });
  }
});

// Mark conversation read
router.post('/:id/read', requireAuth, (req, res) => {
  try {
    const convId = req.params.id;
    const currentUserId = req.user!.id;

    if (!verifyConversationMember(convId, currentUserId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const latest = db.prepare('SELECT id FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1').get(convId) as any;
    if (latest) {
      db.prepare(`
        UPDATE conversation_members
        SET last_read_message_id = ?
        WHERE conversation_id = ? AND user_id = ?
      `).run(latest.id, convId, currentUserId);

      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO message_receipts (id, message_id, user_id, status, updated_at)
        VALUES (?, ?, ?, 'read', ?)
        ON CONFLICT(message_id, user_id) DO UPDATE SET status = 'read', updated_at = excluded.updated_at
      `).run(`rcpt_${Date.now()}_${currentUserId}`, latest.id, currentUserId, now);

      broadcastToConversation(convId, 'chat:read', {
        conversationId: convId,
        messageId: latest.id,
        readBy: currentUserId,
      });
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to mark read.' });
  }
});

// Update conversation settings (mute, archive)
router.patch('/:id/settings', requireAuth, (req, res) => {
  try {
    const convId = req.params.id;
    const currentUserId = req.user!.id;
    const { isMuted, isArchived } = req.body;

    if (!verifyConversationMember(convId, currentUserId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const member = db.prepare('SELECT is_muted, is_archived FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(convId, currentUserId) as any;
    const newMuted = isMuted !== undefined ? (isMuted ? 1 : 0) : member.is_muted;
    const newArchived = isArchived !== undefined ? (isArchived ? 1 : 0) : member.is_archived;

    db.prepare(`
      UPDATE conversation_members
      SET is_muted = ?, is_archived = ?
      WHERE conversation_id = ? AND user_id = ?
    `).run(newMuted, newArchived, convId, currentUserId);

    return res.json({ success: true, isMuted: !!newMuted, isArchived: !!newArchived });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update settings.' });
  }
});

export default router;
