import React, { useState, useEffect } from 'react';
import { X, Bell, CheckCheck, Loader2 } from 'lucide-react';
import { NotificationItem } from '../../types/index.ts';
import { apiFetch } from '../../api/client.ts';
import { useToast } from '../common/Toast.tsx';
import { useChat } from '../../context/ChatContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRequests: () => void;
}

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  isOpen,
  onClose,
  onOpenRequests,
}) => {
  const { toast } = useToast();
  const { selectChat } = useChat();
  const { refreshUser } = useAuth();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/notifications');
      setNotifications(res.notifications || []);
    } catch (err: any) {
      toast(err.message || 'Failed to load notifications', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      refreshUser();
      toast('All notifications marked as read', 'info');
    } catch {
      // ignore
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.isRead) {
      apiFetch(`/notifications/${notif.id}/read`, { method: 'POST' }).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
      );
      refreshUser();
    }

    if (notif.type === 'chat_request') {
      onClose();
      onOpenRequests();
      return;
    }

    if (notif.data?.conversationId) {
      selectChat('conversation', notif.data.conversationId);
      onClose();
    } else if (notif.data?.roomId) {
      selectChat('room', notif.data.roomId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end p-0 md:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full md:max-w-md h-full md:h-[85vh] bg-[#121214] border-l md:border border-white/10 md:rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[#EDEDED]">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0D0D0E]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight text-[#EDEDED]">
                  Notifications
                </h3>
                {notifications.some((n) => !n.isRead) && (
                  <span className="mono text-[9px] px-1.5 py-0.5 rounded bg-amber-500 text-black font-bold">
                    NEW
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400">
                System alerts and direct updates
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {notifications.some((n) => !n.isRead) && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-[11px] font-medium text-amber-500 hover:text-amber-400 hover:underline cursor-pointer transition-colors px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20"
              >
                <CheckCheck className="w-3 h-3" />
                <span>Mark all read</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              title="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List Container */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              <span className="mono text-[11px] text-amber-500 tracking-widest">
                LOADING NOTIFICATIONS...
              </span>
            </div>
          ) : notifications.length > 0 ? (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`w-full p-3.5 rounded-xl text-left transition-all cursor-pointer flex items-start gap-3 relative border group ${
                  !n.isRead
                    ? 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/30 shadow-xs'
                    : 'bg-[#1A1A1D]/60 hover:bg-[#1A1A1D] border-white/5 hover:border-white/10'
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full mt-1.5 shrink-0 transition-colors ${
                    !n.isRead
                      ? 'bg-amber-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]'
                      : 'bg-zinc-700'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`text-xs font-semibold truncate transition-colors ${
                        !n.isRead
                          ? 'text-amber-400'
                          : 'text-[#EDEDED] group-hover:text-amber-300'
                      }`}
                    >
                      {n.title}
                    </p>
                    <span className="mono text-[9px] text-zinc-500 shrink-0">
                      {new Date(n.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-300 mt-1 leading-relaxed">
                    {n.body}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="mono text-[9px] text-zinc-500">
                      {new Date(n.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    {notifTypeLabel(n.type)}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="py-16 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500">
                <Bell className="w-5 h-5" />
              </div>
              <p className="mono text-xs text-zinc-400 tracking-wider">
                NO NOTIFICATIONS
              </p>
              <p className="text-xs text-zinc-500 max-w-xs">
                You're all caught up! Updates and activity alerts will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper badge for notification types
const notifTypeLabel = (type: string) => {
  switch (type) {
    case 'chat_request':
      return (
        <span className="mono text-[9px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
          REQUEST
        </span>
      );
    case 'chat_accepted':
      return (
        <span className="mono text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
          ACCEPTED
        </span>
      );
    default:
      return (
        <span className="mono text-[9px] text-zinc-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">
          SYSTEM
        </span>
      );
  }
};
