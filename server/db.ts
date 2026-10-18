import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Ensure data directory exists
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure uploads directory exists
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'connectly.db');
export const db = new DatabaseSync(dbPath);

// Enable WAL mode and foreign key constraints
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

export function initDatabase() {
  db.exec(`
    -- Users Table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      status_message TEXT DEFAULT '',
      status TEXT DEFAULT 'offline',
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Refresh Tokens Table
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Chat Requests Table
    CREATE TABLE IF NOT EXISTS chat_requests (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, rejected, cancelled
      message TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(sender_id, receiver_id)
    );

    -- Conversations Table (Direct Chats)
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'direct', -- direct, group
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Conversation Members
    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL,
      last_read_message_id TEXT DEFAULT NULL,
      is_muted INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      PRIMARY KEY (conversation_id, user_id)
    );

    -- Chat Rooms Table
    CREATE TABLE IF NOT EXISTS chat_rooms (
      id TEXT PRIMARY KEY,
      room_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      visibility TEXT NOT NULL DEFAULT 'public', -- public, private, invite_only
      invite_code TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Room Members
    CREATE TABLE IF NOT EXISTS room_members (
      room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member', -- owner, admin, member
      joined_at TEXT NOT NULL,
      is_banned INTEGER DEFAULT 0,
      is_muted INTEGER DEFAULT 0,
      PRIMARY KEY (room_id, user_id)
    );

    -- Room Permissions
    CREATE TABLE IF NOT EXISTS room_permissions (
      room_id TEXT PRIMARY KEY REFERENCES chat_rooms(id) ON DELETE CASCADE,
      join_policy TEXT DEFAULT 'open', -- open, approval_required, invite_only
      message_send_policy TEXT DEFAULT 'all', -- all, admins_only
      invite_policy TEXT DEFAULT 'all', -- all, admins_only
      edit_room_info_policy TEXT DEFAULT 'admins_only', -- owner_only, admins_only
      pin_message_policy TEXT DEFAULT 'admins_only', -- all, admins_only
      delete_message_policy TEXT DEFAULT 'admins_only', -- admins_only, owner_only
      file_upload_enabled INTEGER DEFAULT 1,
      history_visible_to_new_members INTEGER DEFAULT 1,
      slow_mode_seconds INTEGER DEFAULT 0,
      thread_replies_enabled INTEGER DEFAULT 1
    );

    -- Room Join Requests
    CREATE TABLE IF NOT EXISTS room_join_requests (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
      created_at TEXT NOT NULL,
      UNIQUE(room_id, user_id)
    );

    -- Messages Table
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT DEFAULT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      room_id TEXT DEFAULT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      reply_to_id TEXT DEFAULT NULL REFERENCES messages(id) ON DELETE SET NULL,
      file_url TEXT DEFAULT NULL,
      file_name TEXT DEFAULT NULL,
      file_size INTEGER DEFAULT NULL,
      file_type TEXT DEFAULT NULL,
      is_pinned INTEGER DEFAULT 0,
      is_edited INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Message Reactions
    CREATE TABLE IF NOT EXISTS message_reactions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(message_id, user_id, emoji)
    );

    -- Message Receipts (Sent, Delivered, Read)
    CREATE TABLE IF NOT EXISTS message_receipts (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'delivered', -- delivered, read
      updated_at TEXT NOT NULL,
      UNIQUE(message_id, user_id)
    );

    -- Notifications Table
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL, -- chat_request, request_accepted, request_rejected, new_message, room_invite, join_approved, join_rejected, room_mention
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      link TEXT DEFAULT '',
      data_json TEXT DEFAULT '{}',
      is_read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Blocked Users Table
    CREATE TABLE IF NOT EXISTS blocked_users (
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id)
    );

    -- User Reports Table
    CREATE TABLE IF NOT EXISTS user_reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reported_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      details TEXT DEFAULT '',
      message_id TEXT DEFAULT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    -- Audit Logs Table
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL, -- room, user, message, permission
      target_id TEXT NOT NULL,
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    -- Indexes for high-performance querying
    CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_conv_members ON conversation_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_room_members ON room_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_requests_receiver ON chat_requests(receiver_id, status);
  `);

  seedDefaultData();
}

// Password hashing helper using scrypt
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = parts[1];
    const key = parts[2];
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
  } catch {
    return false;
  }
}

function seedDefaultData() {
  // Database starts completely clean with zero pre-seeded user accounts.
  // Users register their own authentic accounts with unique USR-xxxx IDs.
}

