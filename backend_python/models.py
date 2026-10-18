import datetime
from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, index=True)
    user_id = Column(String(32), unique=True, nullable=False, index=True)  # e.g. USR-1042
    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(128), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    display_name = Column(String(128), nullable=False)
    avatar_url = Column(Text, default="")
    bio = Column(Text, default="")
    status_message = Column(String(256), default="")
    status = Column(String(32), default="offline")
    last_seen_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(String(64), primary_key=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(512), unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

class ChatRequest(Base):
    __tablename__ = "chat_requests"

    id = Column(String(64), primary_key=True)
    sender_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    receiver_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(32), default="pending", nullable=False)  # pending, accepted, rejected, cancelled
    message = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("sender_id", "receiver_id", name="uq_sender_receiver"),)

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String(64), primary_key=True)
    type = Column(String(32), default="direct", nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

class ConversationMember(Base):
    __tablename__ = "conversation_members"

    conversation_id = Column(String(64), ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    joined_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    last_read_message_id = Column(String(64), nullable=True)
    is_muted = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)

class ChatRoom(Base):
    __tablename__ = "chat_rooms"

    id = Column(String(64), primary_key=True)
    room_id = Column(String(32), unique=True, nullable=False, index=True)  # e.g. ROOM-1010
    name = Column(String(128), nullable=False)
    description = Column(Text, default="")
    owner_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    visibility = Column(String(32), default="public", nullable=False)  # public, private, invite_only
    invite_code = Column(String(32), unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

class RoomMember(Base):
    __tablename__ = "room_members"

    room_id = Column(String(64), ForeignKey("chat_rooms.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role = Column(String(32), default="member", nullable=False)  # owner, admin, member
    joined_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    is_banned = Column(Boolean, default=False)
    is_muted = Column(Boolean, default=False)

class RoomPermissions(Base):
    __tablename__ = "room_permissions"

    room_id = Column(String(64), ForeignKey("chat_rooms.id", ondelete="CASCADE"), primary_key=True)
    join_policy = Column(String(32), default="open")  # open, approval_required, invite_only
    message_send_policy = Column(String(32), default="all")  # all, admins_only
    invite_policy = Column(String(32), default="all")  # all, admins_only
    edit_room_info_policy = Column(String(32), default="admins_only")  # owner_only, admins_only
    pin_message_policy = Column(String(32), default="admins_only")  # all, admins_only
    delete_message_policy = Column(String(32), default="admins_only")  # admins_only, owner_only
    file_upload_enabled = Column(Boolean, default=True)
    history_visible_to_new_members = Column(Boolean, default=True)
    slow_mode_seconds = Column(Integer, default=0)
    thread_replies_enabled = Column(Boolean, default=True)

class RoomJoinRequest(Base):
    __tablename__ = "room_join_requests"

    id = Column(String(64), primary_key=True)
    room_id = Column(String(64), ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(32), default="pending", nullable=False)  # pending, approved, rejected
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("room_id", "user_id", name="uq_room_user_request"),)

class Message(Base):
    __tablename__ = "messages"

    id = Column(String(64), primary_key=True)
    conversation_id = Column(String(64), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=True, index=True)
    room_id = Column(String(64), ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=True, index=True)
    sender_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    reply_to_id = Column(String(64), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    file_url = Column(Text, nullable=True)
    file_name = Column(String(256), nullable=True)
    file_size = Column(Integer, nullable=True)
    file_type = Column(String(128), nullable=True)
    is_pinned = Column(Boolean, default=False)
    is_edited = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

class MessageReaction(Base):
    __tablename__ = "message_reactions"

    id = Column(String(64), primary_key=True)
    message_id = Column(String(64), ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    emoji = Column(String(16), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("message_id", "user_id", "emoji", name="uq_msg_user_emoji"),)

class MessageReceipt(Base):
    __tablename__ = "message_receipts"

    id = Column(String(64), primary_key=True)
    message_id = Column(String(64), ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(32), default="delivered", nullable=False)  # delivered, read
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("message_id", "user_id", name="uq_msg_user_receipt"),)

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(64), primary_key=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(64), nullable=False)
    title = Column(String(128), nullable=False)
    body = Column(Text, nullable=False)
    link = Column(String(256), default="")
    data_json = Column(Text, default="{}")
    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

class BlockedUser(Base):
    __tablename__ = "blocked_users"

    blocker_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    blocked_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

class UserReport(Base):
    __tablename__ = "user_reports"

    id = Column(String(64), primary_key=True)
    reporter_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reported_user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reason = Column(String(128), nullable=False)
    details = Column(Text, default="")
    message_id = Column(String(64), nullable=True)
    status = Column(String(32), default="pending")
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(64), primary_key=True)
    actor_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action = Column(String(64), nullable=False)
    target_type = Column(String(32), nullable=False)
    target_id = Column(String(64), nullable=False)
    details = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
