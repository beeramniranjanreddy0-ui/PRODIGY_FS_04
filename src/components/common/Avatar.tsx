import React from 'react';
import { UserStatus } from '../../types/index.ts';

interface AvatarProps {
  name: string;
  avatarUrl?: string;
  status?: UserStatus;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  avatarUrl,
  status,
  size = 'md',
  showStatus = false,
  className = '',
}) => {
  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl',
  };

  const statusDotSizes = {
    xs: 'w-1.5 h-1.5 ring-1',
    sm: 'w-2 h-2 ring-1.5',
    md: 'w-2.5 h-2.5 ring-2',
    lg: 'w-3 h-3 ring-2',
    xl: 'w-3.5 h-3.5 ring-2',
  };

  const getInitials = (str: string) => {
    if (!str) return '?';
    const parts = str.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Deterministic clean background color based on name
  const colors = [
    'bg-blue-600 text-white',
    'bg-indigo-600 text-white',
    'bg-slate-700 text-white',
    'bg-teal-600 text-white',
    'bg-cyan-700 text-white',
    'bg-sky-600 text-white',
  ];
  const charCodeSum = name ? name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
  const colorClass = colors[charCodeSum % colors.length];

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${sizeClasses[size]} ${className}`}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          className="w-full h-full rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10"
        />
      ) : (
        <div
          className={`w-full h-full rounded-full flex items-center justify-center font-medium select-none ring-1 ring-black/5 dark:ring-white/10 ${colorClass}`}
        >
          {getInitials(name)}
        </div>
      )}

      {showStatus && status && (
        <span
          className={`absolute bottom-0 right-0 rounded-full ring-white dark:ring-slate-900 ${
            statusDotSizes[size]
          } ${
            status === 'online'
              ? 'bg-emerald-500'
              : status === 'away'
              ? 'bg-amber-500'
              : 'bg-slate-400'
          }`}
          title={`Status: ${status}`}
        />
      )}
    </div>
  );
};
