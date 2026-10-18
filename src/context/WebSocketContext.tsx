import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext.tsx';
import { getStoredTokens } from '../api/client.ts';

type EventHandler = (payload: any) => void;

interface WebSocketContextType {
  isConnected: boolean;
  send: (type: string, payload?: any) => void;
  on: (type: string, handler: EventHandler) => void;
  off: (type: string, handler: EventHandler) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!user) return;
    const { accessToken } = getStoredTokens();
    if (!accessToken) return;

    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(accessToken)}`;

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const handlers = handlersRef.current.get(data.type);
          if (handlers) {
            handlers.forEach((handler) => handler(data.payload));
          }
        } catch (err) {
          console.error('Error handling WebSocket message:', err);
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        socketRef.current = null;
        // Reconnect if not cleanly closed and user still logged in
        if (event.code !== 4001 && user) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      ws.onerror = (err) => {
        console.warn('WebSocket connection error:', err);
      };
    } catch (err) {
      console.warn('Failed to construct WebSocket:', err);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      connect();
    } else {
      if (socketRef.current) {
        socketRef.current.close(1000, 'User logged out');
        socketRef.current = null;
      }
      setIsConnected(false);
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close(1000, 'Provider unmounting');
        socketRef.current = null;
      }
    };
  }, [user, connect]);

  const send = useCallback((type: string, payload?: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  const on = useCallback((type: string, handler: EventHandler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)!.add(handler);
  }, []);

  const off = useCallback((type: string, handler: EventHandler) => {
    const set = handlersRef.current.get(type);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        handlersRef.current.delete(type);
      }
    }
  }, []);

  return (
    <WebSocketContext.Provider value={{ isConnected, send, on, off }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};
