import crypto from 'node:crypto';
import { db } from './db.ts';

/**
 * Generates a unique human-readable public User ID, e.g. USR-1042, USR-7890
 * Guarantees uniqueness in the database.
 */
export function generatePublicUserId(): string {
  let attempts = 0;
  while (attempts < 50) {
    // Generate 4-digit number between 1000 and 9999 (or 5 digits if high count)
    const num = Math.floor(1000 + Math.random() * 9000);
    const candidate = `USR-${num}`;
    
    const existing = db.prepare('SELECT id FROM users WHERE user_id = ?').get(candidate);
    if (!existing) {
      return candidate;
    }
    attempts++;
  }
  // Fallback to 5 digits if collision occurs
  const random5 = Math.floor(10000 + Math.random() * 90000);
  return `USR-${random5}`;
}

/**
 * Generates a unique Room ID, e.g. ROOM-4091
 */
export function generateRoomId(): string {
  let attempts = 0;
  while (attempts < 50) {
    const num = Math.floor(1000 + Math.random() * 9000);
    const candidate = `ROOM-${num}`;
    
    const existing = db.prepare('SELECT id FROM chat_rooms WHERE room_id = ?').get(candidate);
    if (!existing) {
      return candidate;
    }
    attempts++;
  }
  const random5 = Math.floor(10000 + Math.random() * 90000);
  return `ROOM-${random5}`;
}

/**
 * Generates an 8-character unique invite code for rooms
 */
export function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex');
}
