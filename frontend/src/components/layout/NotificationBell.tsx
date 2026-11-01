import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  getUnreadCountApi,
  listNotificationsApi,
  markAllNotificationsReadApi,
  markNotificationReadApi,
} from '../../api/notifications.api';
import { timeAgo } from '../../utils/format';
import type { AppNotification } from '../../types';

const POLL_MS = 45_000;

export default function NotificationBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(() => {
    getUnreadCountApi().then(setUnread).catch(() => { /* badge is best-effort */ });
  }, []);

  // Poll while the tab is visible, and refresh whenever the user navigates
  useEffect(() => {
    refreshCount();
    const timer = setInterval(() => { if (!document.hidden) refreshCount(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) refreshCount(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refreshCount, location.pathname]);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      listNotificationsApi(8)
        .then((r) => { setItems(r.notifications); setUnread(r.unreadCount); })
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }
  };

  const openItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.readAt) {
      setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((c) => Math.max(0, c - 1));
      markNotificationReadApi(n._id).catch(() => refreshCount());
    }
    if (n.link) navigate(n.link);
  };

  const markAll = () => {
    setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
    setUnread(0);
    markAllNotificationsReadApi().catch(() => refreshCount());
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={toggle}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-cream-200 hover:bg-navy-700 focus:outline-none focus:ring-2 focus:ring-gold-400"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 01-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-gold-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] bg-white rounded-xl shadow-card-hover border border-navy-100 z-50 overflow-hidden"
          role="menu"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-navy-100">
            <p className="font-semibold text-navy-800 text-sm">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-navy-500 hover:text-navy-800 underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-center text-sm text-navy-400">Loading…</p>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-2xl mb-1" aria-hidden="true">🔔</p>
                <p className="text-sm text-navy-600 font-medium">You're all caught up</p>
                <p className="text-xs text-navy-400 mt-0.5">Updates on site visits and your DSA connection will appear here.</p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n._id}
                  role="menuitem"
                  onClick={() => openItem(n)}
                  className={`w-full text-left px-4 py-3 flex gap-3 border-b border-navy-50 hover:bg-cream-50 transition-colors ${
                    n.readAt ? '' : 'bg-navy-50/60'
                  }`}
                >
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.readAt ? 'bg-transparent' : 'bg-gold-500'}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-navy-800">{n.title}</span>
                    <span className="block text-xs text-navy-500 mt-0.5 line-clamp-2">{n.message}</span>
                    <span className="block text-[11px] text-navy-400 mt-1">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>

          <Link
            to="/notifications"
            className="block text-center text-sm font-medium text-navy-700 hover:bg-cream-50 py-3 border-t border-navy-100"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
