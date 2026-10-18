import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useChat } from '../../context/ChatContext.tsx';
import { NavigationSidebar } from './NavigationSidebar.tsx';
import { ChatList } from '../chat/ChatList.tsx';
import { ChatWindow } from '../chat/ChatWindow.tsx';
import { AuthModal } from '../auth/AuthModal.tsx';
import { UserSearchModal } from '../discovery/UserSearchModal.tsx';
import { ChatRequestsModal } from '../discovery/ChatRequestsModal.tsx';
import { CreateRoomModal } from '../rooms/CreateRoomModal.tsx';
import { JoinRoomModal } from '../rooms/JoinRoomModal.tsx';
import { RoomSettingsModal } from '../rooms/RoomSettingsModal.tsx';
import { RoomMembersModal } from '../rooms/RoomMembersModal.tsx';
import { NotificationsPanel } from '../notifications/NotificationsPanel.tsx';
import { ProfileModal } from '../profile/ProfileModal.tsx';
import { ConversationDetailsModal } from '../chat/ConversationDetailsModal.tsx';
import { SearchModal } from '../chat/SearchModal.tsx';
import { ReportModal } from '../moderation/ReportModal.tsx';
import { ChatRoom, Message } from '../../types/index.ts';

export const AppLayout: React.FC = () => {
  const { user, isLoading } = useAuth();
  const { activeType, activeId, activeChat, selectChat } = useChat();

  const [currentTab, setCurrentTab] = useState<'chats' | 'rooms'>('chats');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('connectly_theme');
    return saved ? saved === 'dark' : true;
  });

  // Mobile layout state: when activeId is set on small screens, show chat window; otherwise list
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  // Modals visibility state
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showJoinRoom, setShowJoinRoom] = useState(false);
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [showRoomMembers, setShowRoomMembers] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showConversationDetails, setShowConversationDetails] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ user?: any; messageId?: string } | null>(null);

  // Sync dark mode class
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('connectly_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('connectly_theme', 'light');
    }
  }, [darkMode]);

  // Mobile navigation trigger
  const handleSelectConversationOnMobile = () => {
    setMobileView('chat');
  };

  const handleBackToMobileList = () => {
    setMobileView('list');
    selectChat(null, null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0D0D0E] text-[#EDEDED]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white text-black flex items-center justify-center font-extrabold text-xl shadow-lg animate-pulse">
            C
          </div>
          <span className="mono text-xs text-amber-500 font-bold tracking-widest">
            LOADING CONNECTLY...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0D0D0E] text-[#EDEDED] font-sans">
      {/* If not authenticated, show Auth Modal */}
      {!user && <AuthModal />}

      {/* Main App Workspace */}
      {user && (
        <>
          {/* Navigation Icon Sidebar */}
          <NavigationSidebar
            currentTab={currentTab}
            onSelectTab={(tab) => {
              setCurrentTab(tab);
              setMobileView('list');
            }}
            onOpenRequests={() => setShowRequests(true)}
            onOpenNotifications={() => setShowNotifications(true)}
            onOpenSearch={() => setShowUserSearch(true)}
            onOpenProfile={() => setShowProfile(true)}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
          />

          {/* Conversation / Room List Panel */}
          <div
            className={`h-full ${
              mobileView === 'chat' ? 'hidden md:flex' : 'flex'
            } w-full md:w-auto shrink-0`}
          >
            <ChatList
              currentTab={currentTab}
              onSelectTab={setCurrentTab}
              onOpenNewChat={() => setShowUserSearch(true)}
              onOpenCreateRoom={() => setShowCreateRoom(true)}
              onOpenJoinRoom={() => setShowJoinRoom(true)}
              onSelectConversationOnMobile={handleSelectConversationOnMobile}
            />
          </div>

          {/* Active Conversation / Room Panel */}
          <div
            className={`flex-1 h-full ${
              mobileView === 'list' && !activeId ? 'hidden md:flex' : 'flex'
            } min-w-0`}
          >
            <ChatWindow
              onBackMobile={handleBackToMobileList}
              onOpenSearch={() => setShowSearchModal(true)}
              onOpenMembers={() => setShowRoomMembers(true)}
              onOpenSettings={() => setShowRoomSettings(true)}
              onOpenDetails={() => setShowConversationDetails(true)}
              onReportMessage={(msg: Message) => setReportTarget({ user: msg.sender, messageId: msg.id })}
              onOpenCreateRoom={() => setShowCreateRoom(true)}
              onOpenNewChat={() => setShowUserSearch(true)}
              onOpenJoinRoom={() => setShowJoinRoom(true)}
            />
          </div>

          {/* Modals & Dialogs */}
          <UserSearchModal
            isOpen={showUserSearch}
            onClose={() => setShowUserSearch(false)}
          />

          <ChatRequestsModal
            isOpen={showRequests}
            onClose={() => setShowRequests(false)}
          />

          <CreateRoomModal
            isOpen={showCreateRoom}
            onClose={() => setShowCreateRoom(false)}
          />

          <JoinRoomModal
            isOpen={showJoinRoom}
            onClose={() => setShowJoinRoom(false)}
          />

          {activeChat && activeType === 'room' && (
            <>
              <RoomSettingsModal
                room={activeChat as ChatRoom}
                isOpen={showRoomSettings}
                onClose={() => setShowRoomSettings(false)}
              />
              <RoomMembersModal
                room={activeChat as ChatRoom}
                isOpen={showRoomMembers}
                onClose={() => setShowRoomMembers(false)}
              />
            </>
          )}

          {activeChat && activeType === 'conversation' && (
            <ConversationDetailsModal
              conversation={activeChat}
              isOpen={showConversationDetails}
              onClose={() => setShowConversationDetails(false)}
              onOpenReport={(targetUser) => setReportTarget({ user: targetUser })}
            />
          )}

          {activeType && activeId && (
            <SearchModal
              chatType={activeType}
              chatId={activeId}
              isOpen={showSearchModal}
              onClose={() => setShowSearchModal(false)}
            />
          )}

          <NotificationsPanel
            isOpen={showNotifications}
            onClose={() => setShowNotifications(false)}
            onOpenRequests={() => setShowRequests(true)}
          />

          <ProfileModal
            isOpen={showProfile}
            onClose={() => setShowProfile(false)}
          />

          {reportTarget && (
            <ReportModal
              targetUser={reportTarget.user}
              messageId={reportTarget.messageId}
              isOpen={true}
              onClose={() => setReportTarget(null)}
            />
          )}
        </>
      )}
    </div>
  );
};
