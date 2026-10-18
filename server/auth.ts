import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'connectly_dev_jwt_secret_key_change_in_production_min_32_chars';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'connectly_dev_refresh_secret_key_change_in_production_min_32_chars';

export interface TokenPayload {
  id: string;
  userId: string;
  username: string;
  email: string;
  displayName: string;
}

export interface AuthenticatedUser extends TokenPayload {
  bio?: string;
  avatarUrl?: string;
  statusMessage?: string;
  status?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  let token = '';

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired access token.' });
  }

  // Verify user still exists in database
  const user = db.prepare('SELECT id, user_id, username, email, display_name, avatar_url, bio, status_message, status FROM users WHERE id = ?').get(payload.id) as any;
  if (!user) {
    return res.status(401).json({ error: 'User account not found or removed.' });
  }

  req.user = {
    id: user.id,
    userId: user.user_id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    bio: user.bio,
    statusMessage: user.status_message,
    status: user.status,
  };

  next();
}
