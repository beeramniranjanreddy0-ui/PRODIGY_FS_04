import React, { useState } from 'react';
import { X, KeyRound, Hash, Loader2 } from 'lucide-react';
import { apiFetch } from '../../api/client.ts';
import { useToast } from '../common/Toast.tsx';
import { useChat } from '../../context/ChatContext.tsx';

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({ isOpen, onClose }) => {
  const { toast } = useToast();
  const { refreshRooms, selectChat } = useChat();

  const [identifier, setIdentifier] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() && !inviteCode.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await apiFetch('/rooms/join', {
        method: 'POST',
        body: JSON.stringify({
          identifier: identifier.trim() || undefined,
          inviteCode: inviteCode.trim() || undefined,
        }),
      });

      if (res.status === 'pending_approval') {
        toast('Join request submitted to room administrators.', 'info');
      } else {
        toast('Joined room successfully!', 'success');
        await refreshRooms();
        selectChat('room', res.roomId);
      }
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to join room', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none">
      <div className="w-full max-w-md bg-[#141416] border border-white/10 rounded-2xl shadow-2xl overflow-hidden text-[#EDEDED]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Join Group Room
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Enter a Room ID (e.g. ROOM-1010) or private invitation code.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleJoin} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Room ID
            </label>
            <div className="relative">
              <Hash className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. ROOM-1010"
                className="w-full pl-9 pr-3 py-2 bg-[#1A1A1B] border border-[#333] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 mono"
              />
            </div>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-white/10 w-full" />
            <span className="bg-[#141416] px-3 text-[10px] text-slate-500 uppercase tracking-wider shrink-0 mono">
              OR
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Private Invite Code
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="e.g. eng2026x"
                className="w-full pl-9 pr-3 py-2 bg-[#1A1A1B] border border-[#333] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 mono"
              />
            </div>
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
              disabled={isSubmitting || (!identifier.trim() && !inviteCode.trim())}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-white/10 text-black rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer shadow-sm"
            >
              {isSubmitting ? 'Joining...' : 'Join Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
