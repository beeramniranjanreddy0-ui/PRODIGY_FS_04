import React, { useState } from 'react';
import { X, Flag, AlertTriangle, Loader2 } from 'lucide-react';
import { apiFetch } from '../../api/client.ts';
import { useToast } from '../common/Toast.tsx';

interface ReportModalProps {
  targetUser?: any | null;
  messageId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  targetUser,
  messageId,
  isOpen,
  onClose,
}) => {
  const { toast } = useToast();
  const [reason, setReason] = useState('Spam or unwanted advertising');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser?.id) return;

    setIsSubmitting(true);
    try {
      await apiFetch('/users/report', {
        method: 'POST',
        body: JSON.stringify({
          reportedUserId: targetUser.id,
          reason,
          details: details.trim(),
          messageId: messageId || null,
        }),
      });

      toast('Thank you. The report has been submitted for review.', 'success');
      onClose();
    } catch (err: any) {
      toast(err.message || 'Failed to submit report', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-red-600" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Submit Report
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Reporting user: <span className="font-semibold">{targetUser?.displayName}</span> ({targetUser?.userId})
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
            >
              <option value="Spam or unwanted advertising">Spam or unwanted advertising</option>
              <option value="Harassment or abuse">Harassment or abuse</option>
              <option value="Inappropriate or illegal content">Inappropriate content</option>
              <option value="Impersonation">Impersonation</option>
              <option value="Other">Other policy violation</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Additional Details (Optional)
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Provide context or explanation..."
              rows={3}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-medium transition-colors cursor-pointer shadow-xs"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
