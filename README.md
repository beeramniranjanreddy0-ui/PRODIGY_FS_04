# Connectly — Real-Time Messaging & Permission-Controlled Chat Platform

Connectly is a production-minded, full-stack real-time messaging web application featuring unique human-readable User IDs (`USR-xxxx`), request-based private chat authorization, owner-controlled group chat rooms with 10 granular permission switches, real-time presence, typing indicators, reactions, message pinning, and strict server-authoritative security.

---

## 1. Architecture & Technology Stack

Connectly provides a dual-backend implementation:

### Live Application Runtime (Port 3000)
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React icons
- **Backend:** Node.js (v22), Express 4, Native SQLite with WAL mode & foreign keys enabled
- **Real-Time Layer:** WebSockets (`ws`) with bi-directional event dispatch, heartbeat, and connection registry
- **Authentication:** JWT Access Tokens (2h) & Refresh Tokens (7d), Argon2/scrypt password hashing with cryptographic salt
- **File Attachments:** Multer with strict MIME type validation and 10MB size limits

### Python FastAPI Backend (`/backend_python`)
- **Framework:** FastAPI with async WebSocket endpoint (`/ws`)
- **ORM & Migrations:** SQLAlchemy 2.0 & Alembic
- **Password Security:** Argon2id (`argon2-cffi`)
- **Schemas:** Pydantic v2
- **Testing:** Pytest with HTTPX & pytest-asyncio

---

## 2. Key Features Implemented

### Authentication & User Accounts
- User registration, login, token refresh, and logout
- Secure password hashing using Argon2/scrypt with salt and constant-time verification
- Unique, collision-safe human-readable public User IDs (`USR-1042`, `USR-2087`, `USR-3156`, `USR-4920`)
- Online, offline, and away presence tracking with real-time broadcast
- User profile editing: Display name, bio, status message, status
- 1-Click Test Account Switcher in UI for zero-friction testing between users

### User Discovery & Request-Based Chat
- Search users by public User ID (e.g., `USR-1042`) or username
- "Request to Chat" workflow: messaging is locked until the recipient accepts
- Reverse-request auto-connection: if User B requests User A while User A requested User B, conversation connects immediately
- Incoming & Outgoing request management with Accept, Reject, and Cancel actions
- Rate limiting: max 10 requests per minute to prevent request spam

### Private Real-Time Messaging
- Instant text message delivery via authenticated WebSockets
- Persistent message storage in relational SQLite with timestamps and foreign keys
- Typing indicators with auto-clear and presence tracking
- Sent, delivered, and read status receipts (double-checkmark indicators)
- Message replies (quoted context banner)
- Emoji reactions with count toggles (`👍`, `❤️`, `🎉`, `🚀`, `👀`, `🔥`)
- Edit and soft-delete own messages
- Message pinning to the top of conversations
- In-conversation keyword search with timestamps
- File and document attachments (images, PDFs, documents up to 10MB)

### Group Chat Room System & Role-Based Permissions
- Room creation with unique Room ID (`ROOM-xxxx`) and private invite codes
- Three room visibility tiers: Public, Private, Invite-Only
- Role Hierarchy:
  - **Owner:** Full control, transfer ownership, delete room, assign/revoke admin roles, configure all 10 permissions, kick/ban members
  - **Admin / Moderator:** Moderate messages, manage members, approve join requests (cannot kick other admins or owner)
  - **Member:** Read, send (if allowed), reply, react, leave
- **10 Configurable Room Permissions:**
  1. *Join Policy:* Open, Approval Required, Invite Only
  2. *Message Send Policy:* All Members vs Admins/Owner Only (Announcement Mode)
  3. *Invite Policy:* All Members vs Admins/Owner Only
  4. *Edit Room Details:* Admins/Owner vs Owner Only
  5. *Pin Messages:* All Members vs Admins/Owner Only
  6. *Moderate/Delete Messages:* Admins/Owner vs Owner Only
  7. *File Upload Enabled:* Toggle on/off
  8. *Past History Visibility:* New members see history vs only post-join messages
  9. *Slow Mode Cooldown:* Off, 5s, 15s, 30s, 60s
  10. *Thread Replies Enabled:* Toggle on/off

### Privacy, Blocking, and Moderation
- Block/unblock users (cancels pending requests and blocks direct communication)
- User and message reporting with categorization (spam, harassment, inappropriate)
- Audit logging for room creation, moderation, role updates, and ownership transfers
- Responsive layout with desktop 3-pane view and mobile dedicated back-navigation view
- Light and dark theme toggle

---

## 3. Database Schema Overview

The database uses normalized relational tables with foreign keys and cascade deletions:
- `users`: User profiles, public User ID, credentials, presence
- `refresh_tokens`: Active sessions with expiration timestamps
- `chat_requests`: Private chat request state (`pending`, `accepted`, `rejected`, `cancelled`)
- `conversations`: Direct chat containers
- `conversation_members`: Direct chat membership, last read message pointer, mute, archive
- `chat_rooms`: Group rooms, visibility, owner ID, invite code
- `room_members`: Room membership, role (`owner`, `admin`, `member`), ban status, mute status
- `room_permissions`: 10 permission configurations per room
- `room_join_requests`: Pending join approvals for private/approval-required rooms
- `messages`: Persisted messages with conversation/room references, reply links, file URLs, pins, edits, deletions
- `message_reactions`: Emoji reaction records (unique by message, user, emoji)
- `message_receipts`: Read receipts per message per recipient
- `notifications`: In-app notification queue with link data
- `blocked_users`: Blocker-to-blocked pairs
- `user_reports`: User and message moderation reports
- `audit_logs`: Administrative actions log

---

## 4. Getting Started

### Environment Variables
Copy `.env.example` to `.env`:
```bash
PORT=3000
JWT_SECRET=your_jwt_secret_key_minimum_32_characters
JWT_REFRESH_SECRET=your_refresh_secret_key_minimum_32_characters
DATABASE_URL=data/connectly.db
```

### Running the Applet
```bash
# Install dependencies
npm install

# Run full-stack dev server (Express + WebSocket + Vite SPA on port 3000)
npm run dev

# Run automated tests
npm test

# Build for production
npm run build
npm run start
```

---

## 5. Automated Test Suite Results

The project includes an automated test suite in `tests/backend.test.cjs` covering all required flows:

```
TAP version 13
# Subtest: Connectly Backend Test Suite
    # Subtest: 1. Authentication & User Registration
    ok 1 - 1. Authentication & User Registration
    # Subtest: 2. Chat Requests Workflow & Validation
    ok 2 - 2. Chat Requests Workflow & Validation
    # Subtest: 3. Private Messaging & Message Persistence
    ok 3 - 3. Private Messaging & Message Persistence
    # Subtest: 4. Group Rooms & Owner/Admin/Member Permissions
    ok 4 - 4. Group Rooms & Owner/Admin/Member Permissions
    # Subtest: 5. Blocked Users & Privacy Enforcement
    ok 5 - 5. Blocked Users & Privacy Enforcement
1..5
ok 1 - Connectly Backend Test Suite
# tests 6
# pass 6
# fail 0
```

---

## 6. Pre-Seeded Demo Accounts

For instant testing, use the **1-Click Test Accounts** switcher on the login screen or navigation bar:

| User ID | Name | Role | Email | Password |
| :--- | :--- | :--- | :--- | :--- |
| `USR-1042` | Alex Rivera | Full-stack Engineer | `alex@connectly.dev` | `Password123!` |
| `USR-2087` | Sarah Chen | Product Lead | `sarah@connectly.dev` | `Password123!` |
| `USR-3156` | Marcus Vance | Security Architect | `marcus@connectly.dev` | `Password123!` |
| `USR-4920` | Elena Rostova | Distributed Engineer | `elena@connectly.dev` | `Password123!` |

### Pre-Seeded Rooms:
- `ROOM-1010` — **Engineering Hub** (Public, Open membership)
- `ROOM-2020` — **Design System Lab** (Invite-Only, Code: `dsgn8899`)
- `ROOM-3030` — **Product Announcements** (Public, Admins-only posting policy)
