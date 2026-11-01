import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import CustomerMobileNav from '../../components/layout/CustomerMobileNav';
import EmptyState, { SectionError } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { listNotificationsApi, markAllNotificationsReadApi, markNotificationReadApi } from '../../api/notifications.api';
import { timeAgo } from '../../utils/format';
import type { AppNotification } from '../../types';

type Payload = { notifications: AppNotification[]; unreadCount: number };

const ICONS: Record<string, string> = {
  VISIT_REQUESTED: '📅',
  VISIT_UPDATED: '📅',
  LOAN_REQUESTED: '📄',
  LOAN_UPDATED: '📄',
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const data = useAsync<Payload>(() => listNotificationsApi(100), []);

  const list = data.data?.notifications ?? [];
  const unread = data.data?.unreadCount ?? 0;

  const patch = (fn: (n: AppNotification) => AppNotification, unreadDelta: (prev: number) => number) =>
    data.setData((prev) => (prev ? { notifications: prev.notifications.map(fn), unreadCount: unreadDelta(prev.unreadCount) } : prev));

  const open = (n: AppNotification) => {
    if (!n.readAt) {
      patch((x) => (x._id === n._id ? { ...x, readAt: new Date().toISOString() } : x), (c) => Math.max(0, c - 1));
      markNotificationReadApi(n._id).catch(() => data.reload());
    }
    if (n.link) navigate(n.link);
  };

  const markAll = () => {
    patch((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() }), () => 0);
    markAllNotificationsReadApi().catch(() => data.reload());
  };

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />
      <main className="page-container py-8 space-y-6 pb-28 sm:pb-12 max-w-3xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-navy-900">Notifications</h1>
            <p className="text-navy-500 mt-1">{unread > 0 ? `${unread} unread` : 'You\'re all caught up'}</p>
          </div>
          {unread > 0 && <button className="btn-secondary text-xs px-4 py-2" onClick={markAll}>Mark all as read</button>}
        </div>

        {data.loading ? (
          <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        ) : data.error ? (
          <SectionError message={data.error} onRetry={data.reload} />
        ) : list.length === 0 ? (
          <EmptyState icon="🔔" title="No notifications yet" message="Updates about site visits and DSA connections will appear here." />
        ) : (
          <ul className="card divide-y divide-navy-100 overflow-hidden">
            {list.map((n) => (
              <li key={n._id}>
                <button
                  onClick={() => open(n)}
                  className={`w-full text-left px-5 py-4 flex gap-4 hover:bg-cream-50 transition-colors ${n.readAt ? '' : 'bg-navy-50/60'}`}
                >
                  <span className="text-xl mt-0.5" aria-hidden="true">{ICONS[n.type] ?? '🔔'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`text-sm ${n.readAt ? 'text-navy-700' : 'font-semibold text-navy-900'}`}>{n.title}</span>
                      {!n.readAt && <span className="w-2 h-2 rounded-full bg-gold-500" aria-label="Unread" />}
                    </span>
                    <span className="block text-sm text-navy-500 mt-0.5">{n.message}</span>
                    <span className="block text-xs text-navy-400 mt-1.5">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      {user?.role === 'CUSTOMER' && <CustomerMobileNav />}
    </div>
  );
}
