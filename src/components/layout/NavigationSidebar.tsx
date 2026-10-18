import React from 'react';
import {
  MessageSquare,
  Hash,
  UserPlus,
  Bell,
  Search,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Avatar } from '../common/Avatar.tsx';

interface NavigationSidebarProps {
  currentTab: 'chats' | 'rooms';
  onSelectTab: (tab: 'chats' | 'rooms') => void;
  onOpenRequests: () => void;
  onOpenNotifications: () => void;
  onOpenSearch: () => void;
  onOpenProfile: () => void;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
}

export const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
  currentTab,
  onSelectTab,
  onOpenRequests,
  onOpenNotifications,
  onOpenSearch,
  onOpenProfile,
}) => {
  const { user, logout } = useAuth();

  return (
    <aside className="w-20 shrink-0 bg-[#0D0D0E] border-r border-white/10 flex flex-col items-center py-5 justify-between z-20 select-none">
      {/* Top Brand Mark */}
      <div className="flex flex-col items-center gap-6 w-full">
        <button
          onClick={() => onSelectTab('chats')}
          className="w-12 h-12 rounded-xl bg-white text-black flex items-center justify-center font-extrabold text-xl shadow-md hover:bg-neutral-200 transition-all cursor-pointer"
          title="Connectly Home"
        >
          <span>C</span>
        </button>

        {/* Primary Navigation Icons */}
        <nav className="flex flex-col items-center gap-3 w-full px-2">
          {/* Direct Chats */}
          <button
            onClick={() => onSelectTab('chats')}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              currentTab === 'chats'
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 font-semibold'
                : 'text-slate-400 hover:text-[#EDEDED] border border-transparent hover:border-white/10'
            }`}
            title="Direct Chats"
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          {/* Group Rooms */}
          <button
            onClick={() => onSelectTab('rooms')}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              currentTab === 'rooms'
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 font-semibold'
                : 'text-slate-400 hover:text-[#EDEDED] border border-transparent hover:border-white/10'
            }`}
            title="Group Rooms"
          >
            <Hash className="w-5 h-5" />
          </button>

          {/* Search / Discover User */}
          <button
            onClick={onOpenSearch}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 hover:text-[#EDEDED] border border-transparent hover:border-white/10 transition-all cursor-pointer"
            title="Find User by USR-xxxx"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Chat Requests with badge */}
          <button
            onClick={onOpenRequests}
            className="relative w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 hover:text-[#EDEDED] border border-transparent hover:border-white/10 transition-all cursor-pointer"
            title="Chat Requests"
          >
            <UserPlus className="w-5 h-5" />
            {(user?.unreadRequestsCount ?? 0) > 0 && (
              <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-[#0D0D0E]" />
            )}
          </button>

          {/* Notifications */}
          <button
            onClick={onOpenNotifications}
            className="relative w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 hover:text-[#EDEDED] border border-transparent hover:border-white/10 transition-all cursor-pointer"
            title="Notifications"
          >
            <Bell className="w-5 h-5" />
            {(user?.unreadNotificationsCount ?? 0) > 0 && (
              <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-[#0D0D0E]" />
            )}
          </button>
        </nav>
      </div>

      {/* Bottom Controls */}
      <div className="flex flex-col items-center gap-3 w-full px-2 relative">
        {/* User Profile Avatar */}
        <button
          onClick={onOpenProfile}
          className="p-1 rounded-xl hover:ring-2 hover:ring-amber-500/40 transition-all cursor-pointer"
          title="Account Settings"
        >
          <Avatar
            name={user?.displayName || 'User'}
            avatarUrl={user?.avatarUrl}
            status={user?.status}
            size="sm"
            showStatus={true}
          />
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          className="w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
          title="Log out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
