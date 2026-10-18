import React, { useState } from 'react';
import { X, Globe, Lock, KeyRound, Plus, Trash2, Layers, FolderPlus, Sparkles } from 'lucide-react';
import { apiFetch } from '../../api/client.ts';
import { useToast } from '../common/Toast.tsx';
import { useChat } from '../../context/ChatContext.tsx';
import { RoomVisibility } from '../../types/index.ts';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MultiRoomItem {
  id: string;
  name: string;
  description: string;
  visibility: RoomVisibility;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ isOpen, onClose }) => {
  const { toast } = useToast();
  const { refreshRooms, selectChat } = useChat();

  const [mode, setMode] = useState<'single' | 'multiple'>('single');

  // Single Room State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<RoomVisibility>('public');
  const [slowMode, setSlowMode] = useState<number>(0);

  // Multiple Rooms State
  const [multiRooms, setMultiRooms] = useState<MultiRoomItem[]>([
    { id: '1', name: '', description: '', visibility: 'public' },
    { id: '2', name: '', description: '', visibility: 'public' },
  ]);
  const [bulkInput, setBulkInput] = useState('');
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [defaultBatchVisibility, setDefaultBatchVisibility] = useState<RoomVisibility>('public');

  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAddMultiRow = () => {
    setMultiRooms((prev) => [
      ...prev,
      { id: Date.now().toString(), name: '', description: '', visibility: defaultBatchVisibility },
    ]);
  };

  const handleRemoveMultiRow = (id: string) => {
    if (multiRooms.length <= 1) return;
    setMultiRooms((prev) => prev.filter((r) => r.id !== id));
  };

  const handleMultiChange = (id: string, field: keyof MultiRoomItem, value: string) => {
    setMultiRooms((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleApplyBulkPaste = () => {
    const lines = bulkInput
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      toast('Please enter room names in the text area.', 'error');
      return;
    }

    const newItems: MultiRoomItem[] = lines.map((roomName, idx) => ({
      id: `${Date.now()}_${idx}`,
      name: roomName,
      description: '',
      visibility: defaultBatchVisibility,
    }));

    setMultiRooms(newItems);
    setBulkInput('');
    setShowBulkPaste(false);
    toast(`Added ${newItems.length} rooms to batch list!`, 'success');
  };

  const handleSubmitSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await apiFetch('/rooms', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          visibility,
          permissions: {
            slowModeSeconds: slowMode,
          },
        }),
      });

      toast(`Room "${res.room.name}" created!`, 'success');
      await refreshRooms();
      selectChat('room', res.room.id);
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to create room', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitMultiple = async (e: React.FormEvent) => {
    e.preventDefault();
    const validRooms = multiRooms
      .map((r) => ({
        name: r.name.trim(),
        description: r.description.trim(),
        visibility: r.visibility,
      }))
      .filter((r) => r.name.length > 0);

    if (validRooms.length === 0) {
      toast('Please enter at least one valid room name.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch('/rooms/batch', {
        method: 'POST',
        body: JSON.stringify({
          rooms: validRooms,
        }),
      });

      toast(`Successfully created ${res.rooms?.length || validRooms.length} rooms!`, 'success');
      await refreshRooms();
      if (res.rooms && res.rooms.length > 0) {
        selectChat('room', res.rooms[0].id);
      }
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to create multiple rooms', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const validMultiCount = multiRooms.filter((r) => r.name.trim().length > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none">
      <div className="w-full max-w-xl bg-[#141416] border border-white/10 rounded-2xl shadow-2xl overflow-hidden text-[#EDEDED] flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#17171A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Create Rooms</h3>
              <p className="text-[11px] text-slate-400">
                Create a single room or batch create multiple rooms at once.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="p-3 bg-[#0D0D0E] border-b border-white/5 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              mode === 'single'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Single Room
          </button>
          <button
            type="button"
            onClick={() => setMode('multiple')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              mode === 'multiple'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Multiple Rooms (Batch)
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
          {mode === 'single' ? (
            <form id="single-room-form" onSubmit={handleSubmitSingle} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Room Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Engineering Architecture"
                  className="w-full px-3 py-2 bg-[#1A1A1B] border border-[#333] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is the purpose of this room?"
                  rows={2}
                  className="w-full px-3 py-2 bg-[#1A1A1B] border border-[#333] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Room Visibility
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibility('public')}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      visibility === 'public'
                        ? 'border-amber-500/60 bg-amber-500/10 text-amber-400 font-semibold'
                        : 'border-white/10 bg-[#0D0D0E] hover:border-white/20 text-slate-300'
                    }`}
                  >
                    <Globe className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-medium">Public</span>
                    <span className="text-[10px] text-slate-400">Anyone can find & join</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVisibility('private')}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      visibility === 'private'
                        ? 'border-amber-500/60 bg-amber-500/10 text-amber-400 font-semibold'
                        : 'border-white/10 bg-[#0D0D0E] hover:border-white/20 text-slate-300'
                    }`}
                  >
                    <Lock className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-medium">Private</span>
                    <span className="text-[10px] text-slate-400">Owner approval needed</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVisibility('invite_only')}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      visibility === 'invite_only'
                        ? 'border-amber-500/60 bg-amber-500/10 text-amber-400 font-semibold'
                        : 'border-white/10 bg-[#0D0D0E] hover:border-white/20 text-slate-300'
                    }`}
                  >
                    <KeyRound className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-medium">Invite Only</span>
                    <span className="text-[10px] text-slate-400">Requires invite code</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Slow Mode
                </label>
                <select
                  value={slowMode}
                  onChange={(e) => setSlowMode(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 bg-[#1A1A1B] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/60"
                >
                  <option value={0}>Off (No delay)</option>
                  <option value={5}>5 seconds</option>
                  <option value={15}>15 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={60}>60 seconds</option>
                </select>
              </div>
            </form>
          ) : (
            <form id="multi-room-form" onSubmit={handleSubmitMultiple} className="space-y-4">
              {/* Quick Actions & Bulk Paste Toggle */}
              <div className="flex items-center justify-between gap-2 p-3 bg-[#1A1A1D] border border-white/10 rounded-xl">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Bulk Paste Mode</div>
                  <div className="text-[11px] text-slate-400">
                    Paste multiple room names separated by commas or line breaks.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBulkPaste(!showBulkPaste)}
                  className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {showBulkPaste ? 'Close Paste' : 'Paste Room List'}
                </button>
              </div>

              {/* Bulk Paste Textarea Modal / Box */}
              {showBulkPaste && (
                <div className="p-3 bg-[#0D0D0E] border border-amber-500/30 rounded-xl space-y-2">
                  <label className="block text-xs font-medium text-amber-400">
                    Enter or paste room names:
                  </label>
                  <textarea
                    rows={4}
                    value={bulkInput}
                    onChange={(e) => setBulkInput(e.target.value)}
                    placeholder={`General\nAnnouncements\nTech Discussions\nProject Alpha\nRandom Chat`}
                    className="w-full p-2.5 bg-[#1A1A1B] border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">Default Visibility:</span>
                      <select
                        value={defaultBatchVisibility}
                        onChange={(e) => setDefaultBatchVisibility(e.target.value as RoomVisibility)}
                        className="px-2 py-1 bg-[#1A1A1B] border border-white/10 rounded-md text-[11px] text-slate-200"
                      >
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                        <option value="invite_only">Invite Only</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyBulkPaste}
                      className="px-3 py-1 bg-amber-500 text-black text-xs font-semibold rounded-lg hover:bg-amber-400 transition-colors cursor-pointer"
                    >
                      Generate List
                    </button>
                  </div>
                </div>
              )}

              {/* Dynamic Room Rows */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-slate-400 px-1">
                  <span>Room Details ({multiRooms.length} rooms in batch)</span>
                  <button
                    type="button"
                    onClick={handleAddMultiRow}
                    className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-xs cursor-pointer font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Another Room
                  </button>
                </div>

                <div className="space-y-2.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                  {multiRooms.map((room, idx) => (
                    <div
                      key={room.id}
                      className="p-3 bg-[#1A1A1D] border border-white/10 rounded-xl space-y-2 relative group hover:border-white/20 transition-all"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-amber-500/80 uppercase tracking-wider">
                          Room #{idx + 1}
                        </span>
                        {multiRooms.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMultiRow(room.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 rounded-md transition-colors cursor-pointer"
                            title="Remove room"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="sm:col-span-2">
                          <input
                            type="text"
                            required
                            value={room.name}
                            onChange={(e) => handleMultiChange(room.id, 'name', e.target.value)}
                            placeholder={`Room name (e.g. Room ${idx + 1})`}
                            className="w-full px-2.5 py-1.5 bg-[#121214] border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
                          />
                        </div>
                        <div>
                          <select
                            value={room.visibility}
                            onChange={(e) =>
                              handleMultiChange(room.id, 'visibility', e.target.value as RoomVisibility)
                            }
                            className="w-full px-2 py-1.5 bg-[#121214] border border-white/10 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500/60"
                          >
                            <option value="public">🌐 Public</option>
                            <option value="private">🔒 Private</option>
                            <option value="invite_only">🔑 Invite Only</option>
                          </select>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={room.description}
                        onChange={(e) => handleMultiChange(room.id, 'description', e.target.value)}
                        placeholder="Optional brief description..."
                        className="w-full px-2.5 py-1.5 bg-[#121214] border border-white/10 rounded-lg text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-amber-500/60"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#17171A] border-t border-white/10 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {mode === 'single' ? (
              <span>Single room creation mode</span>
            ) : (
              <span className="text-amber-400 font-medium">
                {validMultiCount} valid room{validMultiCount === 1 ? '' : 's'} ready to create
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {mode === 'single' ? (
              <button
                type="submit"
                form="single-room-form"
                disabled={isSubmitting || !name.trim()}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-white/10 disabled:text-slate-500 text-black rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                {isSubmitting ? 'Creating...' : 'Create Room'}
              </button>
            ) : (
              <button
                type="submit"
                form="multi-room-form"
                disabled={isSubmitting || validMultiCount === 0}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-white/10 disabled:text-slate-500 text-black rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  'Creating Rooms...'
                ) : (
                  <>
                    <Layers className="w-3.5 h-3.5" />
                    Create {validMultiCount} Room{validMultiCount === 1 ? '' : 's'}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
