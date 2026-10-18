import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Conversation, ChatRoom, Message, UserStatus } from '../types/index.ts';
import { apiFetch } from '../api/client.ts';
import { useAuth } from './AuthContext.tsx';
import { useWebSocket } from './WebSocketContext.tsx';

interface ChatContextType {
  conversations: Conversation[];
  rooms: { joined: ChatRoom[]; explore: ChatRoom[] };
  activeType: 'conversation' | 'room' | null;
  activeId: string | null;
  activeChat: (Conversation | ChatRoom) | null;
  messages: Message[];
  isLoadingMessages: boolean;
  typingUsers: Record<string, string[]>;
  userPresence: Record<string, { status: UserStatus; lastSeenAt: string }>;
  selectChat: (type: 'conversation' | 'room' | null, id: string | null) => void;
  sendMessage: (content: string, replyToId?: string | null, fileData?: { url: string; name: string; size: number; type: string }) => Promise<void>;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  togglePin: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  markActiveAsRead: () => void;
  sendTypingSignal: (isTyping: boolean) => void;
  refreshConversations: () => Promise<void>;
  refreshRooms: () => Promise<void>;
  refreshActiveChat: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { on, off, send, isConnected } = useWebSocket();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [rooms, setRooms] = useState<{ joined: ChatRoom[]; explore: ChatRoom[] }>({ joined: [], explore: [] });
  const [activeType, setActiveType] = useState<'conversation' | 'room' | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<(Conversation | ChatRoom) | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // typing: targetId -> array of display names
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
  const typingTimeouts = useRef<Record<string, NodeJS.Timeout>>({});

  // presence: userId -> { status, lastSeenAt }
  const [userPresence, setUserPresence] = useState<Record<string, { status: UserStatus; lastSeenAt: string }>>({});

  const refreshConversations = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch('/conversations');
      setConversations(res.conversations || []);
    } catch (err) {
      console.warn('Failed to refresh conversations:', err);
    }
  }, [user]);

  const refreshRooms = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch('/rooms');
      setRooms({
        joined: res.joined || [],
        explore: res.explore || [],
      });
    } catch (err) {
      console.warn('Failed to refresh rooms:', err);
    }
  }, [user]);

  const refreshActiveChat = useCallback(async () => {
    if (!activeType || !activeId || !user) return;
    try {
      if (activeType === 'conversation') {
        const res = await apiFetch(`/conversations/${activeId}`);
        setActiveChat(res.conversation);
      } else {
        const res = await apiFetch(`/rooms/${activeId}`);
        setActiveChat(res.room);
      }
    } catch {
      setActiveChat(null);
    }
  }, [activeType, activeId, user]);

  // Load conversations and rooms on user change
  useEffect(() => {
    if (user) {
      refreshConversations();
      refreshRooms();
    } else {
      setConversations([]);
      setRooms({ joined: [], explore: [] });
      setActiveType(null);
      setActiveId(null);
      setActiveChat(null);
      setMessages([]);
    }
  }, [user, refreshConversations, refreshRooms]);

  // Load messages when active chat changes
  useEffect(() => {
    if (!activeType || !activeId || !user) {
      setMessages([]);
      setActiveChat(null);
      return;
    }

    let isMounted = true;
    setIsLoadingMessages(true);

    const loadChatData = async () => {
      try {
        if (activeType === 'conversation') {
          const [chatRes, msgRes] = await Promise.all([
            apiFetch(`/conversations/${activeId}`),
            apiFetch(`/conversations/${activeId}/messages?limit=50`),
          ]);
          if (isMounted) {
            setActiveChat(chatRes.conversation);
            setMessages(msgRes.messages || []);
          }
        } else {
          const [roomRes, msgRes] = await Promise.all([
            apiFetch(`/rooms/${activeId}`),
            apiFetch(`/rooms/${activeId}/messages?limit=50`),
          ]);
          if (isMounted) {
            setActiveChat(roomRes.room);
            setMessages(msgRes.messages || []);
          }
        }
      } catch (err) {
        console.warn('Failed to load chat data:', err);
      } finally {
        if (isMounted) {
          setIsLoadingMessages(false);
        }
      }
    };

    loadChatData();

    // Inform WebSocket of channel focus
    send('join_channel', { targetId: activeId });

    return () => {
      isMounted = false;
      send('leave_channel', { targetId: activeId });
    };
  }, [activeType, activeId, user, send]);

  // Handle incoming real-time WebSocket events
  useEffect(() => {
    // 1. New message
    const handleMessage = (msg: Message) => {
      const isForActiveChat =
        (activeType === 'conversation' && msg.conversationId === activeId) ||
        (activeType === 'room' && msg.roomId === activeId);

      if (isForActiveChat) {
        setMessages((prev) => {
          // Idempotency: avoid duplicates
          if (prev.some((m) => m.id === msg.id)) {
            return prev.map((m) => (m.id === msg.id ? msg : m));
          }
          return [...prev, msg];
        });

        // Mark as read immediately if from other user and chat is focused
        if (activeType === 'conversation' && msg.senderId !== user?.id && activeId) {
          send('mark_read', { conversationId: activeId, messageId: msg.id });
        }
      }

      // Update last message in conversation list
      if (msg.conversationId) {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === msg.conversationId) {
              return {
                ...c,
                updatedAt: msg.createdAt,
                unreadCount: isForActiveChat ? 0 : c.unreadCount + (msg.senderId !== user?.id ? 1 : 0),
                lastMessage: {
                  id: msg.id,
                  senderId: msg.senderId,
                  content: msg.isDeleted ? 'Message deleted' : (msg.content || (msg.fileName ? `📎 ${msg.fileName}` : '')),
                  createdAt: msg.createdAt,
                },
              };
            }
            return c;
          })
        );
      }
    };

    // 2. Edit message
    const handleEdit = (payload: { messageId: string; content: string; updatedAt: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId
            ? { ...m, content: payload.content, isEdited: true, updatedAt: payload.updatedAt }
            : m
        )
      );
    };

    // 3. Delete message
    const handleDelete = (payload: { messageId: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId
            ? { ...m, content: 'This message was deleted', isDeleted: true, fileUrl: null }
            : m
        )
      );
    };

    // 4. Pin toggle
    const handlePin = (payload: { messageId: string; isPinned: boolean }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.messageId ? { ...m, isPinned: payload.isPinned } : m))
      );
      refreshActiveChat();
    };

    // 5. Reaction update
    const handleReaction = (payload: { messageId: string; reactions: any[] }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m
        )
      );
    };

    // 6. Read receipt
    const handleRead = (payload: { messageId: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId || m.createdAt <= (prev.find((x) => x.id === payload.messageId)?.createdAt || '')
            ? { ...m, status: 'read' }
            : m
        )
      );
    };

    // 7. Typing indicator
    const handleTyping = (payload: { targetId: string; userId: string; displayName: string; isTyping: boolean }) => {
      if (payload.userId === user?.id) return;

      const key = `${payload.targetId}_${payload.userId}`;
      if (typingTimeouts.current[key]) {
        clearTimeout(typingTimeouts.current[key]);
      }

      setTypingUsers((prev) => {
        const currentList = prev[payload.targetId] || [];
        if (payload.isTyping) {
          if (!currentList.includes(payload.displayName)) {
            return { ...prev, [payload.targetId]: [...currentList, payload.displayName] };
          }
          return prev;
        } else {
          return {
            ...prev,
            [payload.targetId]: currentList.filter((name) => name !== payload.displayName),
          };
        }
      });

      if (payload.isTyping) {
        // Auto clear after 4 seconds
        typingTimeouts.current[key] = setTimeout(() => {
          setTypingUsers((prev) => {
            const list = prev[payload.targetId] || [];
            return {
              ...prev,
              [payload.targetId]: list.filter((n) => n !== payload.displayName),
            };
          });
        }, 4000);
      }
    };

    // 8. Presence update
    const handlePresence = (payload: { userId: string; status: UserStatus; lastSeenAt: string }) => {
      setUserPresence((prev) => ({
        ...prev,
        [payload.userId]: { status: payload.status, lastSeenAt: payload.lastSeenAt },
      }));

      // Also update in conversation list
      setConversations((prev) =>
        prev.map((c) => {
          if (c.participant && c.participant.id === payload.userId) {
            return {
              ...c,
              participant: {
                ...c.participant,
                status: payload.status,
                lastSeenAt: payload.lastSeenAt,
              },
            };
          }
          return c;
        })
      );
    };

    // 9. Request accepted -> refresh conversations list
    const handleRequestAccepted = () => {
      refreshConversations();
    };

    // 10. Room updates
    const handleRoomUpdate = () => {
      refreshRooms();
      refreshActiveChat();
    };

    on('chat:message', handleMessage);
    on('chat:edit', handleEdit);
    on('chat:delete', handleDelete);
    on('chat:pin', handlePin);
    on('chat:reaction', handleReaction);
    on('chat:read', handleRead);
    on('typing_indicator', handleTyping);
    on('presence_update', handlePresence);
    on('request_accepted', handleRequestAccepted);
    on('room:member_joined', handleRoomUpdate);
    on('room:member_kicked', handleRoomUpdate);
    on('room:member_banned', handleRoomUpdate);
    on('room:permissions_updated', handleRoomUpdate);
    on('room:details_updated', handleRoomUpdate);
    on('room:ownership_transferred', handleRoomUpdate);

    return () => {
      off('chat:message', handleMessage);
      off('chat:edit', handleEdit);
      off('chat:delete', handleDelete);
      off('chat:pin', handlePin);
      off('chat:reaction', handleReaction);
      off('chat:read', handleRead);
      off('typing_indicator', handleTyping);
      off('presence_update', handlePresence);
      off('request_accepted', handleRequestAccepted);
      off('room:member_joined', handleRoomUpdate);
      off('room:member_kicked', handleRoomUpdate);
      off('room:member_banned', handleRoomUpdate);
      off('room:permissions_updated', handleRoomUpdate);
      off('room:details_updated', handleRoomUpdate);
      off('room:ownership_transferred', handleRoomUpdate);
    };
  }, [activeType, activeId, user, on, off, send, refreshConversations, refreshRooms, refreshActiveChat]);

  const selectChat = (type: 'conversation' | 'room' | null, id: string | null) => {
    setActiveType(type);
    setActiveId(id);
    if (!type || !id) {
      setActiveChat(null);
      setMessages([]);
    }
  };

  const sendMessage = async (
    content: string,
    replyToId?: string | null,
    fileData?: { url: string; name: string; size: number; type: string }
  ) => {
    if (!activeType || !activeId) return;

    const endpoint =
      activeType === 'conversation'
        ? `/conversations/${activeId}/messages`
        : `/rooms/${activeId}/messages`;

    const clientMessageId = `cmsg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        content,
        replyToId: replyToId || null,
        fileUrl: fileData?.url || null,
        fileName: fileData?.name || null,
        fileSize: fileData?.size || null,
        fileType: fileData?.type || null,
        clientMessageId,
      }),
    });
  };

  const editMessage = async (messageId: string, newContent: string) => {
    if (!activeType || !activeId) return;
    const endpoint =
      activeType === 'conversation'
        ? `/conversations/${activeId}/messages/${messageId}`
        : `/rooms/${activeId}/messages/${messageId}`;
    await apiFetch(endpoint, {
      method: 'PATCH',
      body: JSON.stringify({ content: newContent }),
    });
  };

  const deleteMessage = async (messageId: string) => {
    if (!activeType || !activeId) return;
    const endpoint =
      activeType === 'conversation'
        ? `/conversations/${activeId}/messages/${messageId}`
        : `/rooms/${activeId}/messages/${messageId}`;

    await apiFetch(endpoint, {
      method: 'DELETE',
    });
  };

  const togglePin = async (messageId: string) => {
    if (!activeType || !activeId) return;
    const endpoint =
      activeType === 'conversation'
        ? `/conversations/${activeId}/messages/${messageId}/pin`
        : `/rooms/${activeId}/messages/${messageId}/pin`;

    await apiFetch(endpoint, {
      method: 'POST',
    });
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!activeType || !activeId) return;
    const endpoint =
      activeType === 'conversation'
        ? `/conversations/${activeId}/messages/${messageId}/reactions`
        : `/rooms/${activeId}/messages/${messageId}/reactions`;

    await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  };

  const markActiveAsRead = () => {
    if (activeType === 'conversation' && activeId) {
      apiFetch(`/conversations/${activeId}/read`, { method: 'POST' }).catch(() => {});
      setConversations((prev) =>
        prev.map((c) => (c.id === activeId ? { ...c, unreadCount: 0 } : c))
      );
    }
  };

  const sendTypingSignal = (isTyping: boolean) => {
    if (activeId && isConnected) {
      send('typing', { targetId: activeId, isTyping });
    }
  };

  return (
    <ChatContext.Provider
      value={{
        conversations,
        rooms,
        activeType,
        activeId,
        activeChat,
        messages,
        isLoadingMessages,
        typingUsers,
        userPresence,
        selectChat,
        sendMessage,
        editMessage,
        deleteMessage,
        togglePin,
        toggleReaction,
        markActiveAsRead,
        sendTypingSignal,
        refreshConversations,
        refreshRooms,
        refreshActiveChat,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
