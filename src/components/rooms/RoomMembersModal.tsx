import React, { useState, useEffect } from 'react';
import {
  X,
  Crown,
  ShieldCheck,
  UserX,
  UserMinus,
  Check,
  LogOut,
  ArrowRightLeft,
  Loader2,
  UserPlus,
} from 'lucide-react';
import { ChatRoom, RoomMember, RoomJoinRequest } from '../../types/index.ts';
import { apiFetch } from '../../api/client.ts';
import { useToast } from '../common/Toast.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { useChat } from '../../context/ChatContext.tsx';

interface RoomMembersModalProps {
  room: ChatRoom;
  isOpen: boolean;
  onClose: () => void;
}

export const RoomMembersModal: React.FC<RoomMembersModalProps> = ({ room, isOpen, onClose }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { refreshRooms, refreshActiveChat, selectChat } = useChat();

  const [activeTab, setActiveTab] = useState<'members' | 'requests'>('members');
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [joinRequests, setJoinRequests] = useState<RoomJoinRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const isOwner = room.role === 'owner';
  const isAdmin = room.role === 'admin';
  const canManage = isOwner || isAdmin;
  const canAddMember = isOwner || isAdmin || room.permissions?.invitePolicy === 'all';

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addQuery.trim() || isAdding) return;

    setIsAdding(true);
    try {
      const res = await apiFetch(`/rooms/${room.id}/add-member`, {
        method: 'POST',
        body: JSON.stringify({ targetUserId: addQuery.trim() }),
      });
      toast(res.message || 'Person added to room successfully!', 'success');
      setAddQuery('');
      setShowAddMember(false);
      fetchMembersAndRequests();
      refreshActiveChat();
    } catch (err: any) {
      toast(err.message || 'Failed to add member to room', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const fetchMembersAndRequests = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`/rooms/${room.id}/members`);
      setMembers(res.members || []);
      setJoinRequests(res.joinRequests || []);
    } catch (err: any) {
      toast(err.message || 'Failed to fetch room members', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMembersAndRequests();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRoleChange = async (memberId: string, newRole: 'admin' | 'member') => {
    try {
      await apiFetch(`/rooms/${room.id}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      toast(`Member role updated to ${newRole}`, 'success');
      fetchMembersAndRequests();
    } catch (err: any) {
      toast(err.message || 'Failed to update member role', 'error');
    }
  };

  const handleKick = async (memberId: string) => {
    try {
      await apiFetch(`/rooms/${room.id}/members/${memberId}/kick`, { method: 'POST' });
      toast('Member removed from room', 'info');
      fetchMembersAndRequests();
    } catch (err: any) {
      toast(err.message || 'Failed to kick member', 'error');
    }
  };

  const handleBan = async (memberId: string) => {
    try {
      await apiFetch(`/rooms/${room.id}/members/${memberId}/ban`, { method: 'POST' });
      toast('Member banned from room', 'info');
      fetchMembersAndRequests();
    } catch (err: any) {
      toast(err.message || 'Failed to ban member', 'error');
    }
  };

  const handleDecideRequest = async (requestId: string, decision: 'approve' | 'reject') => {
    try {
      await apiFetch(`/rooms/${room.id}/join-requests/${requestId}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      toast(`Join request ${decision}d.`, 'success');
      fetchMembersAndRequests();
      refreshActiveChat();
    } catch (err: any) {
      toast(err.message || 'Failed to process request', 'error');
    }
  };

  const handleTransferOwnership = async (newOwnerId: string) => {
    if (!window.confirm('Are you sure you want to transfer ownership of this room? You will become an admin.')) {
      return;
    }

    try {
      await apiFetch(`/rooms/${room.id}/transfer-ownership`, {
        method: 'POST',
        body: JSON.stringify({ newOwnerId }),
      });
      toast('Room ownership transferred successfully.', 'success');
      setTransferTarget(null);
      await Promise.all([refreshRooms(), refreshActiveChat()]);
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to transfer ownership', 'error');
    }
  };

  const handleLeaveRoom = async () => {
    if (isOwner) {
      toast('As room owner, you must transfer ownership or delete the room before leaving.', 'error');
      return;
    }

    if (!window.confirm('Are you sure you want to leave this room?')) return;

    try {
      await apiFetch(`/rooms/${room.id}/leave`, { method: 'POST' });
      toast('You left the room.', 'info');
      await refreshRooms();
      selectChat(null, null);
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to leave room', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Room Members &amp; Roles
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {room.name} ({room.roomId})
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canAddMember && (
              <button
                onClick={() => setShowAddMember(!showAddMember)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                <UserPlus className="w-3.5 h-3.5 text-black" />
                <span>+ Add Person</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Add Person Inline Form */}
        {showAddMember && (
          <form onSubmit={handleAddMember} className="p-3 bg-amber-500/10 border-b border-amber-500/20 flex gap-2 items-center">
            <input
              type="text"
              value={addQuery}
              onChange={(e) => setAddQuery(e.target.value)}
              placeholder="Enter User ID (e.g. USR-1042) or username..."
              autoFocus
              className="flex-1 px-3 py-1.5 bg-[#1A1A1B] border border-[#333] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 mono"
            />
            <button
              type="submit"
              disabled={isAdding || !addQuery.trim()}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-white/10 text-black font-semibold rounded-lg text-xs transition-colors cursor-pointer shrink-0"
            >
              {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddMember(false);
                setAddQuery('');
              }}
              className="p-1.5 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {/* Sub-tabs if Admin/Owner */}
        {canManage && (
          <div className="flex border-b border-slate-200 dark:border-slate-800 px-4">
            <button
              onClick={() => setActiveTab('members')}
              className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === 'members'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Members ({members.length})
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === 'requests'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Join Requests ({joinRequests.length})
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            </div>
          ) : activeTab === 'members' ? (
            members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar
                    name={m.displayName}
                    avatarUrl={m.avatarUrl}
                    status={m.status}
                    size="sm"
                    showStatus={true}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">
                        {m.displayName}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {m.userId}
                      </span>
                      {m.id === user?.id && (
                        <span className="text-[10px] text-blue-600 font-medium">(You)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {m.role === 'owner' && <Crown className="w-2.5 h-2.5 text-amber-500" />}
                        {m.role === 'admin' && <ShieldCheck className="w-2.5 h-2.5 text-blue-500" />}
                        {m.role}
                      </span>
                      {m.isBanned && (
                        <span className="text-[9px] font-semibold uppercase px-1.5 py-0.2 rounded bg-red-100 dark:bg-red-950 text-red-600">
                          Banned
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Role and Member Controls */}
                {canManage && m.id !== user?.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Owner can promote / demote */}
                    {isOwner && (
                      <>
                        {m.role === 'member' ? (
                          <button
                            onClick={() => handleRoleChange(m.id, 'admin')}
                            className="px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition-colors"
                            title="Promote to Admin"
                          >
                            Make Admin
                          </button>
                        ) : m.role === 'admin' ? (
                          <button
                            onClick={() => handleRoleChange(m.id, 'member')}
                            className="px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                            title="Demote to Member"
                          >
                            Remove Admin
                          </button>
                        ) : null}

                        {/* Transfer Ownership */}
                        <button
                          onClick={() => handleTransferOwnership(m.id)}
                          className="p-1 text-slate-400 hover:text-amber-600 rounded"
                          title="Transfer Room Ownership"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}

                    {/* Kick / Ban (Admins cannot kick admins) */}
                    {(isOwner || (isAdmin && m.role === 'member')) && (
                      <>
                        <button
                          onClick={() => handleKick(m.id)}
                          className="p-1 text-slate-400 hover:text-red-500 rounded"
                          title="Kick member"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                        {!m.isBanned && (
                          <button
                            onClick={() => handleBan(m.id)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                            title="Ban member"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            /* Join Requests Tab */
            joinRequests.length > 0 ? (
              joinRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar
                      name={req.display_name}
                      avatarUrl={req.avatar_url}
                      size="sm"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                          {req.display_name}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {req.public_user_id}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        Requested {new Date(req.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDecideRequest(req.id, 'reject')}
                      className="px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleDecideRequest(req.id, 'approve')}
                      className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                No pending join requests for this room
              </div>
            )
          )}
        </div>

        {/* Footer with Leave Button */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          {!isOwner && (
            <button
              onClick={handleLeaveRoom}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Leave Room</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-auto px-4 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium hover:bg-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
