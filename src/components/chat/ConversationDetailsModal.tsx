import React, { useState } from 'react';
import {
  X,
  VolumeX,
  Volume2,
  Archive,
  Ban,
  Flag,
  Copy,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { Conversation } from '../../types/index.ts';
import { apiFetch } from '../../api/client.ts';
import { useToast } from '../common/Toast.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { useChat } from '../../context/ChatContext.tsx';

interface ConversationDetailsModalProps {
  conversation: any;
  isOpen: boolean;
  onClose: () => void;
  onOpenReport: (user: any) => void;
}

export const ConversationDetailsModal: React.FC<ConversationDetailsModalProps> = ({
  conversation,
  isOpen,
  onClose,
  onOpenReport,
}) => {
  const { toast } = useToast();
  const { refreshConversations, selectChat, userPresence } = useChat();

  const [isMuted, setIsMuted] = useState(conversation.isMuted);
  const [isArchived, setIsArchived] = useState(conversation.isArchived);

  if (!isOpen || !conversation.participant) return null;

  const p = conversation.participant;
  const currentStatus = userPresence[p.id]?.status || p.status;

  const handleCopyUserId = () => {
    navigator.clipboard.writeText(p.userId);
    toast('User ID copied to clipboard', 'info');
  };

  const handleToggleMute = async () => {
    try {
      const next = !isMuted;
      await apiFetch(`/conversations/${conversation.id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ isMuted: next }),
      });
      setIsMuted(next);
      toast(next ? 'Conversation muted' : 'Conversation unmuted', 'info');
      refreshConversations();
    } catch {
      toast('Failed to update settings', 'error');
    }
  };

  const handleToggleArchive = async () => {
    try {
      const next = !isArchived;
      await apiFetch(`/conversations/${conversation.id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ isArchived: next }),
      });
      setIsArchived(next);
      toast(next ? 'Conversation archived' : 'Conversation unarchived', 'info');
      refreshConversations();
    } catch {
      toast('Failed to update settings', 'error');
    }
  };

  const handleBlockUser = async () => {
    if (!window.confirm(`Are you sure you want to block ${p.displayName}? They will no longer be able to message you.`)) {
      return;
    }

    try {
      await apiFetch('/users/block', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: p.id }),
      });
      toast(`${p.displayName} blocked`, 'info');
      await refreshConversations();
      selectChat(null, null);
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to block user', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Conversation Details
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Profile Details */}
        <div className="p-5 flex flex-col items-center text-center border-b border-slate-100 dark:border-slate-800">
          <Avatar
            name={p.displayName}
            avatarUrl={p.avatarUrl}
            status={currentStatus}
            size="lg"
            showStatus={true}
            className="mb-2.5"
          />
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {p.displayName}
          </h4>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-xs text-blue-600 dark:text-blue-400 font-medium">
              {p.userId}
            </span>
            <button
              onClick={handleCopyUserId}
              className="text-slate-400 hover:text-slate-600 p-0.5"
              title="Copy User ID"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>

          {p.statusMessage && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 italic">
              "{p.statusMessage}"
            </p>
          )}

          {p.bio && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              {p.bio}
            </p>
          )}
        </div>

        {/* Action Controls */}
        <div className="p-3 space-y-1">
          {/* Mute */}
          <button
            onClick={handleToggleMute}
            className="w-full flex items-center justify-between p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl text-xs text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              {isMuted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-slate-400" />}
              <span>Mute Notifications</span>
            </div>
            <span className="text-[11px] font-medium text-slate-400">
              {isMuted ? 'Muted' : 'Off'}
            </span>
          </button>

          {/* Archive */}
          <button
            onClick={handleToggleArchive}
            className="w-full flex items-center justify-between p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl text-xs text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Archive className="w-4 h-4 text-slate-400" />
              <span>Archive Conversation</span>
            </div>
            <span className="text-[11px] font-medium text-slate-400">
              {isArchived ? 'Archived' : 'Active'}
            </span>
          </button>

          {/* Block User */}
          <button
            onClick={handleBlockUser}
            className="w-full flex items-center gap-2.5 p-2.5 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl text-xs text-red-600 dark:text-red-400 transition-colors cursor-pointer"
          >
            <Ban className="w-4 h-4" />
            <span>Block {p.displayName}</span>
          </button>

          {/* Report User */}
          <button
            onClick={() => {
              onClose();
              onOpenReport(p);
            }}
            className="w-full flex items-center gap-2.5 p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl text-xs text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
          >
            <Flag className="w-4 h-4" />
            <span>Report User</span>
          </button>
        </div>
      </div>
    </div>
  );
};
