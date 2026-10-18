import { Router } from 'express';
import crypto from 'node:crypto';
import { db, hashPassword, verifyPassword } from '../db.ts';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, requireAuth } from '../auth.ts';
import { generatePublicUserId } from '../id-generator.ts';

const router = Router();

// Register new user
router.post('/register', (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    if (!username || !email || !password || !displayName) {
      return res.status(400).json({ error: 'All fields (username, email, password, displayName) are required.' });
    }

    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Username must be between 3 and 30 characters.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check duplicate username or email
    const existing = db.prepare('SELECT id, username, email FROM users WHERE username = ? OR email = ?').get(username.toLowerCase(), email.toLowerCase()) as any;
    if (existing) {
      if (existing.username === username.toLowerCase()) {
        return res.status(409).json({ error: 'Username is already taken.' });
      }
      return res.status(409).json({ error: 'Email address is already registered.' });
    }

    const id = `usr_${crypto.randomBytes(8).toString('hex')}`;
    const publicUserId = generatePublicUserId();
    const passwordHash = hashPassword(password);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, user_id, username, email, password_hash, display_name, avatar_url, bio, status_message, status, last_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '', '', '', 'online', ?, ?, ?)
    `).run(id, publicUserId, username.toLowerCase(), email.toLowerCase(), passwordHash, displayName.trim(), now, now, now);

    const payload = {
      id,
      userId: publicUserId,
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      displayName: displayName.trim(),
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Persist refresh token
    const tokenId = `rft_${crypto.randomBytes(8).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(tokenId, id, refreshToken, expiresAt, now);

    return res.status(201).json({
      user: {
        id,
        userId: publicUserId,
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        displayName: displayName.trim(),
        avatarUrl: '',
        bio: '',
        statusMessage: '',
        status: 'online',
        lastSeenAt: now,
      },
      accessToken,
      refreshToken,
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Registration failed due to server error.' });
  }
});

// Login
router.post('/login', (req, res) => {
  try {
    const { identifier, password } = req.body; // username, email, or USR-xxxx

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Identifier and password are required.' });
    }

    const query = `
      SELECT id, user_id, username, email, password_hash, display_name, avatar_url, bio, status_message, status, last_seen_at
      FROM users
      WHERE username = ? OR email = ? OR user_id = ?
    `;
    const user = db.prepare(query).get(identifier.toLowerCase(), identifier.toLowerCase(), identifier.toUpperCase()) as any;

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid username, User ID, or password.' });
    }

    const now = new Date().toISOString();
    db.prepare("UPDATE users SET status = 'online', last_seen_at = ? WHERE id = ?").run(now, user.id);

    const payload = {
      id: user.id,
      userId: user.user_id,
      username: user.username,
      email: user.email,
      displayName: user.display_name,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const tokenId = `rft_${crypto.randomBytes(8).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(tokenId, user.id, refreshToken, expiresAt, now);

    return res.json({
      user: {
        id: user.id,
        userId: user.user_id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        bio: user.bio,
        statusMessage: user.status_message,
        status: 'online',
        lastSeenAt: now,
      },
      accessToken,
      refreshToken,
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed: ' + (err?.message || err) });
  }
});



// Refresh token
router.post('/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required.' });
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    // Verify token exists in database and is not expired
    const tokenRecord = db.prepare('SELECT id, expires_at FROM refresh_tokens WHERE token = ? AND user_id = ?').get(refreshToken, payload.id) as any;
    if (!tokenRecord || new Date(tokenRecord.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Refresh token revoked or expired.' });
    }

    const newAccessToken = generateAccessToken({
      id: payload.id,
      userId: payload.userId,
      username: payload.username,
      email: payload.email,
      displayName: payload.displayName,
    });

    return res.json({ accessToken: newAccessToken });
  } catch (err: any) {
    return res.status(500).json({ error: 'Token refresh failed.' });
  }
});

// Logout
router.post('/logout', requireAuth, (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
    }
    const now = new Date().toISOString();
    db.prepare("UPDATE users SET status = 'offline', last_seen_at = ? WHERE id = ?").run(now, req.user!.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Logout failed.' });
  }
});

// Get current user profile
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT id, user_id, username, email, display_name, avatar_url, bio, status_message, status, last_seen_at, created_at
    FROM users
    WHERE id = ?
  `).get(req.user!.id) as any;

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Get unread counts
  const unreadReqs = db.prepare(`SELECT COUNT(*) as count FROM chat_requests WHERE receiver_id = ? AND status = 'pending'`).get(req.user!.id) as any;
  const unreadNotifs = db.prepare(`SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`).get(req.user!.id) as any;

  return res.json({
    user: {
      id: user.id,
      userId: user.user_id,
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      bio: user.bio,
      statusMessage: user.status_message,
      status: user.status,
      lastSeenAt: user.last_seen_at,
      createdAt: user.created_at,
      unreadRequestsCount: unreadReqs?.count || 0,
      unreadNotificationsCount: unreadNotifs?.count || 0,
    },
  });
});

export default router;
