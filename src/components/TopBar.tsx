import { CheckCircle2, LogOut, Menu, Moon, Search, Sun, X } from 'lucide-react';
import type { User } from 'firebase/auth';

interface TopBarProps {
  user: User | null;
  searchQuery: string;
  onlyRevisionReady: boolean;
  isDark: boolean;
  onSearchChange: (q: string) => void;
  onToggleRevisionFilter: () => void;
  onToggleTheme: () => void;
  onToggleMobileSidebar: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function TopBar({
  user,
  searchQuery,
  onlyRevisionReady,
  isDark,
  onSearchChange,
  onToggleRevisionFilter,
  onToggleTheme,
  onToggleMobileSidebar,
  onSignIn,
  onSignOut,
}: TopBarProps) {
  return (
    <header
      data-section="top-bar"
      className="h-[57px] px-4 lg:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-6 sticky top-0 z-30"
    >
      {/* Zone 1: Brand wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        {user && (
          <button
            type="button"
            onClick={onToggleMobileSidebar}
            aria-label="Toggle curriculum sidebar"
            className="lg:hidden p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
          Lectern
        </span>
      </div>

      {/* Zone 2: Search & Workspace Controls */}
      {user ? (
        <div className="flex-1 max-w-xl flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search notes, definitions, transcripts, or tags..."
              className="w-full pl-9 pr-8 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleRevisionFilter}
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
              onlyRevisionReady
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Revision Ready
          </button>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Zone 3: Theme Toggle & Account Action */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {user ? (
          <div className="flex items-center gap-2.5">
            <span className="hidden md:inline text-xs font-medium text-slate-600 dark:text-slate-300 max-w-[160px] truncate">
              {user.displayName || user.email}
            </span>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            Sign in with Google
          </button>
        )}
      </div>
    </header>
  );
}
