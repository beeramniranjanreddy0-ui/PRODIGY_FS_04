import React, { useState, useEffect } from 'react';
import { X, Copy, Shield, User, Check, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { useToast } from '../common/Toast.tsx';
import { apiFetch } from '../../api/client.ts';
import { UserStatus } from '../../types/index.ts';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, updateProfile } = useAuth();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [statusMessage, setStatusMessage] = useState(user?.statusMessage || '');
  const [status, setStatus] = useState<UserStatus>(user?.status || 'online');
  const [isSaving, setIsSaving] = useState(false);

  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [isLoadingBlocked, setIsLoadingBlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'blocked'>('profile');

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setBio(user.bio || '');
      setStatusMessage(user.statusMessage || '');
      setStatus(user.status);
    }
  }, [user]);

  const fetchBlocked = async () => {
    setIsLoadingBlocked(true);
    try {
      const res = await apiFetch('/users/blocked');
      setBlockedUsers(res.blocked || []);
    } catch {
      // ignore
    } finally {
      setIsLoadingBlocked(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'blocked') {
      fetchBlocked();
    }
  }, [isOpen, activeTab]);

  if (!isOpen || !user) return null;

  const handleCopyUserId = () => {
    navigator.clipboard.writeText(user.userId);
    toast('Public User ID copied to clipboard', 'info');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    setIsSaving(true);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        statusMessage: statusMessage.trim(),
        status,
      });
      toast('Profile updated successfully', 'success');
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to update profile', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnblock = async (targetUserId: string) => {
    try {
      await apiFetch('/users/unblock', {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      });
      toast('User unblocked', 'info');
      setBlockedUsers((prev) => prev.filter((u) => u.id !== targetUserId));
    } catch (err: any) {
      toast(err.message || 'Failed to unblock user', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none">
      <div className="w-full max-w-md bg-[#141416] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-[#EDEDED]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Account &amp; Profile
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Manage your personal identity and privacy settings.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 px-4">
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'profile'
                ? 'border-amber-500 text-amber-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab('blocked')}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'blocked'
                ? 'border-amber-500 text-amber-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Blocked Users
          </button>
        </div>

        {/* Content */}
        {activeTab === 'profile' ? (
          <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Public User ID Banner */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between">
              <div>
                <span className="mono text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                  Your Public User ID
                </span>
                <span className="mono text-xs font-bold text-white">
                  {user.userId}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyUserId}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </button>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Display Name *
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 bg-[#1A1A1B] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/60"
              />
            </div>

            {/* Status Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Presence Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as UserStatus)}
                className="w-full px-3 py-2 bg-[#1A1A1B] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/60"
              >
                <option value="online">Online</option>
                <option value="away">Away</option>
                <option value="offline">Invisible / Offline</option>
              </select>
            </div>

            {/* Status Message */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Status Message
              </label>
              <input
                type="text"
                value={statusMessage}
                onChange={(e) => setStatusMessage(e.target.value)}
                placeholder="e.g. In meetings today"
                className="w-full px-3 py-2 bg-[#1A1A1B] border border-[#333] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
              />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell others a bit about what you do..."
                rows={3}
                className="w-full px-3 py-2 bg-[#1A1A1B] border border-[#333] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 resize-none"
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !displayName.trim()}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-white/10 text-black rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer shadow-sm"
              >
                {isSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        ) : (
          /* Blocked Users Tab */
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoadingBlocked ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
              </div>
            ) : blockedUsers.length > 0 ? (
              blockedUsers.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between p-3 border border-white/10 rounded-xl bg-[#0D0D0E]"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar name={b.display_name} avatarUrl={b.avatar_url} size="sm" />
                    <div>
                      <p className="text-xs font-semibold text-white">
                        {b.display_name}
                      </p>
                      <span className="mono text-[10px] text-slate-400">
                        {b.user_id}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnblock(b.id)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors cursor-pointer"
                  >
                    Unblock
                  </button>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-xs text-slate-500 mono">
                You have not blocked any users
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
