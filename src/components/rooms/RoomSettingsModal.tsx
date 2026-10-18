import React, { useState } from 'react';
import {
  X,
  Shield,
  Trash2,
  Copy,
  Clock,
  KeyRound,
  FileText,
  MessageSquare,
  Pin,
  Lock,
} from 'lucide-react';
import { ChatRoom, RoomPermissions } from '../../types/index.ts';
import { apiFetch } from '../../api/client.ts';
import { useToast } from '../common/Toast.tsx';
import { useChat } from '../../context/ChatContext.tsx';

interface RoomSettingsModalProps {
  room: ChatRoom;
  isOpen: boolean;
  onClose: () => void;
}

export const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({ room, isOpen, onClose }) => {
  const { toast } = useToast();
  const { refreshRooms, refreshActiveChat, selectChat } = useChat();

  const isOwner = room.role === 'owner';

  // Room details state
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description);
  const [visibility, setVisibility] = useState(room.visibility);

  // 10 Permissions state
  const [perms, setPerms] = useState<RoomPermissions>(
    room.permissions || {
      joinPolicy: 'open',
      messageSendPolicy: 'all',
      invitePolicy: 'all',
      editRoomInfoPolicy: 'admins_only',
      pinMessagePolicy: 'admins_only',
      deleteMessagePolicy: 'admins_only',
      fileUploadEnabled: true,
      historyVisibleToNewMembers: true,
      slowModeSeconds: 0,
      threadRepliesEnabled: true,
    }
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleCopyInvite = () => {
    if (room.inviteCode) {
      navigator.clipboard.writeText(room.inviteCode);
      toast('Invite code copied to clipboard', 'info');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Update basic room info
      await apiFetch(`/rooms/${room.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, description, visibility }),
      });

      // 2. If owner, update the 10 permissions
      if (isOwner) {
        await apiFetch(`/rooms/${room.id}/permissions`, {
          method: 'PATCH',
          body: JSON.stringify(perms),
        });
      }

      toast('Room settings saved successfully.', 'success');
      await Promise.all([refreshRooms(), refreshActiveChat()]);
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to save room settings', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!window.confirm(`Are you sure you want to delete "${room.name}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await apiFetch(`/rooms/${room.id}`, { method: 'DELETE' });
      toast('Room deleted.', 'info');
      await refreshRooms();
      selectChat(null, null);
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to delete room', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Room Settings &amp; Permissions
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {room.name} ({room.roomId})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Invite Code Bar (if available) */}
          {room.inviteCode && (
            <div className="p-3 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                  Private Invite Code
                </span>
                <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {room.inviteCode}
                </span>
              </div>
              <button
                onClick={handleCopyInvite}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </button>
            </div>
          )}

          {/* Section 1: Room Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              General Info
            </h4>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Room Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs resize-none"
              />
            </div>
          </div>

          {/* Section 2: Configurable 10 Permissions (Owner Only) */}
          {isOwner && (
            <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Configurable Room Permissions
              </h4>

              {/* 1. Join Policy */}
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">1. Who can join</p>
                  <p className="text-[11px] text-slate-500">Controls entry criteria for new members</p>
                </div>
                <select
                  value={perms.joinPolicy}
                  onChange={(e) => setPerms({ ...perms, joinPolicy: e.target.value as any })}
                  className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                >
                  <option value="open">Anyone (Open)</option>
                  <option value="approval_required">Approval Required</option>
                  <option value="invite_only">Invitation Only</option>
                </select>
              </div>

              {/* 2. Message Send Policy */}
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">2. Who can send messages</p>
                  <p className="text-[11px] text-slate-500">Announcement mode restricts posting to admins/owner</p>
                </div>
                <select
                  value={perms.messageSendPolicy}
                  onChange={(e) => setPerms({ ...perms, messageSendPolicy: e.target.value as any })}
                  className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                >
                  <option value="all">All Members</option>
                  <option value="admins_only">Admins &amp; Owner Only</option>
                </select>
              </div>

              {/* 3. Invite Policy */}
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">3. Who can invite new members</p>
                  <p className="text-[11px] text-slate-500">Controls who can share invite codes or invite users</p>
                </div>
                <select
                  value={perms.invitePolicy}
                  onChange={(e) => setPerms({ ...perms, invitePolicy: e.target.value as any })}
                  className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                >
                  <option value="all">All Members</option>
                  <option value="admins_only">Admins &amp; Owner Only</option>
                </select>
              </div>

              {/* 4. Edit Room Info Policy */}
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">4. Who can edit room details</p>
                  <p className="text-[11px] text-slate-500">Change room title, description, and visibility</p>
                </div>
                <select
                  value={perms.editRoomInfoPolicy}
                  onChange={(e) => setPerms({ ...perms, editRoomInfoPolicy: e.target.value as any })}
                  className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                >
                  <option value="admins_only">Admins &amp; Owner</option>
                  <option value="owner_only">Owner Only</option>
                </select>
              </div>

              {/* 5. Pin Message Policy */}
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">5. Who can pin messages</p>
                  <p className="text-[11px] text-slate-500">Pin important messages to the room banner</p>
                </div>
                <select
                  value={perms.pinMessagePolicy}
                  onChange={(e) => setPerms({ ...perms, pinMessagePolicy: e.target.value as any })}
                  className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                >
                  <option value="all">All Members</option>
                  <option value="admins_only">Admins &amp; Owner Only</option>
                </select>
              </div>

              {/* 6. Delete/Moderate Message Policy */}
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">6. Who can moderate messages</p>
                  <p className="text-[11px] text-slate-500">Remove inappropriate content from other users</p>
                </div>
                <select
                  value={perms.deleteMessagePolicy}
                  onChange={(e) => setPerms({ ...perms, deleteMessagePolicy: e.target.value as any })}
                  className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                >
                  <option value="admins_only">Admins &amp; Owner</option>
                  <option value="owner_only">Owner Only</option>
                </select>
              </div>

              {/* 7. File Upload Policy */}
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">7. Allow file &amp; image sharing</p>
                  <p className="text-[11px] text-slate-500">Enable members to upload file attachments</p>
                </div>
                <input
                  type="checkbox"
                  checked={perms.fileUploadEnabled}
                  onChange={(e) => setPerms({ ...perms, fileUploadEnabled: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
              </div>

              {/* 8. History Visibility */}
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">8. Past history visible to new members</p>
                  <p className="text-[11px] text-slate-500">Allow newcomers to read earlier messages</p>
                </div>
                <input
                  type="checkbox"
                  checked={perms.historyVisibleToNewMembers}
                  onChange={(e) => setPerms({ ...perms, historyVisibleToNewMembers: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
              </div>

              {/* 9. Slow Mode */}
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">9. Slow mode cooldown</p>
                  <p className="text-[11px] text-slate-500">Prevent message spamming between posts</p>
                </div>
                <select
                  value={perms.slowModeSeconds}
                  onChange={(e) => setPerms({ ...perms, slowModeSeconds: parseInt(e.target.value, 10) })}
                  className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                >
                  <option value={0}>Off</option>
                  <option value={5}>5 seconds</option>
                  <option value={15}>15 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={60}>60 seconds</option>
                </select>
              </div>

              {/* 10. Thread Replies */}
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">10. Allow thread replies</p>
                  <p className="text-[11px] text-slate-500">Enable direct quoting and message replies</p>
                </div>
                <input
                  type="checkbox"
                  checked={perms.threadRepliesEnabled}
                  onChange={(e) => setPerms({ ...perms, threadRepliesEnabled: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Danger Zone: Delete Room (Owner only) */}
          {isOwner && (
            <div className="pt-4 border-t border-red-100 dark:border-red-950/40">
              <div className="p-3 border border-red-200 dark:border-red-900/50 rounded-xl bg-red-50/50 dark:bg-red-950/20 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                    Delete this room
                  </p>
                  <p className="text-[11px] text-red-600/80 dark:text-red-400/80">
                    Permanently delete the room, members, and message records.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteRoom}
                  disabled={isDeleting}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Room'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium transition-colors cursor-pointer shadow-xs"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};
