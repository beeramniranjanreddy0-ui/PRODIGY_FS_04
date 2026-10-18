import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Lock,
  Globe,
  KeyRound,
  ShieldCheck,
  Crown,
  VolumeX,
  Compass,
  Clock,
  UserPlus,
  Loader2,
} from 'lucide-react';
import { useChat } from '../../context/ChatContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { Avatar } from '../common/Avatar.tsx';
import { apiFetch } from '../../api/client.ts';
import { useToast } from '../common/Toast.tsx';

interface ChatListProps {
  currentTab: 'chats' | 'rooms';
  onSelectTab: (tab: 'chats' | 'rooms') => void;
  onOpenNewChat: () => void;
  onOpenCreateRoom: () => void;
  onOpenJoinRoom: () => void;
  onSelectConversationOnMobile?: () => void;
}

export const ChatList: React.FC<ChatListProps> = ({
  currentTab,
  onSelectTab,
  onOpenNewChat,
  onOpenCreateRoom,
  onOpenJoinRoom,
  onSelectConversationOnMobile,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    conversations,
    rooms,
    activeType,
    activeId,
    selectChat,
    refreshRooms,
    userPresence,
  } = useChat();

  const [searchQuery, setSearchQuery] = useState('');
  const [roomSubTab, setRoomSubTab] = useState<'joined' | 'explore'>('joined');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchingRooms, setIsSearchingRooms] = useState(false);

  useEffect(() => {
    if (currentTab === 'rooms' && searchQuery.trim()) {
      const timer = setTimeout(async () => {
        setIsSearchingRooms(true);
        try {
          const res = await apiFetch(`/rooms/search?q=${encodeURIComponent(searchQuery.trim())}`);
          setSearchResults(res.rooms || []);
        } catch (err) {
          console.error('Room search error:', err);
        } finally {
          setIsSearchingRooms(false);
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [currentTab, searchQuery]);

  const handleRequestJoin = async (roomItem: any) => {
    try {
      const res = await apiFetch('/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ identifier: roomItem.roomId }),
      });
      if (res.status === 'pending_approval') {
        toast('Join request submitted to room administrators.', 'info');
        setSearchResults((prev) =>
          prev.map((item) => (item.id === roomItem.id ? { ...item, hasPendingRequest: true } : item))
        );
      } else {
        toast('Joined room successfully!', 'success');
        await refreshRooms();
        selectChat('room', res.roomId || roomItem.id);
      }
    } catch (err: any) {
      toast(err.message || 'Failed to join room', 'error');
    }
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = c.participant?.displayName?.toLowerCase() || '';
    const uid = c.participant?.userId?.toLowerCase() || '';
    const lastContent = c.lastMessage?.content?.toLowerCase() || '';
    return name.includes(q) || uid.includes(q) || lastContent.includes(q);
  });

  const filteredJoinedRooms = rooms.joined.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.roomId.toLowerCase().includes(q);
  });

  const filteredExploreRooms = rooms.explore.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.roomId.toLowerCase().includes(q);
  });

  const formatTimestamp = (isoDate: string) => {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="w-full md:w-80 lg:w-88 shrink-0 bg-[#0D0D0E] border-r border-white/10 flex flex-col h-full select-none">
      {/* Header & Search */}
      <div className="p-4 border-b border-white/10 flex flex-col gap-3">
        {/* Tab switchers: Direct vs Rooms */}
        <div className="flex items-center p-1 bg-[#1A1A1B] border border-white/10 rounded-lg text-xs font-medium">
          <button
            onClick={() => onSelectTab('chats')}
            className={`flex-1 py-1.5 text-center rounded-md transition-all cursor-pointer ${
              currentTab === 'chats'
                ? 'bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Direct ({conversations.length})
          </button>
          <button
            onClick={() => onSelectTab('rooms')}
            className={`flex-1 py-1.5 text-center rounded-md transition-all cursor-pointer ${
              currentTab === 'rooms'
                ? 'bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Rooms ({rooms.joined.length})
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={currentTab === 'chats' ? 'Search chats...' : 'Search rooms...'}
            className="w-full pl-9 pr-3 py-2 bg-[#1A1A1B] border border-[#333] rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60 transition-colors"
          />
        </div>

        {/* Action Button Bar */}
        <div className="flex items-center gap-2">
          {currentTab === 'rooms' ? (
            <>
              <button
                onClick={onOpenCreateRoom}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg transition-all shadow-md cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>+ Create Room</span>
              </button>
              <button
                onClick={onOpenJoinRoom}
                className="py-2 px-3 bg-[#1A1A1B] hover:bg-white/10 text-slate-300 border border-white/10 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                title="Join room using Room ID or Invite Code"
              >
                Join
              </button>
            </>
          ) : (
            <button
              onClick={onOpenNewChat}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg transition-all shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>+ New Chat</span>
            </button>
          )}
        </div>

        {/* Rooms Sub-tabs */}
        {currentTab === 'rooms' && (
          <div className="flex items-center gap-2 pt-1 border-t border-white/10 text-xs">
            <button
              onClick={() => setRoomSubTab('joined')}
              className={`pb-0.5 border-b-2 font-medium transition-colors cursor-pointer ${
                roomSubTab === 'joined'
                  ? 'border-amber-500 text-amber-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              My Rooms ({rooms.joined.length})
            </button>
            <button
              onClick={() => setRoomSubTab('explore')}
              className={`pb-0.5 border-b-2 font-medium transition-colors cursor-pointer ${
                roomSubTab === 'explore'
                  ? 'border-amber-500 text-amber-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Explore ({rooms.explore.length})
            </button>
          </div>
        )}
      </div>

      {/* List Container */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/5 p-2">
        {currentTab === 'chats' ? (
          /* Direct Conversations List */
          filteredConversations.length > 0 ? (
            filteredConversations.map((c) => {
              const isSelected = activeType === 'conversation' && activeId === c.id;
              const participantStatus = c.participant ? (userPresence[c.participant.id]?.status || c.participant.status) : 'offline';

              return (
                <button
                  key={c.id}
                  onClick={() => {
                    selectChat('conversation', c.id);
                    onSelectConversationOnMobile?.();
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/10 border-l-2 border-amber-500 text-slate-100'
                      : 'hover:bg-white/5 text-slate-300'
                  }`}
                >
                  <Avatar
                    name={c.participant?.displayName || 'Chat'}
                    avatarUrl={c.participant?.avatarUrl}
                    status={participantStatus}
                    size="md"
                    showStatus={true}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-medium text-xs text-[#EDEDED] truncate">
                        {c.participant?.displayName || 'Unknown User'}
                      </span>
                      <span className="text-[10px] text-slate-400 mono shrink-0 ml-1">
                        {formatTimestamp(c.lastMessage?.createdAt || c.updatedAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <p className="text-slate-400 truncate text-[11px] max-w-[170px]">
                        {c.lastMessage ? (
                          c.lastMessage.senderId === user?.id ? (
                            <span>You: {c.lastMessage.content}</span>
                          ) : (
                            c.lastMessage.content
                          )
                        ) : (
                          <span className="italic text-slate-500">No messages yet</span>
                        )}
                      </p>

                      <div className="flex items-center gap-1 shrink-0">
                        {c.isMuted && <VolumeX className="w-3 h-3 text-slate-500" />}
                        {c.unreadCount > 0 && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-black rounded-full min-w-4 text-center">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="py-16 px-4 text-center flex flex-col items-center justify-center">
              <p className="mono text-[0.6rem] text-slate-500 tracking-widest uppercase mb-4 opacity-70">
                {searchQuery ? 'No matching conversations' : 'No conversations'}
              </p>
              <button
                onClick={onOpenNewChat}
                className="btn-cta"
              >
                + Find User
              </button>
            </div>
          )
        ) : (
          /* Rooms List */
          searchQuery.trim() ? (
            /* Search Results Mode */
            isSearchingRooms ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.map((r) => {
                const isSelected = activeType === 'room' && activeId === r.id;
                return (
                  <div
                    key={r.id}
                    className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                      isSelected
                        ? 'bg-amber-500/10 border-l-2 border-amber-500 text-slate-100'
                        : 'hover:bg-white/5 text-slate-300'
                    }`}
                  >
                    <div
                      onClick={() => {
                        if (r.isMember) {
                          selectChat('room', r.id);
                          onSelectConversationOnMobile?.();
                        }
                      }}
                      className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer pr-2"
                    >
                      <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 font-semibold shrink-0">
                        {r.visibility === 'public' && <Globe className="w-4 h-4 text-slate-400" />}
                        {r.visibility === 'private' && <Lock className="w-4 h-4 text-amber-500" />}
                        {r.visibility === 'invite_only' && <KeyRound className="w-4 h-4 text-amber-400" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-medium text-xs text-[#EDEDED] truncate">
                            {r.name}
                          </span>
                          <span className="text-[10px] mono text-amber-400 shrink-0 font-medium">
                            {r.roomId}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">
                          {r.description || `${r.visibility} group room`}
                        </p>
                        <span className="text-[10px] text-slate-500 mono">
                          {r.memberCount} members
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 ml-2">
                      {r.isMember ? (
                        <button
                          onClick={() => {
                            selectChat('room', r.id);
                            onSelectConversationOnMobile?.();
                          }}
                          className="px-3 py-1 text-xs font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg transition-colors cursor-pointer"
                        >
                          Chat
                        </button>
                      ) : r.hasPendingRequest ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                          <Clock className="w-3 h-3" />
                          <span>Pending</span>
                        </span>
                      ) : r.joinPolicy === 'open' || r.visibility === 'public' ? (
                        <button
                          onClick={() => handleRequestJoin(r)}
                          className="px-3 py-1 text-xs font-semibold text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer"
                        >
                          Join
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRequestJoin(r)}
                          className="px-2.5 py-1 text-xs font-semibold text-black bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer"
                          title="Submit a request to join this room"
                        >
                          Ask to Join
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-16 px-4 text-center">
                <p className="mono text-[0.65rem] text-slate-500 tracking-widest uppercase mb-2">
                  No rooms found matching "{searchQuery}"
                </p>
                <p className="text-xs text-slate-400">
                  Search by exact Room ID (e.g. ROOM-1010) or room name.
                </p>
              </div>
            )
          ) : (
            /* Joined / Explore Subtabs when no search query */
            roomSubTab === 'joined' ? (
            filteredJoinedRooms.length > 0 ? (
              filteredJoinedRooms.map((r) => {
                const isSelected = activeType === 'room' && activeId === r.id;

                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      selectChat('room', r.id);
                      onSelectConversationOnMobile?.();
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/10 border-l-2 border-amber-500 text-slate-100'
                        : 'hover:bg-white/5 text-slate-300'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 font-semibold shrink-0">
                      {r.visibility === 'public' && <Globe className="w-5 h-5 text-slate-400" />}
                      {r.visibility === 'private' && <Lock className="w-5 h-5 text-amber-500" />}
                      {r.visibility === 'invite_only' && <KeyRound className="w-5 h-5 text-amber-400" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-medium text-xs text-[#EDEDED] truncate">
                          {r.name}
                        </span>
                        <span className="text-[10px] text-slate-400 mono shrink-0 ml-1">
                          {r.roomId}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[11px] text-slate-400">
                          {r.memberCount} {r.memberCount === 1 ? 'member' : 'members'}
                        </span>

                        {r.role && (
                          <span className="flex items-center gap-0.5 text-[10px] font-medium text-slate-400 mono">
                            {r.role === 'owner' && <Crown className="w-3 h-3 text-amber-500" />}
                            {r.role === 'admin' && <ShieldCheck className="w-3 h-3 text-amber-400" />}
                            <span className="capitalize">{r.role}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="py-16 px-4 text-center flex flex-col items-center justify-center">
                <p className="mono text-[0.6rem] text-slate-500 tracking-widest uppercase mb-4 opacity-70">
                  {searchQuery ? 'No matching rooms' : 'No rooms joined'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRoomSubTab('explore')}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md transition-colors cursor-pointer uppercase tracking-wider"
                  >
                    Explore
                  </button>
                  <button
                    onClick={onOpenCreateRoom}
                    className="btn-cta"
                  >
                    + Create
                  </button>
                </div>
              </div>
            )
          ) : (
            /* Explore Public Rooms */
            filteredExploreRooms.length > 0 ? (
              filteredExploreRooms.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-medium text-xs text-[#EDEDED] truncate">
                        {r.name}
                      </span>
                      <span className="text-[10px] mono text-slate-500">
                        {r.roomId}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate max-w-44">
                      {r.description || 'Public community room'}
                    </p>
                    <span className="text-[10px] text-slate-500 mono">
                      {r.memberCount} members
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      selectChat('room', r.id);
                      onSelectConversationOnMobile?.();
                    }}
                    className="btn-cta"
                  >
                    View
                  </button>
                </div>
              ))
            ) : (
              <div className="py-16 px-4 text-center">
                <Compass className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-50" />
                <p className="mono text-[0.6rem] text-slate-500 tracking-widest uppercase opacity-70">
                  No public rooms to explore
                </p>
              </div>
            )
          )
        )
      )}
      </div>
    </div>
  );
};
