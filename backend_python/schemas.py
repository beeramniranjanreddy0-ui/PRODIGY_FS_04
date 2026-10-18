from typing import Optional, List
from pydantic import BaseModel, EmailStr
from datetime import datetime

class UserBase(BaseModel):
    username: str
    email: EmailStr
    display_name: str

class UserCreate(UserBase):
    password: str

class UserResponse(BaseModel):
    id: str
    user_id: str
    username: str
    email: str
    display_name: str
    avatar_url: Optional[str] = ""
    bio: Optional[str] = ""
    status_message: Optional[str] = ""
    status: Optional[str] = "offline"
    last_seen_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    user: UserResponse
    accessToken: str
    refreshToken: str

class LoginRequest(BaseModel):
    identifier: str
    password: str

class ChatRequestCreate(BaseModel):
    targetUserId: str
    message: Optional[str] = ""

class MessageCreate(BaseModel):
    content: Optional[str] = None
    replyToId: Optional[str] = None
    fileUrl: Optional[str] = None
    fileName: Optional[str] = None
    fileSize: Optional[int] = None
    fileType: Optional[str] = None
    clientMessageId: Optional[str] = None

class RoomCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    visibility: Optional[str] = "public"
    permissions: Optional[dict] = None

class RoomPermissionsUpdate(BaseModel):
    joinPolicy: Optional[str] = None
    messageSendPolicy: Optional[str] = None
    invitePolicy: Optional[str] = None
    editRoomInfoPolicy: Optional[str] = None
    pinMessagePolicy: Optional[str] = None
    deleteMessagePolicy: Optional[str] = None
    fileUploadEnabled: Optional[bool] = None
    historyVisibleToNewMembers: Optional[bool] = None
    slowModeSeconds: Optional[int] = None
    threadRepliesEnabled: Optional[bool] = None
