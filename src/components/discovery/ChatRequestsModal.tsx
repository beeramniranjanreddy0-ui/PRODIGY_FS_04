import React, { useState, useEffect } from 'react';
import { X, Check, CheckCheck, Clock, UserCheck, UserX, Loader2 } from 'lucide-react';
import { apiFetch } from '../../api/client.ts';
import { Avatar } from '../common/Avatar.tsx';
import { useToast } from '../common/Toast.tsx';
import { useChat } from '../../context/ChatContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';

interface ChatRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatRequestsModal: React.FC<ChatRequestsModalProps> = ({ isOpen, onClose }) => {
  const { toast } = useToast();
  const { selectChat, refreshConversations } = useChat();
  const { refreshUser } = useAuth();

  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [incoming, setIncoming] = useState<any[]>([]);
  const [outgoing, setOutgoing] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/requests');
      setIncoming(res.incoming || []);
      setOutgoing(res.outgoing || []);
    } catch (err: any) {
      toast(err.message || 'Failed to fetch requests', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRequests();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAccept = async (requestId: string) => {
    setActioningId(requestId);
    try {
      const res = await apiFetch(`/requests/${requestId}/accept`, {
        method: 'POST',
      });
      toast('Chat request accepted! Conversation opened.', 'success');
      await Promise.all([refreshConversations(), refreshUser()]);
      setIncoming((prev) => prev.filter((r) => r.id !== requestId));
      selectChat('conversation', res.conversationId);
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to accept request', 'error');
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setActioningId(requestId);
    try {
      await apiFetch(`/requests/${requestId}/reject`, {
        method: 'POST',
      });
      toast('Chat request rejected', 'info');
      setIncoming((prev) => prev.filter((r) => r.id !== requestId));
      refreshUser();
    } catch (err: any) {
      toast(err.message || 'Failed to reject request', 'error');
    } finally {
      setActioningId(null);
    }
  };

  const handleCancel = async (requestId: string) => {
    setActioningId(requestId);
    try {
      await apiFetch(`/requests/${requestId}/cancel`, {
        method: 'POST',
      });
      toast('Outgoing request cancelled', 'info');
      setOutgoing((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err: any) {
      toast(err.message || 'Failed to cancel request', 'error');
    } finally {
      setActioningId(null);
    }
  };

  const pendingIncoming = incoming.filter((r) => r.status === 'pending');
  const pendingOutgoing = outgoing.filter((r) => r.status === 'pending');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#121214] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-[#EDEDED]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-[#0D0D0E]/80 border-b border-white/10">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span>Chat Requests</span>
              <span className="mono text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                PERMISSIONS
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Manage incoming and outgoing direct message permissions.
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
        <div className="flex border-b border-white/10 px-4 bg-[#0D0D0E]/40">
          <button
            onClick={() => setTab('incoming')}
            className={`py-3 px-4 text-xs font-mono tracking-wider transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
              tab === 'incoming'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5 font-medium'
            }`}
          >
            <span>INCOMING</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                tab === 'incoming' ? 'bg-amber-500 text-black font-bold' : 'bg-white/10 text-slate-400'
              }`}
            >
              {pendingIncoming.length}
            </span>
          </button>
          <button
            onClick={() => setTab('outgoing')}
            className={`py-3 px-4 text-xs font-mono tracking-wider transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
              tab === 'outgoing'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5 font-medium'
            }`}
          >
            <span>OUTGOING</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                tab === 'outgoing' ? 'bg-amber-500 text-black font-bold' : 'bg-white/10 text-slate-400'
              }`}
            >
              {pendingOutgoing.length}
            </span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0D0D0E]/20">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
            </div>
          ) : tab === 'incoming' ? (
            pendingIncoming.length > 0 ? (
              pendingIncoming.map((req) => (
                <div
                  key={req.id}
                  className="p-3.5 border border-white/10 bg-[#1A1A1C] hover:border-amber-500/30 rounded-xl flex flex-col gap-2.5 transition-all shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        name={req.sender.displayName}
                        avatarUrl={req.sender.avatarUrl}
                        status={req.sender.status}
                        size="md"
                        showStatus={true}
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-xs text-white">
                            {req.sender.displayName}
                          </span>
                          <span className="mono text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                            {req.sender.userId}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 mono">
                          {new Date(req.createdAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleReject(req.id)}
                        disabled={actioningId === req.id}
                        className="px-3 py-1.5 text-xs font-mono text-slate-300 hover:text-red-400 border border-white/10 hover:border-red-500/30 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleAccept(req.id)}
                        disabled={actioningId === req.id}
                        className="px-3.5 py-1.5 text-xs font-semibold text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer shadow-xs active:scale-95"
                      >
                        {actioningId === req.id ? 'Accepting...' : 'Accept'}
                      </button>
                    </div>
                  </div>

                  {req.message && (
                    <div className="p-2.5 bg-[#0D0D0E] border border-white/10 rounded-lg text-xs text-slate-300 font-mono italic">
                      "{req.message}"
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-xs text-slate-500 mono tracking-widest uppercase">
                No incoming chat requests
              </div>
            )
          ) : pendingOutgoing.length > 0 ? (
            pendingOutgoing.map((req) => (
              <div
                key={req.id}
                className="p-3.5 border border-white/10 bg-[#1A1A1C] rounded-xl flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar
                    name={req.recipient.displayName}
                    avatarUrl={req.recipient.avatarUrl}
                    status={req.recipient.status}
                    size="md"
                    showStatus={true}
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-white">
                        {req.recipient.displayName}
                      </span>
                      <span className="mono text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                        {req.recipient.userId}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 mono">
                      Pending since {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleCancel(req.id)}
                  disabled={actioningId === req.id}
                  className="px-3 py-1.5 text-xs font-mono text-slate-400 hover:text-red-400 border border-white/10 hover:border-red-500/30 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-xs text-slate-500 mono tracking-widest uppercase">
              No pending outgoing requests
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
