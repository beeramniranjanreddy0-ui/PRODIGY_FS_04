import React, { useState } from 'react';
import { X, Search, Clock, FileText, Loader2 } from 'lucide-react';
import { apiFetch } from '../../api/client.ts';
import { Message } from '../../types/index.ts';
import { useToast } from '../common/Toast.tsx';

interface SearchModalProps {
  chatType: 'conversation' | 'room';
  chatId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectMessage?: (messageId: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  chatType,
  chatId,
  isOpen,
  onClose,
  onSelectMessage,
}) => {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const endpoint =
        chatType === 'conversation'
          ? `/conversations/${chatId}/messages?q=${encodeURIComponent(query.trim())}&limit=50`
          : `/rooms/${chatId}/messages?q=${encodeURIComponent(query.trim())}&limit=50`;

      const res = await apiFetch(endpoint);
      setResults(res.messages || []);
    } catch (err: any) {
      toast(err.message || 'Search failed', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Search Messages
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Search within this conversation's persisted message history.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search input */}
        <form onSubmit={handleSearch} className="p-4 border-b border-slate-200 dark:border-slate-800 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by keywords..."
              autoFocus
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium transition-colors cursor-pointer"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
          </button>
        </form>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {results.length > 0 ? (
            results.map((msg) => (
              <div
                key={msg.id}
                onClick={() => {
                  onSelectMessage?.(msg.id);
                  onClose();
                }}
                className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {msg.sender.displayName}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(msg.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    · {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                  {msg.content}
                </p>
                {msg.fileName && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-blue-600">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{msg.fileName}</span>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">
              {query ? 'No matching messages found' : 'Enter keywords to search message history'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
