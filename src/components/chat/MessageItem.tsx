import React, { useState } from 'react';
import {
  Pin,
  Check,
  CheckCheck,
  MoreVertical,
  Smile,
  Reply,
  Edit2,
  Trash2,
  Copy,
  Download,
  FileText,
  Flag,
  Crown,
  ShieldCheck,
} from 'lucide-react';
import { Message, RoomRole } from '../../types/index.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { useToast } from '../common/Toast.tsx';

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  canModerate: boolean;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onTogglePin: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onReport?: (message: Message) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isOwn,
  canModerate,
  onReply,
  onEdit,
  onDelete,
  onTogglePin,
  onToggleReaction,
  onReport,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const quickEmojis = ['👍', '❤️', '🎉', '🚀', '👀', '🔥'];

  const formatTime = (isoDate: string) => {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    toast('Message copied to clipboard', 'info');
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImageFile = (type?: string | null, url?: string | null) => {
    if (type && type.startsWith('image/')) return true;
    if (url && /\.(jpg|jpeg|png|webp|gif)$/i.test(url)) return true;
    return false;
  };

  return (
    <div
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        setShowEmojiPicker(false);
      }}
      className={`group relative flex items-start gap-2.5 px-4 py-1.5 transition-colors ${
        message.isPinned ? 'bg-amber-500/10 border-y border-amber-500/20' : 'hover:bg-white/5'
      } ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar (for others' messages) */}
      {!isOwn && (
        <Avatar
          name={message.sender.displayName}
          avatarUrl={message.sender.avatarUrl}
          size="sm"
          className="mt-0.5"
        />
      )}

      {/* Message Bubble Container */}
      <div className={`flex flex-col max-w-[78%] md:max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* Sender Name & Room Role (if not own) */}
        {!isOwn && (
          <div className="flex items-center gap-1.5 mb-1 px-1">
            <span className="text-xs font-semibold text-[#EDEDED]">
              {message.sender.displayName}
            </span>
            <span className="text-[10px] text-slate-400 mono">
              {message.sender.userId}
            </span>
            {message.sender.role && message.sender.role !== 'member' && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-medium uppercase px-1 py-0.2 bg-white/10 text-amber-400 rounded">
                {message.sender.role === 'owner' ? (
                  <Crown className="w-2.5 h-2.5 text-amber-400" />
                ) : (
                  <ShieldCheck className="w-2.5 h-2.5 text-amber-300" />
                )}
                {message.sender.role}
              </span>
            )}
          </div>
        )}

        {/* Reply Preview */}
        {message.replyTo && (
          <div
            className={`text-xs px-2.5 py-1 mb-1 rounded-lg border-l-2 max-w-full truncate ${
              isOwn
                ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                : 'bg-[#1A1A1B] border-slate-600 text-slate-300'
            }`}
          >
            <span className="font-medium mr-1">{message.replyTo.senderName}:</span>
            <span className="truncate">{message.replyTo.content}</span>
          </div>
        )}

        {/* Bubble */}
        <div
          className={`relative px-3.5 py-2 text-sm leading-relaxed rounded-2xl ${
            isOwn
              ? 'bg-amber-500 text-black font-medium rounded-tr-xs shadow-sm'
              : 'bg-[#1A1A1B] text-[#EDEDED] border border-white/10 rounded-tl-xs'
          } ${message.isDeleted ? 'italic text-slate-500' : ''}`}
        >
          {/* Pinned Marker */}
          {message.isPinned && (
            <div className={`flex items-center gap-1 text-[10px] font-medium mb-1 ${isOwn ? 'text-black/80' : 'text-amber-400'}`}>
              <Pin className="w-3 h-3 fill-current" />
              <span>Pinned message</span>
            </div>
          )}

          {/* File Attachment */}
          {message.fileUrl && !message.isDeleted && (
            <div className="mb-2">
              {isImageFile(message.fileType, message.fileUrl) ? (
                <a href={message.fileUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg">
                  <img
                    src={message.fileUrl}
                    alt={message.fileName || 'Attachment'}
                    className="max-h-60 max-w-full rounded-lg object-cover hover:opacity-95 transition-opacity"
                  />
                </a>
              ) : (
                <a
                  href={message.fileUrl}
                  download={message.fileName || 'file'}
                  className={`flex items-center gap-2.5 p-2 rounded-lg border transition-colors ${
                    isOwn
                      ? 'bg-black/10 border-black/20 text-black hover:bg-black/20'
                      : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                  }`}
                >
                  <FileText className={`w-5 h-5 shrink-0 ${isOwn ? 'text-black' : 'text-amber-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{message.fileName || 'Document'}</p>
                    <p className={`text-[10px] ${isOwn ? 'text-black/70' : 'text-slate-400'}`}>{formatFileSize(message.fileSize)}</p>
                  </div>
                  <Download className="w-4 h-4 shrink-0 opacity-70" />
                </a>
              )}
            </div>
          )}

          {/* Content */}
          <p className="whitespace-pre-wrap break-words select-text">
            {message.content}
          </p>

          {/* Footer: Time & Status */}
          <div
            className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
              isOwn ? 'text-black/70 font-mono' : 'text-slate-400 mono'
            }`}
          >
            {message.isEdited && !message.isDeleted && (
              <span className="italic mr-0.5 opacity-80">(edited)</span>
            )}
            <span>{formatTime(message.createdAt)}</span>
            {isOwn && (
              <span className="shrink-0 ml-0.5" title={message.status === 'read' ? 'Read' : 'Delivered'}>
                {message.status === 'read' ? (
                  <CheckCheck className="w-3.5 h-3.5 text-black" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-black/80" />
                )}
              </span>
            )}
          </div>
        </div>

        {/* Reactions List */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5 px-0.5">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onToggleReaction(message.id, r.emoji)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors cursor-pointer ${
                  r.hasReacted
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    : 'bg-[#1A1A1B] text-slate-300 border border-white/10 hover:bg-white/10'
                }`}
              >
                <span>{r.emoji}</span>
                <span className="mono text-[11px]">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Menu on Hover */}
      {showActions && !message.isDeleted && (
        <div
          className={`absolute top-0 flex items-center gap-0.5 p-1 bg-[#141416] border border-white/10 rounded-lg shadow-lg z-10 ${
            isOwn ? 'right-2 -translate-y-1/2' : 'left-12 -translate-y-1/2'
          }`}
        >
          {/* Quick Reaction Button */}
          <div className="relative">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1 hover:bg-white/10 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
              title="React"
            >
              <Smile className="w-4 h-4" />
            </button>

            {/* Quick Emoji Popover */}
            {showEmojiPicker && (
              <div className="absolute bottom-full left-0 mb-1 flex items-center gap-1 p-1.5 bg-[#141416] border border-white/10 rounded-lg shadow-xl z-20">
                {quickEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      onToggleReaction(message.id, emoji);
                      setShowEmojiPicker(false);
                    }}
                    className="p-1 text-base hover:scale-125 transition-transform cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reply */}
          <button
            onClick={() => onReply(message)}
            className="p-1 hover:bg-white/10 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
            title="Reply"
          >
            <Reply className="w-4 h-4" />
          </button>

          {/* Pin */}
          <button
            onClick={() => onTogglePin(message.id)}
            className={`p-1 hover:bg-white/10 rounded transition-colors cursor-pointer ${
              message.isPinned ? 'text-amber-400' : 'text-slate-400 hover:text-white'
            }`}
            title={message.isPinned ? 'Unpin message' : 'Pin message'}
          >
            <Pin className="w-4 h-4" />
          </button>

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-white/10 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
            title="Copy Text"
          >
            <Copy className="w-4 h-4" />
          </button>

          {/* Edit (author only) */}
          {isOwn && (
            <button
              onClick={() => onEdit(message)}
              className="p-1 hover:bg-white/10 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
              title="Edit"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}

          {/* Delete (author or moderator) */}
          {(isOwn || canModerate) && (
            <button
              onClick={() => onDelete(message.id)}
              className="p-1 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded transition-colors cursor-pointer"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Report (others' messages) */}
          {!isOwn && onReport && (
            <button
              onClick={() => onReport(message)}
              className="p-1 hover:bg-white/10 text-slate-400 hover:text-red-400 rounded transition-colors cursor-pointer"
              title="Report message"
            >
              <Flag className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
