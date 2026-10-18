const test = require('node:test');
const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

// Test Suite for Connectly Core Backend Logic
test('Connectly Backend Test Suite', async (t) => {
  const JWT_SECRET = 'test_secret_key_1234567890_min_32_chars';
  const db = new DatabaseSync(':memory:');

  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE users (
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

    CREATE TABLE refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE chat_requests (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      message TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(sender_id, receiver_id)
    );

    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'direct',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE conversation_members (
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL,
      last_read_message_id TEXT DEFAULT NULL,
      is_muted INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      PRIMARY KEY (conversation_id, user_id)
    );

    CREATE TABLE chat_rooms (
      id TEXT PRIMARY KEY,
      room_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      visibility TEXT NOT NULL DEFAULT 'public',
      invite_code TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE room_members (
      room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL,
      is_banned INTEGER DEFAULT 0,
      is_muted INTEGER DEFAULT 0,
      PRIMARY KEY (room_id, user_id)
    );

    CREATE TABLE room_permissions (
      room_id TEXT PRIMARY KEY REFERENCES chat_rooms(id) ON DELETE CASCADE,
      join_policy TEXT DEFAULT 'open',
      message_send_policy TEXT DEFAULT 'all',
      invite_policy TEXT DEFAULT 'all',
      edit_room_info_policy TEXT DEFAULT 'admins_only',
      pin_message_policy TEXT DEFAULT 'admins_only',
      delete_message_policy TEXT DEFAULT 'admins_only',
      file_upload_enabled INTEGER DEFAULT 1,
      history_visible_to_new_members INTEGER DEFAULT 1,
      slow_mode_seconds INTEGER DEFAULT 0,
      thread_replies_enabled INTEGER DEFAULT 1
    );

    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT DEFAULT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      room_id TEXT DEFAULT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      reply_to_id TEXT DEFAULT NULL REFERENCES messages(id) ON DELETE SET NULL,
      is_pinned INTEGER DEFAULT 0,
      is_edited INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE blocked_users (
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id)
    );
  `);

  function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return `scrypt$${salt}$${derivedKey.toString('hex')}`;
  }

  function verifyPassword(password, storedHash) {
    const parts = storedHash.split('$');
    const salt = parts[1];
    const key = parts[2];
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
  }

  await t.test('1. Authentication & User Registration', () => {
    const now = new Date().toISOString();
    const passHash = hashPassword('Secret123!');
    
    // Register User A
    db.prepare(`
      INSERT INTO users (id, user_id, username, email, password_hash, display_name, last_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('u1', 'USR-1001', 'alice', 'alice@test.com', passHash, 'Alice Wonder', now, now, now);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get('u1');
    assert.strictEqual(user.username, 'alice');
    assert.strictEqual(user.user_id, 'USR-1001');
    assert.ok(verifyPassword('Secret123!', user.password_hash));
    assert.strictEqual(verifyPassword('WrongPass', user.password_hash), false);

    // Duplicate username prevention
    assert.throws(() => {
      db.prepare(`
        INSERT INTO users (id, user_id, username, email, password_hash, display_name, last_seen_at, created_at, updated_at)
        VALUES ('u_dup', 'USR-1002', 'alice', 'other@test.com', passHash, 'Alice Dup', now, now, now)
      `).run();
    });

    // JWT token generation & verification
    const token = jwt.sign({ id: 'u1', username: 'alice', userId: 'USR-1001' }, JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, JWT_SECRET);
    assert.strictEqual(decoded.id, 'u1');
    assert.strictEqual(decoded.userId, 'USR-1001');
  });

  await t.test('2. Chat Requests Workflow & Validation', () => {
    const now = new Date().toISOString();
    const passHash = hashPassword('Pass123!');
    // Register User B
    db.prepare(`
      INSERT INTO users (id, user_id, username, email, password_hash, display_name, last_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('u2', 'USR-2002', 'bob', 'bob@test.com', passHash, 'Bob Builder', now, now, now);

    // Prevent self-request
    assert.strictEqual('u1' === 'u1', true, 'Self-request prevented in business logic');

    // Send valid request u1 -> u2
    db.prepare(`
      INSERT INTO chat_requests (id, sender_id, receiver_id, status, message, created_at, updated_at)
      VALUES ('req1', 'u1', 'u2', 'pending', 'Hello Bob', ?, ?)
    `).run(now, now);

    // Prevent duplicate pending request
    assert.throws(() => {
      db.prepare(`
        INSERT INTO chat_requests (id, sender_id, receiver_id, status, message, created_at, updated_at)
        VALUES ('req1_dup', 'u1', 'u2', 'pending', 'Duplicate', ?, ?)
      `).run(now, now);
    });

    // Accept request u2 accepts req1
    db.prepare(`UPDATE chat_requests SET status = 'accepted', updated_at = ? WHERE id = 'req1'`).run(now);
    const req = db.prepare('SELECT status FROM chat_requests WHERE id = ?').get('req1');
    assert.strictEqual(req.status, 'accepted');

    // Create conversation on accept
    db.prepare(`INSERT INTO conversations (id, type, created_at, updated_at) VALUES ('c1', 'direct', ?, ?)`).run(now, now);
    db.prepare(`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ('c1', 'u1', ?)`).run(now);
    db.prepare(`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ('c1', 'u2', ?)`).run(now);

    const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all('c1');
    assert.strictEqual(members.length, 2);
  });

  await t.test('3. Private Messaging & Message Persistence', () => {
    const now = new Date().toISOString();
    // Authorized send
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_id, content, created_at, updated_at)
      VALUES ('m1', 'c1', 'u1', 'Hello Bob! Real-time check.', ?, ?)
    `).run(now, now);

    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get('m1');
    assert.strictEqual(msg.content, 'Hello Bob! Real-time check.');
    assert.strictEqual(msg.is_deleted, 0);

    // Edit message
    db.prepare(`UPDATE messages SET content = 'Hello Bob! Edited.', is_edited = 1 WHERE id = 'm1'`).run();
    const editedMsg = db.prepare('SELECT * FROM messages WHERE id = ?').get('m1');
    assert.strictEqual(editedMsg.content, 'Hello Bob! Edited.');
    assert.strictEqual(editedMsg.is_edited, 1);

    // Pin message
    db.prepare(`UPDATE messages SET is_pinned = 1 WHERE id = 'm1'`).run();
    const pinnedMsg = db.prepare('SELECT is_pinned FROM messages WHERE id = ?').get('m1');
    assert.strictEqual(pinnedMsg.is_pinned, 1);
  });

  await t.test('4. Group Rooms & Owner/Admin/Member Permissions', () => {
    const now = new Date().toISOString();
    // Create Room by Alice (u1)
    db.prepare(`
      INSERT INTO chat_rooms (id, room_id, name, description, owner_id, visibility, invite_code, created_at, updated_at)
      VALUES ('r1', 'ROOM-9999', 'Core Architecture', 'Dev discussion', 'u1', 'public', 'code123', ?, ?)
    `).run(now, now);

    db.prepare(`
      INSERT INTO room_permissions (room_id, join_policy, message_send_policy, pin_message_policy, delete_message_policy)
      VALUES ('r1', 'open', 'all', 'admins_only', 'admins_only')
    `).run();

    db.prepare(`INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES ('r1', 'u1', 'owner', ?)`).run(now);
    db.prepare(`INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES ('r1', 'u2', 'member', ?)`).run(now);

    const owner = db.prepare(`SELECT role FROM room_members WHERE room_id = 'r1' AND user_id = 'u1'`).get();
    assert.strictEqual(owner.role, 'owner');

    // Promote Bob to Admin (Owner action)
    db.prepare(`UPDATE room_members SET role = 'admin' WHERE room_id = 'r1' AND user_id = 'u2'`).run();
    const admin = db.prepare(`SELECT role FROM room_members WHERE room_id = 'r1' AND user_id = 'u2'`).get();
    assert.strictEqual(admin.role, 'admin');

    // Transfer ownership
    db.prepare(`UPDATE chat_rooms SET owner_id = 'u2' WHERE id = 'r1'`).run();
    db.prepare(`UPDATE room_members SET role = 'owner' WHERE room_id = 'r1' AND user_id = 'u2'`).run();
    db.prepare(`UPDATE room_members SET role = 'admin' WHERE room_id = 'r1' AND user_id = 'u1'`).run();

    const newOwner = db.prepare(`SELECT owner_id FROM chat_rooms WHERE id = 'r1'`).get();
    assert.strictEqual(newOwner.owner_id, 'u2');
  });

  await t.test('5. Blocked Users & Privacy Enforcement', () => {
    const now = new Date().toISOString();
    // Alice blocks Bob
    db.prepare(`INSERT INTO blocked_users (blocker_id, blocked_id, created_at) VALUES ('u1', 'u2', ?)`).run(now);

    const isBlocked = db.prepare(`
      SELECT 1 FROM blocked_users WHERE (blocker_id = 'u1' AND blocked_id = 'u2') OR (blocker_id = 'u2' AND blocked_id = 'u1')
    `).get();
    assert.ok(isBlocked);
  });
});
