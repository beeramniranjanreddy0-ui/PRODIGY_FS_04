import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  Smile,
  X,
  FileText,
  Clock,
  Loader2,
} from 'lucide-react';
import { Message } from '../../types/index.ts';
import { useToast } from '../common/Toast.tsx';
import { apiFetch } from '../../api/client.ts';

interface MessageInputProps {
  replyingTo: Message | null;
  onCancelReply: () => void;
  onSendMessage: (
    content: string,
    replyToId?: string | null,
    fileData?: { url: string; name: string; size: number; type: string }
  ) => Promise<void>;
  onTyping: (isTyping: boolean) => void;
  slowModeSeconds?: number;
  disabled?: boolean;
  disabledReason?: string;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  replyingTo,
  onCancelReply,
  onSendMessage,
  onTyping,
  slowModeSeconds = 0,
  disabled = false,
  disabledReason,
}) => {
  const { toast } = useToast();
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{
    url: string;
    name: string;
    size: number;
    type: string;
  } | null>(null);

  const [slowModeRemaining, setSlowModeRemaining] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const emojis = ['👍', '❤️', '🔥', '🎉', '🚀', '👀', '✨', '👏', '💯', '😂', '🤝', '💡'];

  // Handle slow mode timer
  useEffect(() => {
    if (slowModeRemaining <= 0) return;
    const timer = setInterval(() => {
      setSlowModeRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [slowModeRemaining]);

  // Adjust textarea height automatically
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);

    // Auto resize
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }

    // Typing indicator signal
    onTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      onTyping(false);
    }, 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast('File is larger than the 10MB limit', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);
    try {
      const res = await apiFetch('/upload', {
        method: 'POST',
        body: formData,
      });

      setAttachedFile({
        url: res.url,
        name: res.fileName,
        size: res.fileSize,
        type: res.fileType,
      });
      toast('File attached', 'success');
    } catch (err: any) {
      toast(err.message || 'File upload failed', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if ((!content.trim() && !attachedFile) || isSending || isUploading) return;
    if (slowModeRemaining > 0) return;

    setIsSending(true);
    onTyping(false);

    try {
      await onSendMessage(
        content.trim(),
        replyingTo?.id || null,
        attachedFile || undefined
      );

      setContent('');
      setAttachedFile(null);
      onCancelReply();
      setShowEmojiPicker(false);

      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      if (slowModeSeconds > 0) {
        setSlowModeRemaining(slowModeSeconds);
      }
    } catch (err: any) {
      toast(err.message || 'Failed to send message', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const addEmoji = (emoji: string) => {
    setContent((prev) => prev + emoji);
    setShowEmojiPicker(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  if (disabled) {
    return (
      <div className="p-4 border-t border-white/10 bg-[#0D0D0E] text-center">
        <p className="mono text-xs text-slate-500">
          {disabledReason || 'Messaging is disabled in this room.'}
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 border-t border-white/10 bg-[#0D0D0E] relative">
      {/* Reply Banner */}
      {replyingTo && (
        <div className="flex items-center justify-between px-3 py-1.5 mb-2 bg-amber-500/10 border-l-2 border-amber-500 rounded-r-lg text-xs">
          <div className="min-w-0 flex-1 mr-2">
            <span className="font-semibold text-amber-400">
              Replying to {replyingTo.sender.displayName}:
            </span>
            <p className="text-slate-300 truncate text-[11px]">
              {replyingTo.content}
            </p>
          </div>
          <button
            onClick={onCancelReply}
            className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Attachment Preview Card */}
      {attachedFile && (
        <div className="flex items-center justify-between p-2 mb-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="truncate font-medium text-slate-200">
              {attachedFile.name}
            </span>
            <span className="text-[10px] text-slate-400 mono">
              ({(attachedFile.size / 1024).toFixed(1)} KB)
            </span>
          </div>
          <button
            onClick={() => setAttachedFile(null)}
            className="p-1 text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Slow Mode Indicator */}
      {slowModeRemaining > 0 && (
        <div className="flex items-center gap-1.5 mb-2 text-xs text-amber-400 mono">
          <Clock className="w-3.5 h-3.5 animate-spin" />
          <span>Slow mode: wait {slowModeRemaining}s before sending</span>
        </div>
      )}

      {/* Emoji Palette Popover */}
      {showEmojiPicker && (
        <div className="absolute bottom-16 right-4 p-2 bg-[#1A1A1B] border border-white/10 rounded-xl shadow-lg grid grid-cols-6 gap-1 z-30">
          {emojis.map((e) => (
            <button
              key={e}
              onClick={() => addEmoji(e)}
              className="p-1.5 text-lg hover:bg-white/10 rounded-lg transition-transform hover:scale-120 cursor-pointer"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Input Row */}
      <div className="flex items-end gap-2 bg-[#1A1A1B] border border-[#333] rounded-xl p-1.5 focus-within:ring-1 focus-within:ring-amber-500/60 focus-within:border-amber-500/60 transition-all">
        {/* Attachment Button */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="p-2 text-slate-400 hover:text-slate-200 transition-colors shrink-0 rounded-lg hover:bg-white/5 cursor-pointer disabled:opacity-50"
          title="Attach file (max 10MB)"
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
          ) : (
            <Paperclip className="w-4 h-4" />
          )}
        </button>

        {/* Emoji Button */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="p-2 text-slate-400 hover:text-slate-200 transition-colors shrink-0 rounded-lg hover:bg-white/5 cursor-pointer"
          title="Emoji"
        >
          <Smile className="w-4 h-4" />
        </button>

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
          rows={1}
          className="flex-1 max-h-32 bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none resize-none py-2 px-1 leading-relaxed"
        />

        {/* Send Button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={(!content.trim() && !attachedFile) || isSending || slowModeRemaining > 0}
          className="p-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-white/10 disabled:text-slate-600 text-black font-bold rounded-lg transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed shadow-xs"
          title="Send"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
};
