import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.ts';
import { requireAuth } from '../auth.ts';
import { generateRoomId, generateInviteCode } from '../id-generator.ts';
import { broadcastToRoom, broadcastToUser } from '../ws.ts';

const router = Router();

// In-memory slow mode tracker: roomId -> userId -> lastMessageTimestamp
const roomSlowModeTracker = new Map<string, Map<string, number>>();

// Helper: Get user's role in a room (null if not member, or if banned)
function getRoomMember(roomId: string, userId: string): { role: string; isBanned: boolean; isMuted: boolean; joinedAt: string } | null {
  const row = db.prepare(`
    SELECT role, is_banned, is_muted, joined_at
    FROM room_members
    WHERE room_id = ? AND user_id = ?
  `).get(roomId, userId) as any;

  if (!row) return null;
  return {
    role: row.role,
    isBanned: !!row.is_banned,
    isMuted: !!row.is_muted,
    joinedAt: row.joined_at,
  };
}

// Helper: Get room permissions
function getRoomPermissions(roomId: string) {
  return db.prepare('SELECT * FROM room_permissions WHERE room_id = ?').get(roomId) as any;
}

// Create new room
router.post('/', requireAuth, (req, res) => {
  try {
    const { name, description, visibility, permissions } = req.body;
    const ownerId = req.user!.id;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Room name is required.' });
    }

    const roomId = `room_${crypto.randomBytes(8).toString('hex')}`;
    const publicRoomId = generateRoomId();
    const inviteCode = generateInviteCode();
    const now = new Date().toISOString();

    const roomVisibility = ['public', 'private', 'invite_only'].includes(visibility) ? visibility : 'public';

    db.prepare(`
      INSERT INTO chat_rooms (id, room_id, name, description, owner_id, visibility, invite_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(roomId, publicRoomId, name.trim(), (description || '').trim(), ownerId, roomVisibility, inviteCode, now, now);

    // Initial permissions
    const perms = {
      joinPolicy: permissions?.joinPolicy || (roomVisibility === 'public' ? 'open' : roomVisibility === 'invite_only' ? 'invite_only' : 'approval_required'),
      messageSendPolicy: permissions?.messageSendPolicy || 'all',
      invitePolicy: permissions?.invitePolicy || 'all',
      editRoomInfoPolicy: permissions?.editRoomInfoPolicy || 'admins_only',
      pinMessagePolicy: permissions?.pinMessagePolicy || 'admins_only',
      deleteMessagePolicy: permissions?.deleteMessagePolicy || 'admins_only',
      fileUploadEnabled: permissions?.fileUploadEnabled !== undefined ? (permissions.fileUploadEnabled ? 1 : 0) : 1,
      historyVisibleToNewMembers: permissions?.historyVisibleToNewMembers !== undefined ? (permissions.historyVisibleToNewMembers ? 1 : 0) : 1,
      slowModeSeconds: permissions?.slowModeSeconds || 0,
      threadRepliesEnabled: permissions?.threadRepliesEnabled !== undefined ? (permissions.threadRepliesEnabled ? 1 : 0) : 1,
    };

    db.prepare(`
      INSERT INTO room_permissions (room_id, join_policy, message_send_policy, invite_policy, edit_room_info_policy, pin_message_policy, delete_message_policy, file_upload_enabled, history_visible_to_new_members, slow_mode_seconds, thread_replies_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      roomId,
      perms.joinPolicy,
      perms.messageSendPolicy,
      perms.invitePolicy,
      perms.editRoomInfoPolicy,
      perms.pinMessagePolicy,
      perms.deleteMessagePolicy,
      perms.fileUploadEnabled,
      perms.historyVisibleToNewMembers,
      perms.slowModeSeconds,
      perms.threadRepliesEnabled
    );

    // Add owner as room member with 'owner' role
    db.prepare(`
      INSERT INTO room_members (room_id, user_id, role, joined_at)
      VALUES (?, ?, 'owner', ?)
    `).run(roomId, ownerId, now);

    // Log audit
    db.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details, created_at)
      VALUES (?, ?, 'create_room', 'room', ?, ?, ?)
    `).run(`log_${Date.now()}`, ownerId, roomId, `Created room "${name.trim()}" (${publicRoomId})`, now);

    return res.status(201).json({
      room: {
        id: roomId,
        roomId: publicRoomId,
        name: name.trim(),
        description: (description || '').trim(),
        ownerId,
        visibility: roomVisibility,
        inviteCode,
        role: 'owner',
        createdAt: now,
        permissions: perms,
      },
    });
  } catch (err) {
    console.error('Create room error:', err);
    return res.status(500).json({ error: 'Failed to create room.' });
  }
});

// Batch create multiple rooms at once
router.post('/batch', requireAuth, (req, res) => {
  try {
    const { rooms } = req.body; // Array of { name, description, visibility, permissions }
    const ownerId = req.user!.id;

    if (!Array.isArray(rooms) || rooms.length === 0) {
      return res.status(400).json({ error: 'At least one room definition is required.' });
    }

    if (rooms.length > 20) {
      return res.status(400).json({ error: 'Cannot create more than 20 rooms at once.' });
    }

    const createdRooms: any[] = [];
    const insertRoom = db.prepare(`
      INSERT INTO chat_rooms (id, room_id, name, description, owner_id, visibility, invite_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPerms = db.prepare(`
      INSERT INTO room_permissions (room_id, join_policy, message_send_policy, invite_policy, edit_room_info_policy, pin_message_policy, delete_message_policy, file_upload_enabled, history_visible_to_new_members, slow_mode_seconds, thread_replies_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMember = db.prepare(`
      INSERT INTO room_members (room_id, user_id, role, joined_at)
      VALUES (?, ?, 'owner', ?)
    `);

    const insertAudit = db.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details, created_at)
      VALUES (?, ?, 'create_room', 'room', ?, ?, ?)
    `);

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const item of rooms) {
        const name = (item.name || '').trim();
        if (!name) continue;

        const description = (item.description || '').trim();
        const visibility = ['public', 'private', 'invite_only'].includes(item.visibility) ? item.visibility : 'public';
        const roomId = `room_${crypto.randomBytes(8).toString('hex')}`;
        const publicRoomId = generateRoomId();
        const inviteCode = generateInviteCode();
        const now = new Date().toISOString();

        insertRoom.run(roomId, publicRoomId, name, description, ownerId, visibility, inviteCode, now, now);

        const perms = {
          joinPolicy: item.permissions?.joinPolicy || (visibility === 'public' ? 'open' : visibility === 'invite_only' ? 'invite_only' : 'approval_required'),
          messageSendPolicy: item.permissions?.messageSendPolicy || 'all',
          invitePolicy: item.permissions?.invitePolicy || 'all',
          editRoomInfoPolicy: item.permissions?.editRoomInfoPolicy || 'admins_only',
          pinMessagePolicy: item.permissions?.pinMessagePolicy || 'admins_only',
          deleteMessagePolicy: item.permissions?.deleteMessagePolicy || 'admins_only',
          fileUploadEnabled: item.permissions?.fileUploadEnabled !== undefined ? (item.permissions.fileUploadEnabled ? 1 : 0) : 1,
          historyVisibleToNewMembers: item.permissions?.historyVisibleToNewMembers !== undefined ? (item.permissions.historyVisibleToNewMembers ? 1 : 0) : 1,
          slowModeSeconds: item.permissions?.slowModeSeconds || 0,
          threadRepliesEnabled: item.permissions?.threadRepliesEnabled !== undefined ? (item.permissions.threadRepliesEnabled ? 1 : 0) : 1,
        };

        insertPerms.run(
          roomId,
          perms.joinPolicy,
          perms.messageSendPolicy,
          perms.invitePolicy,
          perms.editRoomInfoPolicy,
          perms.pinMessagePolicy,
          perms.deleteMessagePolicy,
          perms.fileUploadEnabled,
          perms.historyVisibleToNewMembers,
          perms.slowModeSeconds,
          perms.threadRepliesEnabled
        );

        insertMember.run(roomId, ownerId, now);
        insertAudit.run(`log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`, ownerId, roomId, `Batch created room "${name}" (${publicRoomId})`, now);

        createdRooms.push({
          id: roomId,
          roomId: publicRoomId,
          name,
          description,
          ownerId,
          visibility,
          inviteCode,
          role: 'owner',
          createdAt: now,
          permissions: perms,
        });
      }
      db.exec('COMMIT');
    } catch (txnErr) {
      db.exec('ROLLBACK');
      throw txnErr;
    }

    if (createdRooms.length === 0) {
      return res.status(400).json({ error: 'No valid room names provided.' });
    }

    return res.status(201).json({
      message: `Successfully created ${createdRooms.length} room(s).`,
      rooms: createdRooms,
    });
  } catch (err) {
    console.error('Batch create room error:', err);
    return res.status(500).json({ error: 'Failed to create rooms.' });
  }
});

// List rooms (user's joined rooms + explore public rooms)
router.get('/', requireAuth, (req, res) => {
  try {
    const currentUserId = req.user!.id;

    // Joined rooms
    const joined = db.prepare(`
      SELECT r.id, r.room_id, r.name, r.description, r.owner_id, r.visibility, r.created_at, r.updated_at,
             rm.role, rm.joined_at,
             (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND is_banned = 0) as member_count
      FROM chat_rooms r
      JOIN room_members rm ON r.id = rm.room_id
      WHERE rm.user_id = ? AND rm.is_banned = 0
      ORDER BY r.updated_at DESC
    `).all(currentUserId) as any[];

    // Public rooms not joined
    const publicRooms = db.prepare(`
      SELECT r.id, r.room_id, r.name, r.description, r.owner_id, r.visibility, r.created_at, r.updated_at,
             (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND is_banned = 0) as member_count
      FROM chat_rooms r
      WHERE r.visibility = 'public'
        AND r.id NOT IN (SELECT room_id FROM room_members WHERE user_id = ? AND is_banned = 0)
      ORDER BY member_count DESC, r.created_at DESC
      LIMIT 20
    `).all(currentUserId) as any[];

    return res.json({
      joined: joined.map((r) => ({
        id: r.id,
        roomId: r.room_id,
        name: r.name,
        description: r.description,
        ownerId: r.owner_id,
        visibility: r.visibility,
        role: r.role,
        memberCount: r.member_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      explore: publicRooms.map((r) => ({
        id: r.id,
        roomId: r.room_id,
        name: r.name,
        description: r.description,
        ownerId: r.owner_id,
        visibility: r.visibility,
        memberCount: r.member_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch rooms.' });
  }
});

// Search rooms by Room ID (e.g. ROOM-1010) or name / description
router.get('/search', requireAuth, (req, res) => {
  try {
    const q = ((req.query.q as string) || '').trim();
    if (!q) {
      return res.json({ rooms: [] });
    }

    const currentUserId = req.user!.id;
    const cleanQ = q.toUpperCase();

    let matchedRooms: any[] = [];

    if (cleanQ.startsWith('ROOM-') || /^ROOM/i.test(q)) {
      matchedRooms = db.prepare(`
        SELECT r.*,
               (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND is_banned = 0) as member_count
        FROM chat_rooms r
        WHERE UPPER(r.room_id) LIKE ? OR r.id = ?
        LIMIT 20
      `).all(`${cleanQ}%`, q) as any[];
    } else {
      matchedRooms = db.prepare(`
        SELECT r.*,
               (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND is_banned = 0) as member_count
        FROM chat_rooms r
        WHERE LOWER(r.name) LIKE ? OR LOWER(r.description) LIKE ? OR UPPER(r.room_id) LIKE ?
        LIMIT 20
      `).all(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`, `%${cleanQ}%`) as any[];
    }

    const results = matchedRooms.map((room) => {
      const member = getRoomMember(room.id, currentUserId);
      const perms = getRoomPermissions(room.id);

      const pendingReq = db.prepare(`
        SELECT id, status FROM room_join_requests
        WHERE room_id = ? AND user_id = ? AND status = 'pending'
      `).get(room.id, currentUserId) as any;

      return {
        id: room.id,
        roomId: room.room_id,
        name: room.name,
        description: room.description,
        ownerId: room.owner_id,
        visibility: room.visibility,
        memberCount: room.member_count,
        isMember: !!member,
        isBanned: member?.isBanned || false,
        role: member?.role || null,
        hasPendingRequest: !!pendingReq,
        joinPolicy: perms?.join_policy || (room.visibility === 'public' ? 'open' : room.visibility === 'invite_only' ? 'invite_only' : 'approval_required'),
        createdAt: room.created_at,
      };
    });

    return res.json({ rooms: results });
  } catch (err) {
    console.error('Room search error:', err);
    return res.status(500).json({ error: 'Failed to search rooms.' });
  }
});

// Get room details
router.get('/:id', requireAuth, (req, res) => {
  try {
    const roomId = req.params.id;
    const currentUserId = req.user!.id;

    const room = db.prepare(`
      SELECT r.*,
             (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND is_banned = 0) as member_count
      FROM chat_rooms r
      WHERE r.id = ? OR r.room_id = ?
    `).get(roomId, roomId.toUpperCase()) as any;

    if (!room) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    const member = getRoomMember(room.id, currentUserId);
    if (member?.isBanned) {
      return res.status(403).json({ error: 'You are banned from this room.' });
    }

    // If private or invite-only, caller must be a member
    if (room.visibility !== 'public' && !member) {
      return res.status(403).json({ error: 'Access denied. This is a private room.' });
    }

    const perms = getRoomPermissions(room.id);

    // Get pinned messages
    const pinned = db.prepare(`
      SELECT id, sender_id, content, file_name, file_url, created_at
      FROM messages
      WHERE room_id = ? AND is_pinned = 1 AND is_deleted = 0
      ORDER BY created_at DESC
    `).all(room.id);

    return res.json({
      room: {
        id: room.id,
        roomId: room.room_id,
        name: room.name,
        description: room.description,
        ownerId: room.owner_id,
        visibility: room.visibility,
        inviteCode: (member?.role === 'owner' || member?.role === 'admin' || perms?.invite_policy === 'all') ? room.invite_code : null,
        memberCount: room.member_count,
        role: member?.role || null,
        isMember: !!member,
        createdAt: room.created_at,
        permissions: {
          joinPolicy: perms?.join_policy || 'open',
          messageSendPolicy: perms?.message_send_policy || 'all',
          invitePolicy: perms?.invite_policy || 'all',
          editRoomInfoPolicy: perms?.edit_room_info_policy || 'admins_only',
          pinMessagePolicy: perms?.pin_message_policy || 'admins_only',
          deleteMessagePolicy: perms?.delete_message_policy || 'admins_only',
          fileUploadEnabled: perms?.file_upload_enabled === 1,
          historyVisibleToNewMembers: perms?.history_visible_to_new_members === 1,
          slowModeSeconds: perms?.slow_mode_seconds || 0,
          threadRepliesEnabled: perms?.thread_replies_enabled === 1,
        },
        pinnedMessages: pinned,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch room details.' });
  }
});

// Join room via Room ID or invite code
router.post('/join', requireAuth, (req, res) => {
  try {
    const { identifier, inviteCode } = req.body; // identifier can be roomId (ROOM-xxxx) or id
    const currentUserId = req.user!.id;

    if (!identifier && !inviteCode) {
      return res.status(400).json({ error: 'Room ID or Invite Code is required.' });
    }

    let room: any = null;
    if (inviteCode) {
      room = db.prepare('SELECT * FROM chat_rooms WHERE invite_code = ?').get(inviteCode.trim()) as any;
    } else {
      room = db.prepare('SELECT * FROM chat_rooms WHERE id = ? OR room_id = ?').get(identifier, identifier.toUpperCase()) as any;
    }

    if (!room) {
      return res.status(404).json({ error: 'Room not found with the provided details.' });
    }

    const member = getRoomMember(room.id, currentUserId);
    if (member) {
      if (member.isBanned) {
        return res.status(403).json({ error: 'You are banned from this room.' });
      }
      return res.json({ success: true, message: 'Already a member of this room.', roomId: room.id, role: member.role });
    }

    const perms = getRoomPermissions(room.id);
    const now = new Date().toISOString();

    // Check joining policy
    if (inviteCode && room.invite_code === inviteCode.trim()) {
      // Invite code valid: join immediately
      db.prepare(`
        INSERT INTO room_members (room_id, user_id, role, joined_at)
        VALUES (?, ?, 'member', ?)
      `).run(room.id, currentUserId, now);

      broadcastToRoom(room.id, 'room:member_joined', {
        roomId: room.id,
        user: { id: currentUserId, displayName: req.user!.displayName, userId: req.user!.userId },
      });

      return res.json({ success: true, message: 'Joined room successfully.', roomId: room.id, role: 'member' });
    }

    if (perms.join_policy === 'invite_only' && room.visibility === 'invite_only') {
      return res.status(403).json({ error: 'This room is invite-only. A valid invite code or invitation is required.' });
    }

    if (perms.join_policy === 'approval_required' || room.visibility === 'private') {
      // Check if pending request exists
      const existingReq = db.prepare('SELECT id, status FROM room_join_requests WHERE room_id = ? AND user_id = ?').get(room.id, currentUserId) as any;
      if (existingReq) {
        if (existingReq.status === 'pending') {
          return res.status(409).json({ error: 'Your join request is pending approval by room owners.' });
        }
      }

      const reqId = `jreq_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(`
        INSERT INTO room_join_requests (id, room_id, user_id, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
        ON CONFLICT(room_id, user_id) DO UPDATE SET status = 'pending', created_at = excluded.created_at
      `).run(reqId, room.id, currentUserId, now);

      // Notify owner and admins
      const admins = db.prepare(`
        SELECT user_id FROM room_members WHERE room_id = ? AND role IN ('owner', 'admin')
      `).all(room.id) as { user_id: string }[];

      for (const admin of admins) {
        const notifId = `notif_${crypto.randomBytes(8).toString('hex')}`;
        db.prepare(`
          INSERT INTO notifications (id, user_id, type, title, body, link, data_json, created_at)
          VALUES (?, ?, 'join_request', 'Room Join Request', ?, ?, ?, ?)
        `).run(notifId, admin.user_id, `${req.user!.displayName} requested to join ${room.name}.`, `/rooms/${room.id}`, JSON.stringify({ roomId: room.id, userId: currentUserId }), now);

        broadcastToUser(admin.user_id, 'notification:new', {
          id: notifId,
          title: 'Room Join Request',
          body: `${req.user!.displayName} requested to join ${room.name}.`,
        });
      }

      return res.json({
        success: true,
        status: 'pending_approval',
        message: 'Join request submitted. Awaiting approval from room administrators.',
        roomId: room.id,
      });
    }

    // Open join policy
    db.prepare(`
      INSERT INTO room_members (room_id, user_id, role, joined_at)
      VALUES (?, ?, 'member', ?)
    `).run(room.id, currentUserId, now);

    broadcastToRoom(room.id, 'room:member_joined', {
      roomId: room.id,
      user: { id: currentUserId, displayName: req.user!.displayName, userId: req.user!.userId },
    });

    return res.json({ success: true, message: 'Joined room successfully.', roomId: room.id, role: 'member' });
  } catch (err) {
    console.error('Join room error:', err);
    return res.status(500).json({ error: 'Failed to join room.' });
  }
});

// Get room messages
router.get('/:id/messages', requireAuth, (req, res) => {
  try {
    const roomId = req.params.id;
    const currentUserId = req.user!.id;

    const member = getRoomMember(roomId, currentUserId);
    if (!member) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this room.' });
    }
    if (member.isBanned) {
      return res.status(403).json({ error: 'You are banned from this room.' });
    }

    const perms = getRoomPermissions(roomId);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
    const before = req.query.before as string;
    const query = ((req.query.q as string) || '').trim().toLowerCase();

    let sql = `
      SELECT m.id, m.room_id, m.sender_id, m.content, m.reply_to_id,
             m.file_url, m.file_name, m.file_size, m.file_type,
             m.is_pinned, m.is_edited, m.is_deleted, m.created_at, m.updated_at,
             u.user_id as sender_user_id, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar,
             rm.role as sender_role
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      LEFT JOIN room_members rm ON m.sender_id = rm.user_id AND rm.room_id = m.room_id
      WHERE m.room_id = ?
    `;
    const params: any[] = [roomId];

    // Enforce history visibility policy: if history not visible, only messages after joinedAt
    if (perms?.history_visible_to_new_members === 0 && member.role === 'member') {
      sql += ` AND m.created_at >= ?`;
      params.push(member.joinedAt);
    }

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

    const messages = rows.reverse().map((msg) => {
      // Reactions
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

      // Reply preview
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

      return {
        id: msg.id,
        roomId: msg.room_id,
        senderId: msg.sender_id,
        sender: {
          id: msg.sender_id,
          userId: msg.sender_user_id,
          username: msg.sender_username,
          displayName: msg.sender_name,
          avatarUrl: msg.sender_avatar,
          role: msg.sender_role || 'member',
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
        reactions: formattedReactions,
        createdAt: msg.created_at,
        updatedAt: msg.updated_at,
      };
    });

    return res.json({ messages });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch room messages.' });
  }
});

// Send message to room
router.post('/:id/messages', requireAuth, (req, res) => {
  try {
    const roomId = req.params.id;
    const currentUserId = req.user!.id;
    const { content, replyToId, fileUrl, fileName, fileSize, fileType, clientMessageId } = req.body;

    const member = getRoomMember(roomId, currentUserId);
    if (!member) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this room.' });
    }
    if (member.isBanned) {
      return res.status(403).json({ error: 'You are banned from this room.' });
    }
    if (member.isMuted) {
      return res.status(403).json({ error: 'You are muted in this room.' });
    }

    const perms = getRoomPermissions(roomId);

    // Rule: Message send policy check (admins_only vs all)
    if (perms?.message_send_policy === 'admins_only' && member.role === 'member') {
      return res.status(403).json({ error: 'Only room owners and administrators are permitted to send messages here.' });
    }

    // Rule: File upload policy check
    if (fileUrl && perms?.file_upload_enabled === 0 && member.role === 'member') {
      return res.status(403).json({ error: 'File attachments are disabled in this room.' });
    }

    // Rule: Slow mode check (exempt owners & admins)
    if (perms?.slow_mode_seconds > 0 && member.role === 'member') {
      const nowMs = Date.now();
      let roomTracker = roomSlowModeTracker.get(roomId);
      if (!roomTracker) {
        roomTracker = new Map();
        roomSlowModeTracker.set(roomId, roomTracker);
      }
      const lastSent = roomTracker.get(currentUserId) || 0;
      const elapsed = (nowMs - lastSent) / 1000;
      if (elapsed < perms.slow_mode_seconds) {
        const remaining = Math.ceil(perms.slow_mode_seconds - elapsed);
        return res.status(429).json({ error: `Slow mode is active. Please wait ${remaining}s before sending another message.` });
      }
      roomTracker.set(currentUserId, nowMs);
    }

    // Rule: Thread replies policy
    if (replyToId && perms?.thread_replies_enabled === 0 && member.role === 'member') {
      return res.status(403).json({ error: 'Thread replies are disabled in this room.' });
    }

    if ((!content || !content.trim()) && !fileUrl) {
      return res.status(400).json({ error: 'Content or file is required.' });
    }

    const messageId = clientMessageId || `msg_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO messages (id, conversation_id, room_id, sender_id, content, reply_to_id, file_url, file_name, file_size, file_type, is_pinned, is_edited, is_deleted, created_at, updated_at)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
    `).run(
      messageId,
      roomId,
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

    db.prepare('UPDATE chat_rooms SET updated_at = ? WHERE id = ?').run(now, roomId);

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
      roomId,
      senderId: currentUserId,
      sender: {
        id: currentUserId,
        userId: req.user!.userId,
        username: req.user!.username,
        displayName: req.user!.displayName,
        avatarUrl: req.user!.avatarUrl || '',
        role: member.role,
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
      reactions: [],
      createdAt: now,
      updatedAt: now,
    };

    broadcastToRoom(roomId, 'chat:message', messagePayload);

    return res.status(201).json({ message: messagePayload });
  } catch (err) {
    console.error('Room send message error:', err);
    return res.status(500).json({ error: 'Failed to send room message.' });
  }
});

// Toggle Pin in room (based on pin_message_policy)
router.post('/:id/messages/:msgId/pin', requireAuth, (req, res) => {
  try {
    const { id: roomId, msgId } = req.params;
    const currentUserId = req.user!.id;

    const member = getRoomMember(roomId, currentUserId);
    if (!member || member.isBanned) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const perms = getRoomPermissions(roomId);
    if (perms?.pin_message_policy === 'admins_only' && member.role === 'member') {
      return res.status(403).json({ error: 'Only administrators can pin messages in this room.' });
    }

    const message = db.prepare('SELECT is_pinned FROM messages WHERE id = ? AND room_id = ?').get(msgId, roomId) as any;
    if (!message) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    const newPinned = message.is_pinned ? 0 : 1;
    const now = new Date().toISOString();
    db.prepare('UPDATE messages SET is_pinned = ?, updated_at = ? WHERE id = ?').run(newPinned, now, msgId);

    broadcastToRoom(roomId, 'chat:pin', {
      roomId,
      messageId: msgId,
      isPinned: !!newPinned,
    });

    return res.json({ success: true, messageId: msgId, isPinned: !!newPinned });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to pin message.' });
  }
});

// Moderate or Delete message in room
router.delete('/:id/messages/:msgId', requireAuth, (req, res) => {
  try {
    const { id: roomId, msgId } = req.params;
    const currentUserId = req.user!.id;

    const member = getRoomMember(roomId, currentUserId);
    if (!member || member.isBanned) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const message = db.prepare('SELECT * FROM messages WHERE id = ? AND room_id = ?').get(msgId, roomId) as any;
    if (!message) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    const perms = getRoomPermissions(roomId);
    const isAuthor = message.sender_id === currentUserId;
    const isOwner = member.role === 'owner';
    const isAdmin = member.role === 'admin';

    // Authors can delete their own message anytime
    // For moderation of others' messages:
    if (!isAuthor) {
      if (perms?.delete_message_policy === 'owner_only' && !isOwner) {
        return res.status(403).json({ error: 'Only the room owner can moderate/delete messages.' });
      }
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: 'You are not authorized to delete this message.' });
      }
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE messages
      SET content = 'This message was deleted by a moderator', is_deleted = 1, file_url = NULL, updated_at = ?
      WHERE id = ?
    `).run(now, msgId);

    // Audit log if deleted by moderator
    if (!isAuthor) {
      db.prepare(`
        INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details, created_at)
        VALUES (?, ?, 'moderate_delete_message', 'message', ?, ?, ?)
      `).run(`log_${Date.now()}`, currentUserId, msgId, `Deleted message by ${message.sender_id} in room ${roomId}`, now);
    }

    broadcastToRoom(roomId, 'chat:delete', {
      roomId,
      messageId: msgId,
    });

    return res.json({ success: true, messageId: msgId });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete message.' });
  }
});

// Edit message in room (author only)
router.patch('/:id/messages/:msgId', requireAuth, (req, res) => {
  try {
    const { id: roomId, msgId } = req.params;
    const { content } = req.body;
    const currentUserId = req.user!.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content cannot be empty.' });
    }

    const message = db.prepare('SELECT * FROM messages WHERE id = ? AND room_id = ?').get(msgId, roomId) as any;
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

    broadcastToRoom(roomId, 'chat:edit', {
      roomId,
      messageId: msgId,
      content: content.trim(),
      updatedAt: now,
    });

    return res.json({ success: true, messageId: msgId, content: content.trim() });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to edit message.' });
  }
});

// Toggle Emoji Reaction in room
router.post('/:id/messages/:msgId/reactions', requireAuth, (req, res) => {
  try {
    const { id: roomId, msgId } = req.params;
    const { emoji } = req.body;
    const currentUserId = req.user!.id;

    const member = getRoomMember(roomId, currentUserId);
    if (!member || member.isBanned) {
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

    broadcastToRoom(roomId, 'chat:reaction', {
      roomId,
      messageId: msgId,
      reactions: formatted,
    });

    return res.json({ success: true, reactions: formatted });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update reaction.' });
  }
});

// Get room members & pending join requests
router.get('/:id/members', requireAuth, (req, res) => {
  try {
    const roomId = req.params.id;
    const currentUserId = req.user!.id;

    const member = getRoomMember(roomId, currentUserId);
    if (!member || member.isBanned) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const members = db.prepare(`
      SELECT rm.user_id, rm.role, rm.joined_at, rm.is_banned, rm.is_muted,
             u.user_id as public_user_id, u.username, u.display_name, u.avatar_url, u.status, u.last_seen_at
      FROM room_members rm
      JOIN users u ON rm.user_id = u.id
      WHERE rm.room_id = ?
      ORDER BY 
        CASE rm.role
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          ELSE 3
        END, rm.joined_at ASC
    `).all(roomId) as any[];

    // If caller is owner or admin, also load join requests
    let joinRequests: any[] = [];
    if (member.role === 'owner' || member.role === 'admin') {
      joinRequests = db.prepare(`
        SELECT r.id, r.user_id, r.created_at,
               u.user_id as public_user_id, u.username, u.display_name, u.avatar_url
        FROM room_join_requests r
        JOIN users u ON r.user_id = u.id
        WHERE r.room_id = ? AND r.status = 'pending'
        ORDER BY r.created_at ASC
      `).all(roomId) as any[];
    }

    return res.json({
      members: members.map((m) => ({
        id: m.user_id,
        userId: m.public_user_id,
        username: m.username,
        displayName: m.display_name,
        avatarUrl: m.avatar_url,
        status: m.status,
        lastSeenAt: m.last_seen_at,
        role: m.role,
        isBanned: !!m.is_banned,
        isMuted: !!m.is_muted,
        joinedAt: m.joined_at,
      })),
      joinRequests,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load room members.' });
  }
});

// Promote / Demote admin (Owner only)
router.patch('/:id/members/:targetUserId', requireAuth, (req, res) => {
  try {
    const { id: roomId, targetUserId } = req.params;
    const { role } = req.body; // 'admin' or 'member'
    const currentUserId = req.user!.id;

    const callerMember = getRoomMember(roomId, currentUserId);
    if (!callerMember || callerMember.role !== 'owner') {
      return res.status(403).json({ error: 'Only the room owner can assign or revoke admin roles.' });
    }

    if (targetUserId === currentUserId) {
      return res.status(400).json({ error: 'Cannot modify your own owner role here. Use transfer-ownership instead.' });
    }

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or member.' });
    }

    db.prepare(`
      UPDATE room_members
      SET role = ?
      WHERE room_id = ? AND user_id = ?
    `).run(role, roomId, targetUserId);

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details, created_at)
      VALUES (?, ?, 'update_member_role', 'user', ?, ?, ?)
    `).run(`log_${Date.now()}`, currentUserId, targetUserId, `Updated role to ${role} in room ${roomId}`, now);

    broadcastToRoom(roomId, 'room:member_role_changed', {
      roomId,
      userId: targetUserId,
      newRole: role,
    });

    return res.json({ success: true, message: `Member role updated to ${role}.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update member role.' });
  }
});

// Kick member (Owner or Admin)
router.post('/:id/members/:targetUserId/kick', requireAuth, (req, res) => {
  try {
    const { id: roomId, targetUserId } = req.params;
    const currentUserId = req.user!.id;

    const caller = getRoomMember(roomId, currentUserId);
    if (!caller || (caller.role !== 'owner' && caller.role !== 'admin')) {
      return res.status(403).json({ error: 'Only room owners and admins can remove members.' });
    }

    const target = getRoomMember(roomId, targetUserId);
    if (!target) {
      return res.status(404).json({ error: 'Target member not found in this room.' });
    }

    if (target.role === 'owner') {
      return res.status(403).json({ error: 'Cannot kick the room owner.' });
    }

    if (caller.role === 'admin' && target.role === 'admin') {
      return res.status(403).json({ error: 'Admins cannot remove other admins. Only the owner can.' });
    }

    db.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(roomId, targetUserId);

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details, created_at)
      VALUES (?, ?, 'kick_member', 'user', ?, ?, ?)
    `).run(`log_${Date.now()}`, currentUserId, targetUserId, `Kicked from room ${roomId}`, now);

    broadcastToRoom(roomId, 'room:member_kicked', {
      roomId,
      userId: targetUserId,
    });

    return res.json({ success: true, message: 'Member kicked from room.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to kick member.' });
  }
});

// Ban member (Owner or Admin)
router.post('/:id/members/:targetUserId/ban', requireAuth, (req, res) => {
  try {
    const { id: roomId, targetUserId } = req.params;
    const currentUserId = req.user!.id;

    const caller = getRoomMember(roomId, currentUserId);
    if (!caller || (caller.role !== 'owner' && caller.role !== 'admin')) {
      return res.status(403).json({ error: 'Only room owners and admins can ban members.' });
    }

    const target = getRoomMember(roomId, targetUserId);
    if (!target) {
      return res.status(404).json({ error: 'Target member not found in this room.' });
    }

    if (target.role === 'owner') {
      return res.status(403).json({ error: 'Cannot ban the room owner.' });
    }

    if (caller.role === 'admin' && target.role === 'admin') {
      return res.status(403).json({ error: 'Admins cannot ban other admins.' });
    }

    db.prepare('UPDATE room_members SET is_banned = 1 WHERE room_id = ? AND user_id = ?').run(roomId, targetUserId);

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details, created_at)
      VALUES (?, ?, 'ban_member', 'user', ?, ?, ?)
    `).run(`log_${Date.now()}`, currentUserId, targetUserId, `Banned from room ${roomId}`, now);

    broadcastToRoom(roomId, 'room:member_banned', {
      roomId,
      userId: targetUserId,
    });

    return res.json({ success: true, message: 'Member banned from room.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to ban member.' });
  }
});

// Decide Join Request (Approve or Reject)
router.post('/:id/join-requests/:requestId/decide', requireAuth, (req, res) => {
  try {
    const { id: roomId, requestId } = req.params;
    const { decision } = req.body; // 'approve' or 'reject'
    const currentUserId = req.user!.id;

    const caller = getRoomMember(roomId, currentUserId);
    if (!caller || (caller.role !== 'owner' && caller.role !== 'admin')) {
      return res.status(403).json({ error: 'Only room owners and admins can approve or reject join requests.' });
    }

    const joinReq = db.prepare('SELECT * FROM room_join_requests WHERE id = ? AND room_id = ?').get(requestId, roomId) as any;
    if (!joinReq) {
      return res.status(404).json({ error: 'Join request not found.' });
    }

    const now = new Date().toISOString();

    if (decision === 'approve') {
      db.prepare(`UPDATE room_join_requests SET status = 'approved' WHERE id = ?`).run(requestId);
      db.prepare(`
        INSERT INTO room_members (room_id, user_id, role, joined_at)
        VALUES (?, ?, 'member', ?)
        ON CONFLICT(room_id, user_id) DO UPDATE SET role = 'member', is_banned = 0, joined_at = excluded.joined_at
      `).run(roomId, joinReq.user_id, now);

      const notifId = `notif_${crypto.randomBytes(8).toString('hex')}`;
      db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, link, data_json, created_at)
        VALUES (?, ?, 'join_approved', 'Room Join Approved', 'Your request to join the room was approved!', ?, ?, ?)
      `).run(notifId, joinReq.user_id, `/rooms/${roomId}`, JSON.stringify({ roomId }), now);

      broadcastToUser(joinReq.user_id, 'notification:new', {
        id: notifId,
        title: 'Room Join Approved',
        body: 'Your request to join the room was approved!',
        link: `/rooms/${roomId}`,
      });

      return res.json({ success: true, message: 'Join request approved.' });
    } else {
      db.prepare(`UPDATE room_join_requests SET status = 'rejected' WHERE id = ?`).run(requestId);
      return res.json({ success: true, message: 'Join request rejected.' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to process join request decision.' });
  }
});

// Update Room Permissions (Owner only)
router.patch('/:id/permissions', requireAuth, (req, res) => {
  try {
    const roomId = req.params.id;
    const currentUserId = req.user!.id;

    const caller = getRoomMember(roomId, currentUserId);
    if (!caller || caller.role !== 'owner') {
      return res.status(403).json({ error: 'Only the room owner can configure room permissions.' });
    }

    const currentPerms = getRoomPermissions(roomId);
    const {
      joinPolicy,
      messageSendPolicy,
      invitePolicy,
      editRoomInfoPolicy,
      pinMessagePolicy,
      deleteMessagePolicy,
      fileUploadEnabled,
      historyVisibleToNewMembers,
      slowModeSeconds,
      threadRepliesEnabled,
    } = req.body;

    const updated = {
      joinPolicy: joinPolicy !== undefined ? joinPolicy : currentPerms.join_policy,
      messageSendPolicy: messageSendPolicy !== undefined ? messageSendPolicy : currentPerms.message_send_policy,
      invitePolicy: invitePolicy !== undefined ? invitePolicy : currentPerms.invite_policy,
      editRoomInfoPolicy: editRoomInfoPolicy !== undefined ? editRoomInfoPolicy : currentPerms.edit_room_info_policy,
      pinMessagePolicy: pinMessagePolicy !== undefined ? pinMessagePolicy : currentPerms.pin_message_policy,
      deleteMessagePolicy: deleteMessagePolicy !== undefined ? deleteMessagePolicy : currentPerms.delete_message_policy,
      fileUploadEnabled: fileUploadEnabled !== undefined ? (fileUploadEnabled ? 1 : 0) : currentPerms.file_upload_enabled,
      historyVisibleToNewMembers: historyVisibleToNewMembers !== undefined ? (historyVisibleToNewMembers ? 1 : 0) : currentPerms.history_visible_to_new_members,
      slowModeSeconds: slowModeSeconds !== undefined ? slowModeSeconds : currentPerms.slow_mode_seconds,
      threadRepliesEnabled: threadRepliesEnabled !== undefined ? (threadRepliesEnabled ? 1 : 0) : currentPerms.thread_replies_enabled,
    };

    db.prepare(`
      UPDATE room_permissions
      SET join_policy = ?, message_send_policy = ?, invite_policy = ?, edit_room_info_policy = ?,
          pin_message_policy = ?, delete_message_policy = ?, file_upload_enabled = ?,
          history_visible_to_new_members = ?, slow_mode_seconds = ?, thread_replies_enabled = ?
      WHERE room_id = ?
    `).run(
      updated.joinPolicy,
      updated.messageSendPolicy,
      updated.invitePolicy,
      updated.editRoomInfoPolicy,
      updated.pinMessagePolicy,
      updated.deleteMessagePolicy,
      updated.fileUploadEnabled,
      updated.historyVisibleToNewMembers,
      updated.slowModeSeconds,
      updated.threadRepliesEnabled,
      roomId
    );

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details, created_at)
      VALUES (?, ?, 'update_permissions', 'permission', ?, ?, ?)
    `).run(`log_${Date.now()}`, currentUserId, roomId, JSON.stringify(updated), now);

    broadcastToRoom(roomId, 'room:permissions_updated', {
      roomId,
      permissions: updated,
    });

    return res.json({ success: true, permissions: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update permissions.' });
  }
});

// Update Room Information (Owner or authorized admin)
router.patch('/:id', requireAuth, (req, res) => {
  try {
    const roomId = req.params.id;
    const currentUserId = req.user!.id;
    const { name, description, visibility } = req.body;

    const caller = getRoomMember(roomId, currentUserId);
    if (!caller) return res.status(403).json({ error: 'Access denied.' });

    const perms = getRoomPermissions(roomId);
    if (caller.role !== 'owner') {
      if (caller.role !== 'admin' || perms?.edit_room_info_policy === 'owner_only') {
        return res.status(403).json({ error: 'You are not authorized to edit room details.' });
      }
    }

    const room = db.prepare('SELECT * FROM chat_rooms WHERE id = ?').get(roomId) as any;
    if (!room) return res.status(404).json({ error: 'Room not found.' });

    const newName = name !== undefined ? name.trim() : room.name;
    const newDesc = description !== undefined ? description.trim() : room.description;
    const newVis = visibility !== undefined ? visibility : room.visibility;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE chat_rooms
      SET name = ?, description = ?, visibility = ?, updated_at = ?
      WHERE id = ?
    `).run(newName, newDesc, newVis, now, roomId);

    broadcastToRoom(roomId, 'room:details_updated', {
      roomId,
      name: newName,
      description: newDesc,
      visibility: newVis,
    });

    return res.json({ success: true, room: { id: roomId, name: newName, description: newDesc, visibility: newVis } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update room.' });
  }
});

// Transfer ownership (Owner only)
router.post('/:id/transfer-ownership', requireAuth, (req, res) => {
  try {
    const roomId = req.params.id;
    const { newOwnerId } = req.body;
    const currentUserId = req.user!.id;

    const caller = getRoomMember(roomId, currentUserId);
    if (!caller || caller.role !== 'owner') {
      return res.status(403).json({ error: 'Only the current owner can transfer room ownership.' });
    }

    const targetMember = getRoomMember(roomId, newOwnerId);
    if (!targetMember || targetMember.isBanned) {
      return res.status(400).json({ error: 'Target user must be an active member of this room.' });
    }

    const now = new Date().toISOString();

    // In atomic transaction: demote current owner to admin, promote target to owner, update chat_rooms owner_id
    db.prepare('UPDATE chat_rooms SET owner_id = ?, updated_at = ? WHERE id = ?').run(newOwnerId, now, roomId);
    db.prepare(`UPDATE room_members SET role = 'admin' WHERE room_id = ? AND user_id = ?`).run(roomId, currentUserId);
    db.prepare(`UPDATE room_members SET role = 'owner' WHERE room_id = ? AND user_id = ?`).run(roomId, newOwnerId);

    db.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details, created_at)
      VALUES (?, ?, 'transfer_ownership', 'room', ?, ?, ?)
    `).run(`log_${Date.now()}`, currentUserId, roomId, `Transferred ownership from ${currentUserId} to ${newOwnerId}`, now);

    broadcastToRoom(roomId, 'room:ownership_transferred', {
      roomId,
      oldOwnerId: currentUserId,
      newOwnerId,
    });

    return res.json({ success: true, message: 'Room ownership transferred successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to transfer ownership.' });
  }
});

// Leave Room
router.post('/:id/leave', requireAuth, (req, res) => {
  try {
    const roomId = req.params.id;
    const currentUserId = req.user!.id;

    const member = getRoomMember(roomId, currentUserId);
    if (!member) {
      return res.status(400).json({ error: 'You are not a member of this room.' });
    }

    if (member.role === 'owner') {
      return res.status(400).json({ error: 'The room owner cannot leave. Transfer ownership or delete the room.' });
    }

    db.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(roomId, currentUserId);

    broadcastToRoom(roomId, 'room:member_left', {
      roomId,
      userId: currentUserId,
    });

    return res.json({ success: true, message: 'You left the room.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to leave room.' });
  }
});

// Add a user directly to room (by User ID e.g. USR-1042 or username or ID)
router.post('/:id/add-member', requireAuth, (req, res) => {
  try {
    const roomId = req.params.id;
    const { targetUserId } = req.body;
    const currentUserId = req.user!.id;

    const caller = getRoomMember(roomId, currentUserId);
    if (!caller || caller.isBanned) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this room.' });
    }

    const perms = getRoomPermissions(roomId);
    if (perms?.invite_policy === 'admins_only' && caller.role === 'member') {
      return res.status(403).json({ error: 'Only room owners and admins can add members to this room.' });
    }

    if (!targetUserId || !targetUserId.trim()) {
      return res.status(400).json({ error: 'User ID or username is required.' });
    }

    const targetUser = db.prepare(`
      SELECT id, user_id, username, display_name, avatar_url
      FROM users
      WHERE id = ? OR LOWER(user_id) = ? OR LOWER(username) = ?
    `).get(targetUserId.trim(), targetUserId.trim().toLowerCase(), targetUserId.trim().toLowerCase()) as any;

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found with the provided details.' });
    }

    const existingMember = getRoomMember(roomId, targetUser.id);
    if (existingMember) {
      if (existingMember.isBanned) {
        return res.status(403).json({ error: 'This user is banned from this room.' });
      }
      return res.status(400).json({ error: 'User is already a member of this room.' });
    }

    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO room_members (room_id, user_id, role, joined_at)
      VALUES (?, ?, 'member', ?)
    `).run(roomId, targetUser.id, now);

    const room = db.prepare('SELECT name, room_id FROM chat_rooms WHERE id = ?').get(roomId) as any;

    const notifId = `notif_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, link, data_json, created_at)
      VALUES (?, ?, 'room_added', 'Added to Room', ?, ?, ?, ?)
    `).run(
      notifId,
      targetUser.id,
      `${req.user!.displayName} added you to the room "${room?.name || 'Group Room'}".`,
      `/rooms/${roomId}`,
      JSON.stringify({ roomId, addedBy: currentUserId }),
      now
    );

    broadcastToUser(targetUser.id, 'notification:new', {
      id: notifId,
      title: 'Added to Room',
      body: `${req.user!.displayName} added you to the room "${room?.name || 'Group Room'}".`,
      link: `/rooms/${roomId}`,
    });

    broadcastToRoom(roomId, 'room:member_joined', {
      roomId,
      user: {
        id: targetUser.id,
        displayName: targetUser.display_name,
        userId: targetUser.user_id,
        avatarUrl: targetUser.avatar_url,
      },
    });

    return res.json({
      success: true,
      message: `${targetUser.display_name} was added to the room.`,
      user: {
        id: targetUser.id,
        userId: targetUser.user_id,
        username: targetUser.username,
        displayName: targetUser.display_name,
        avatarUrl: targetUser.avatar_url,
        role: 'member',
      },
    });
  } catch (err) {
    console.error('Add room member error:', err);
    return res.status(500).json({ error: 'Failed to add member to room.' });
  }
});

// Delete Room (Owner only)
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const roomId = req.params.id;
    const currentUserId = req.user!.id;

    const caller = getRoomMember(roomId, currentUserId);
    if (!caller || caller.role !== 'owner') {
      return res.status(403).json({ error: 'Only the room owner can delete the room.' });
    }

    broadcastToRoom(roomId, 'room:deleted', { roomId });

    // Cascades delete room_members, room_permissions, messages
    db.prepare('DELETE FROM chat_rooms WHERE id = ?').run(roomId);

    return res.json({ success: true, message: 'Room deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete room.' });
  }
});

export default router;
