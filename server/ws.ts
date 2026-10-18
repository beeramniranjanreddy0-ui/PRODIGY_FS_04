import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { verifyAccessToken } from './auth.ts';
import { db } from './db.ts';

interface ClientConnection {
  ws: WebSocket;
  userId: string;
  username: string;
  displayName: string;
  activeChannels: Set<string>; // conversationId or roomId
  isAlive: boolean;
}

// Global registry of active connections
const userConnections = new Map<string, Set<ClientConnection>>();
const connectionClients = new WeakMap<WebSocket, ClientConnection>();

let wssInstance: WebSocketServer | null = null;

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wssInstance = wss;

  wss.on('connection', (ws: WebSocket, req) => {
    // Authenticate client via URL token param or wait for 'auth' message
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token');

    let client: ClientConnection | null = null;

    const handleAuth = (tokenStr: string) => {
      const payload = verifyAccessToken(tokenStr);
      if (!payload) {
        ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid or expired token' }));
        ws.close(4001, 'Unauthorized');
        return null;
      }

      // Check if user still exists
      const user = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(payload.id) as any;
      if (!user) {
        ws.close(4001, 'User not found');
        return null;
      }

      // Update user status to online in database
      const now = new Date().toISOString();
      db.prepare("UPDATE users SET status = 'online', last_seen_at = ? WHERE id = ?").run(now, user.id);

      client = {
        ws,
        userId: user.id,
        username: user.username,
        displayName: user.display_name,
        activeChannels: new Set<string>(),
        isAlive: true,
      };

      if (!userConnections.has(user.id)) {
        userConnections.set(user.id, new Set());
      }
      userConnections.get(user.id)!.add(client);
      connectionClients.set(ws, client);

      ws.send(JSON.stringify({
        type: 'auth_success',
        payload: {
          userId: user.id,
          username: user.username,
          displayName: user.display_name,
        },
      }));

      // Broadcast user online to contacts
      broadcastPresence(user.id, 'online', now);
      return client;
    };

    if (token) {
      client = handleAuth(token);
    }

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());

        if (data.type === 'auth') {
          if (data.token) {
            client = handleAuth(data.token);
          }
          return;
        }

        if (!client) {
          ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
          return;
        }

        switch (data.type) {
          case 'ping': {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
          }

          case 'join_channel': {
            const { targetId } = data.payload || {};
            if (targetId) {
              client.activeChannels.add(targetId);
              ws.send(JSON.stringify({ type: 'channel_joined', payload: { targetId } }));
            }
            break;
          }

          case 'leave_channel': {
            const { targetId } = data.payload || {};
            if (targetId) {
              client.activeChannels.delete(targetId);
            }
            break;
          }

          case 'typing': {
            const { targetId, isTyping } = data.payload || {};
            if (!targetId) return;

            const typingPayload = {
              type: 'typing_indicator',
              payload: {
                targetId,
                userId: client.userId,
                displayName: client.displayName,
                isTyping: !!isTyping,
              },
            };

            // Broadcast to conversation or room members
            if (targetId.startsWith('conv_')) {
              broadcastToConversation(targetId, 'typing_indicator', typingPayload.payload, client.userId);
            } else {
              broadcastToRoom(targetId, 'typing_indicator', typingPayload.payload, client.userId);
            }
            break;
          }

          case 'mark_read': {
            const { conversationId, messageId } = data.payload || {};
            if (conversationId && messageId) {
              const now = new Date().toISOString();
              db.prepare(`
                UPDATE conversation_members
                SET last_read_message_id = ?
                WHERE conversation_id = ? AND user_id = ?
              `).run(messageId, conversationId, client.userId);

              db.prepare(`
                INSERT INTO message_receipts (id, message_id, user_id, status, updated_at)
                VALUES (?, ?, ?, 'read', ?)
                ON CONFLICT(message_id, user_id) DO UPDATE SET status = 'read', updated_at = excluded.updated_at
              `).run(`rcpt_${Date.now()}_${client.userId}`, messageId, client.userId, now);

              broadcastToConversation(conversationId, 'message_read', {
                conversationId,
                messageId,
                readBy: client.userId,
                readAt: now,
              });
            }
            break;
          }
        }
      } catch (err) {
        console.error('WS message parse error:', err);
      }
    });

    ws.on('pong', () => {
      if (client) {
        client.isAlive = true;
      }
    });

    ws.on('close', () => {
      if (client) {
        const userSet = userConnections.get(client.userId);
        if (userSet) {
          userSet.delete(client);
          if (userSet.size === 0) {
            userConnections.delete(client.userId);
            const now = new Date().toISOString();
            db.prepare("UPDATE users SET status = 'offline', last_seen_at = ? WHERE id = ?").run(now, client.userId);
            broadcastPresence(client.userId, 'offline', now);
          }
        }
      }
    });
  });

  // Heartbeat interval to check alive connections every 30s
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = connectionClients.get(ws);
      if (client) {
        if (!client.isAlive) {
          ws.terminate();
          return;
        }
        client.isAlive = false;
        ws.ping();
      }
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}

/**
 * Broadcast event to all active sessions of a single user
 */
export function broadcastToUser(userId: string, type: string, payload: any) {
  const clients = userConnections.get(userId);
  if (!clients) return;
  const message = JSON.stringify({ type, payload });
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

/**
 * Broadcast event to all members of a direct conversation
 */
export function broadcastToConversation(conversationId: string, type: string, payload: any, excludeUserId?: string) {
  const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(conversationId) as { user_id: string }[];
  const message = JSON.stringify({ type, payload });

  for (const member of members) {
    if (excludeUserId && member.user_id === excludeUserId) continue;
    const clients = userConnections.get(member.user_id);
    if (clients) {
      for (const client of clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(message);
        }
      }
    }
  }
}

/**
 * Broadcast event to all members of a group chat room
 */
export function broadcastToRoom(roomId: string, type: string, payload: any, excludeUserId?: string) {
  const members = db.prepare('SELECT user_id FROM room_members WHERE room_id = ? AND is_banned = 0').all(roomId) as { user_id: string }[];
  const message = JSON.stringify({ type, payload });

  for (const member of members) {
    if (excludeUserId && member.user_id === excludeUserId) continue;
    const clients = userConnections.get(member.user_id);
    if (clients) {
      for (const client of clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(message);
        }
      }
    }
  }
}

/**
 * Broadcast presence update (online / offline / away) to everyone connected
 */
export function broadcastPresence(userId: string, status: string, lastSeenAt: string) {
  const message = JSON.stringify({
    type: 'presence_update',
    payload: { userId, status, lastSeenAt },
  });

  if (wssInstance) {
    wssInstance.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }
}
