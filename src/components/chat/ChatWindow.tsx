import React, { useRef, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Search,
  Users,
  Settings,
  Info,
  Pin,
  Globe,
  Lock,
  KeyRound,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { useChat } from '../../context/ChatContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { Message, ChatRoom } from '../../types/index.ts';
import { Avatar } from '../common/Avatar.tsx';
import { MessageItem } from './MessageItem.tsx';
import { MessageInput } from './MessageInput.tsx';

interface ChatWindowProps {
  onBackMobile?: () => void;
  onOpenSearch: () => void;
  onOpenMembers: () => void;
  onOpenSettings: () => void;
  onOpenDetails: () => void;
  onReportMessage: (message: Message) => void;
  onOpenCreateRoom?: () => void;
  onOpenNewChat?: () => void;
  onOpenJoinRoom?: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  onBackMobile,
  onOpenSearch,
  onOpenMembers,
  onOpenSettings,
  onOpenDetails,
  onReportMessage,
  onOpenCreateRoom,
  onOpenNewChat,
  onOpenJoinRoom,
}) => {
  const { user } = useAuth();
  const {
    activeType,
    activeId,
    activeChat,
    messages,
    isLoadingMessages,
    typingUsers,
    userPresence,
    sendMessage,
    editMessage,
    deleteMessage,
    togglePin,
    toggleReaction,
    sendTypingSignal,
  } = useChat();

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editContent, setEditContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!activeType || !activeId || !activeChat) {
    return (
      <div className="flex-1 hidden md:flex flex-col items-center justify-center p-8 bg-[#0D0D0E] text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-white text-black flex items-center justify-center font-extrabold text-3xl shadow-xl mb-6">
          C
        </div>
        <h2 className="text-4xl font-bold tracking-tight text-[#EDEDED] mb-3">
          Welcome to Connectly
        </h2>
        <p className="opacity-60 text-sm max-w-md text-[#EDEDED] mb-8 font-normal leading-relaxed">
          Select a chat, join a group room, or create your own room to start communicating instantly.
        </p>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 mb-8">
          {onOpenCreateRoom && (
            <button
              onClick={onOpenCreateRoom}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-2"
            >
              <span>+ Create Room</span>
            </button>
          )}
          {onOpenNewChat && (
            <button
              onClick={onOpenNewChat}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl border border-white/10 transition-all cursor-pointer"
            >
              Start Direct Chat
            </button>
          )}
          {onOpenJoinRoom && (
            <button
              onClick={onOpenJoinRoom}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl border border-white/10 transition-all cursor-pointer"
            >
              Join Room by ID
            </button>
          )}
        </div>

        <div className="pt-6 border-t border-white/10 w-48 mx-auto">
          <span className="mono text-[10px] text-amber-500 font-bold tracking-widest uppercase">
            CONNECTLY READY
          </span>
        </div>
      </div>
    );
  }

  const isRoom = activeType === 'room';
  const room = isRoom ? (activeChat as ChatRoom) : null;
  const conversation = !isRoom ? (activeChat as any) : null;
  const participant = conversation?.participant;

  const currentTyping = typingUsers[activeId] || [];

  // Room permission evaluations
  const callerRole = room?.role;
  const isOwner = callerRole === 'owner';
  const isAdmin = callerRole === 'admin';
  const canSendMessages = isRoom
    ? (room?.permissions?.messageSendPolicy === 'all' || isOwner || isAdmin)
    : true;
  const slowMode = isRoom ? (room?.permissions?.slowModeSeconds || 0) : 0;

  const handleEditInit = (msg: Message) => {
    setEditingMessage(msg);
    setEditContent(msg.content);
  };

  const handleSaveEdit = async () => {
    if (!editingMessage || !editContent.trim()) return;
    await editMessage(editingMessage.id, editContent.trim());
    setEditingMessage(null);
    setEditContent('');
  };

  const formatPresenceText = () => {
    if (!participant) return '';
    const currentStatus = userPresence[participant.id]?.status || participant.status;
    if (currentStatus === 'online') return 'Active now';
    if (currentStatus === 'away') return 'Away';
    if (participant.lastSeenAt) {
      const date = new Date(participant.lastSeenAt);
      return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return 'Offline';
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0D0D0E] text-[#EDEDED] overflow-hidden">
      {/* Top Bar */}
      <header className="h-14 border-b border-white/10 px-4 flex items-center justify-between shrink-0 bg-[#0D0D0E] z-10">
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile Back Button */}
          {onBackMobile && (
            <button
              onClick={onBackMobile}
              className="md:hidden p-1.5 -ml-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg"
              title="Back to conversations"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {/* Avatar or Room Icon */}
          {isRoom ? (
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              {room?.visibility === 'public' && <Globe className="w-4 h-4 text-slate-600 dark:text-slate-300" />}
              {room?.visibility === 'private' && <Lock className="w-4 h-4 text-amber-600" />}
              {room?.visibility === 'invite_only' && <KeyRound className="w-4 h-4 text-indigo-600" />}
            </div>
          ) : (
            <Avatar
              name={participant?.displayName || 'User'}
              avatarUrl={participant?.avatarUrl}
              status={participant ? (userPresence[participant.id]?.status || participant.status) : 'offline'}
              size="sm"
              showStatus={true}
            />
          )}

          {/* Title & Metadata */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {isRoom ? room?.name : participant?.displayName}
              </h2>
              <span className="font-mono text-[10px] text-slate-400 shrink-0">
                {isRoom ? room?.roomId : participant?.userId}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {isRoom
                ? `${room?.memberCount || 1} members · ${room?.visibility || 'public'}`
                : formatPresenceText()}
            </p>
          </div>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onOpenSearch}
            className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-lg transition-colors cursor-pointer"
            title="Search conversation messages"
          >
            <Search className="w-4 h-4" />
          </button>

          {isRoom ? (
            <>
              <button
                onClick={onOpenMembers}
                className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-lg transition-colors cursor-pointer"
                title="Room members & moderation"
              >
                <Users className="w-4 h-4" />
              </button>

              {(isOwner || isAdmin) && (
                <button
                  onClick={onOpenSettings}
                  className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-lg transition-colors cursor-pointer"
                  title="Room permissions & configuration"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            <button
              onClick={onOpenDetails}
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-lg transition-colors cursor-pointer"
              title="Chat details & options"
            >
              <Info className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Pinned Messages Header Ribbon */}
      {activeChat.pinnedMessages && activeChat.pinnedMessages.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200/60 dark:border-amber-900/40 text-xs">
          <div className="flex items-center gap-2 min-w-0 mr-2">
            <Pin className="w-3.5 h-3.5 text-amber-600 fill-amber-600 shrink-0" />
            <span className="font-medium text-amber-900 dark:text-amber-200 shrink-0">
              Pinned:
            </span>
            <span className="text-amber-800 dark:text-amber-300 truncate">
              {activeChat.pinnedMessages[0].content}
            </span>
          </div>
          <span className="text-[10px] text-amber-700 dark:text-amber-400 shrink-0 font-medium">
            {activeChat.pinnedMessages.length} pinned
          </span>
        </div>
      )}

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto py-3">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          </div>
        ) : messages.length > 0 ? (
          messages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              isOwn={msg.senderId === user?.id}
              canModerate={isOwner || isAdmin}
              onReply={(m) => setReplyingTo(m)}
              onEdit={handleEditInit}
              onDelete={deleteMessage}
              onTogglePin={togglePin}
              onToggleReaction={toggleReaction}
              onReport={onReportMessage}
            />
          ))
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No messages here yet.
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              Say hello to start the conversation!
            </p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Active Typing Indicator */}
      {currentTyping.length > 0 && (
        <div className="px-4 py-1 text-[11px] text-slate-500 dark:text-slate-400 italic flex items-center gap-1.5 animate-pulse">
          <span>{currentTyping.join(', ')} {currentTyping.length === 1 ? 'is' : 'are'} typing...</span>
        </div>
      )}

      {/* Inline Edit Modal/Bar */}
      {editingMessage && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Edit Message
            </span>
            <button
              onClick={() => setEditingMessage(null)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
            />
            <button
              onClick={handleSaveEdit}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Message Input Bar */}
      {!editingMessage && (
        <MessageInput
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          onSendMessage={sendMessage}
          onTyping={sendTypingSignal}
          slowModeSeconds={slowMode}
          disabled={!canSendMessages}
          disabledReason={
            !canSendMessages
              ? 'Only room administrators are permitted to post messages in this room.'
              : undefined
          }
        />
      )}
    </div>
  );
};
