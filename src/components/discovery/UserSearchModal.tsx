import React, { useState } from 'react';
import { Search, X, UserPlus, Check, Clock, MessageSquare, Loader2 } from 'lucide-react';
import { apiFetch } from '../../api/client.ts';
import { Avatar } from '../common/Avatar.tsx';
import { useToast } from '../common/Toast.tsx';
import { useChat } from '../../context/ChatContext.tsx';

interface UserSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserSearchModal: React.FC<UserSearchModalProps> = ({ isOpen, onClose }) => {
  const { toast } = useToast();
  const { selectChat, refreshConversations } = useChat();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [isSending, setIsSending] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setSelectedUser(null);
    try {
      const res = await apiFetch(`/users/search?q=${encodeURIComponent(query.trim())}`);
      setResults(res.users || []);
      if ((res.users || []).length === 0) {
        toast('No users found matching that User ID or name.', 'info');
      }
    } catch (err: any) {
      toast(err.message || 'Search failed', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = async () => {
    if (!selectedUser || isSending) return;

    setIsSending(true);
    try {
      const res = await apiFetch('/requests', {
        method: 'POST',
        body: JSON.stringify({
          targetUserId: selectedUser.id,
          message: requestMessage.trim(),
        }),
      });

      if (res.status === 'accepted') {
        toast('Mutual connection established! Conversation opened.', 'success');
        refreshConversations();
        selectChat('conversation', res.conversationId);
        onClose();
      } else {
        toast('Chat request sent successfully.', 'success');
        // Update user state in results
        setResults((prev) =>
          prev.map((u) => (u.id === selectedUser.id ? { ...u, relationship: 'pending_sent' } : u))
        );
        setSelectedUser(null);
        setRequestMessage('');
      }
    } catch (err: any) {
      toast(err.message || 'Failed to send chat request', 'error');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none">
      <div className="w-full max-w-md bg-[#141416] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-[#EDEDED]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Find People by User ID
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Enter their unique public User ID (e.g. USR-1042) or username.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="p-4 border-b border-white/10 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. USR-1042 or Sarah"
              autoFocus
              className="w-full pl-9 pr-3 py-2 bg-[#1A1A1B] border border-[#333] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 mono"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-white/10 disabled:text-slate-500 text-black font-semibold rounded-xl text-xs transition-colors cursor-pointer shrink-0"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
          </button>
        </form>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {results.length > 0 ? (
            results.map((u) => (
              <div
                key={u.id}
                className="p-3 border border-white/10 rounded-xl bg-[#0D0D0E] hover:border-white/20 transition-colors flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Avatar
                      name={u.displayName}
                      avatarUrl={u.avatarUrl}
                      status={u.status}
                      size="md"
                      showStatus={true}
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-white">
                          {u.displayName}
                        </span>
                        <span className="mono text-[10px] text-amber-400 font-medium">
                          {u.userId}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        @{u.username}
                      </p>
                    </div>
                  </div>

                  {/* Relationship action */}
                  {u.relationship === 'connected' ? (
                    <button
                      onClick={() => {
                        selectChat('conversation', u.conversationId);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Chat</span>
                    </button>
                  ) : u.relationship === 'pending_sent' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Request Sent</span>
                    </span>
                  ) : u.relationship === 'pending_received' ? (
                    <span className="text-[11px] text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg font-medium">
                      Requested you
                    </span>
                  ) : (
                    <button
                      onClick={() => setSelectedUser(selectedUser?.id === u.id ? null : u)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Request</span>
                    </button>
                  )}
                </div>

                {u.bio && (
                  <p className="text-xs text-slate-400 line-clamp-2 pl-1">
                    {u.bio}
                  </p>
                )}

                {/* Inline Message Composer if Selected */}
                {selectedUser?.id === u.id && (
                  <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
                    <input
                      type="text"
                      value={requestMessage}
                      onChange={(e) => setRequestMessage(e.target.value)}
                      placeholder="Add an optional message (e.g. Hi! Would love to chat)..."
                      className="w-full px-3 py-1.5 bg-[#1A1A1B] border border-[#333] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setSelectedUser(null)}
                        className="px-2.5 py-1 text-xs text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSendRequest}
                        disabled={isSending}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        {isSending ? 'Sending...' : 'Send Request'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-xs text-slate-500 mono">
              {query ? 'No results found' : 'Type a User ID (e.g. USR-1042) to discover contacts'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
