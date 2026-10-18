import React from 'react';
import { AuthProvider } from './context/AuthContext.tsx';
import { WebSocketProvider } from './context/WebSocketContext.tsx';
import { ChatProvider } from './context/ChatContext.tsx';
import { ToastProvider } from './components/common/Toast.tsx';
import { AppLayout } from './components/layout/AppLayout.tsx';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <WebSocketProvider>
          <ChatProvider>
            <AppLayout />
          </ChatProvider>
        </WebSocketProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
