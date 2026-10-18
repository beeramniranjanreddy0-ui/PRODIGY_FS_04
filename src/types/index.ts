export type UserStatus = 'online' | 'offline' | 'away';

export interface User {
  id: string;
  userId: string; // e.g. USR-1042
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  statusMessage?: string;
  status: UserStatus;
  lastSeenAt: string;
  createdAt?: string;
  unreadRequestsCount?: number;
  unreadNotificationsCount?: number;
}

export interface ConversationParticipant {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  status: UserStatus;
  lastSeenAt: string;
}

export interface LastMessage {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  updatedAt: string;
  isMuted: boolean;
  isArchived: boolean;
  unreadCount: number;
  participant: ConversationParticipant | null;
  lastMessage: LastMessage | null;
  pinnedMessages?: any[];
}

export type RoomVisibility = 'public' | 'private' | 'invite_only';
export type RoomRole = 'owner' | 'admin' | 'member';

export interface RoomPermissions {
  joinPolicy: 'open' | 'approval_required' | 'invite_only';
  messageSendPolicy: 'all' | 'admins_only';
  invitePolicy: 'all' | 'admins_only';
  editRoomInfoPolicy: 'owner_only' | 'admins_only';
  pinMessagePolicy: 'all' | 'admins_only';
  deleteMessagePolicy: 'admins_only' | 'owner_only';
  fileUploadEnabled: boolean;
  historyVisibleToNewMembers: boolean;
  slowModeSeconds: number;
  threadRepliesEnabled: boolean;
}

export interface ChatRoom {
  id: string;
  roomId: string; // e.g. ROOM-1010
  name: string;
  description: string;
  ownerId: string;
  visibility: RoomVisibility;
  inviteCode?: string | null;
  memberCount: number;
  role?: RoomRole | null;
  isMember?: boolean;
  createdAt: string;
  updatedAt?: string;
  permissions?: RoomPermissions;
  pinnedMessages?: any[];
}

export interface RoomMember {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  status: UserStatus;
  lastSeenAt: string;
  role: RoomRole;
  isBanned: boolean;
  isMuted: boolean;
  joinedAt: string;
}

export interface RoomJoinRequest {
  id: string;
  user_id: string;
  public_user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  created_at: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  hasReacted: boolean;
}

export interface MessageReplyPreview {
  id: string;
  content: string;
  senderName: string;
}

export interface Message {
  id: string;
  conversationId?: string | null;
  roomId?: string | null;
  senderId: string;
  sender: {
    id: string;
    userId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    role?: RoomRole;
  };
  content: string;
  replyTo?: MessageReplyPreview | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileType?: string | null;
  isPinned: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  status?: 'sent' | 'delivered' | 'read';
  reactions: MessageReaction[];
  createdAt: string;
  updatedAt?: string;
}

export interface ChatRequest {
  id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  message: string;
  createdAt: string;
  updatedAt: string;
  sender?: ConversationParticipant;
  recipient?: ConversationParticipant;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  data: any;
  isRead: boolean;
  createdAt: string;
}
