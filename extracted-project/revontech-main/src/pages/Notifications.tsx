import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import NotificationCard, { AppNotification } from '@/components/NotificationCard';

interface Notification extends AppNotification {
  is_deleted?: boolean;
}

export default function Notifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchNotifications();
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const allNotifsQuery = query(
        collection(db, 'notifications'),
        orderBy('created_at', 'desc'),
        limit(50)
      );
      const allNotifsSnap = await getDocs(allNotifsQuery);
      const allNotifs = allNotifsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const userNotifsQuery = query(
        collection(db, 'user_notifications'),
        where('user_id', '==', user.uid)
      );
      const userNotifsSnap = await getDocs(userNotifsQuery);
      const userNotifs = userNotifsSnap.docs.map((d) => d.data());

      const statusMap = new Map(
        userNotifs.map((un: any) => [
          un.notification_id,
          { is_read: un.is_read, is_deleted: un.is_deleted },
        ])
      );

      const processed = (allNotifs as any[])
        .map((n) => {
          const status = statusMap.get(n.id) || { is_read: false, is_deleted: false };
          return {
            ...n,
            is_read: status.is_read,
            is_deleted: status.is_deleted,
          };
        })
        .filter((n) => !n.is_deleted);

      // Unread first, then newest first
      processed.sort((a, b) => {
        if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
        const at = a.created_at?.toDate
          ? a.created_at.toDate().getTime()
          : new Date(a.created_at || 0).getTime();
        const bt = b.created_at?.toDate
          ? b.created_at.toDate().getTime()
          : new Date(b.created_at || 0).getTime();
        return bt - at;
      });

      setNotifications(processed);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
    setLoading(false);
  };

  const markRead = async (n: Notification) => {
    if (!user || n.is_read) return;
    try {
      const unId = `${user.uid}_${n.id}`;
      await setDoc(
        doc(db, 'user_notifications', unId),
        {
          user_id: user.uid,
          notification_id: n.id,
          is_read: true,
          is_deleted: false,
        },
        { merge: true }
      );
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      );
    } catch (err) {
      console.error('mark read failed:', err);
    }
  };

  const handleClick = (n: Notification) => {
    markRead(n);
    if (n.action_url) {
      if (/^https?:\/\//i.test(n.action_url)) {
        window.open(n.action_url, '_blank', 'noreferrer');
      } else {
        window.location.href = n.action_url;
      }
    }
  };

  const markAllRead = async () => {
    if (!user || notifications.length === 0) return;
    try {
      for (const n of notifications) {
        if (!n.is_read) {
          const unId = `${user.uid}_${n.id}`;
          await setDoc(
            doc(db, 'user_notifications', unId),
            {
              user_id: user.uid,
              notification_id: n.id,
              is_read: true,
              is_deleted: false,
            },
            { merge: true }
          );
        }
      }
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Error marking all read:', error);
    }
  };

  const deleteAll = async () => {
    if (!user || !confirm('Futa historia yote ya arifa?')) return;
    try {
      for (const n of notifications) {
        const unId = `${user.uid}_${n.id}`;
        await setDoc(
          doc(db, 'user_notifications', unId),
          {
            user_id: user.uid,
            notification_id: n.id,
            is_deleted: true,
          },
          { merge: true }
        );
      }
      setNotifications([]);
    } catch (error) {
      console.error('Error deleting all:', error);
    }
  };

  const hasUnread = notifications.some((n) => !n.is_read);

  return (
    <div className="min-h-screen pb-20">
      <Header />

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6 gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 glass rounded-2xl">
              <Bell className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-h1 text-foreground">Arifa Zako</h1>
          </div>
          <div className="flex items-center gap-1">
            {hasUnread && (
              <button
                onClick={markAllRead}
                className="text-primary hover:bg-primary/10 text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 press tap-safe transition-colors"
              >
                <CheckCheck className="w-4 h-4" />
                Soma Zote
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={deleteAll}
                className="text-destructive hover:bg-destructive/10 text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 press tap-safe transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Futa Zote
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl skeleton" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <div className="w-20 h-20 rounded-full glass flex items-center justify-center mb-4">
              <Bell className="w-10 h-10 text-muted-foreground opacity-40" />
            </div>
            <h3 className="text-h2 text-foreground">Hakuna Arifa</h3>
            <p className="text-body text-muted-foreground mt-1">
              Hujapokea arifa yoyote kwa sasa.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {notifications.map((n) => (
              <li key={n.id}>
                <NotificationCard notification={n} onClick={() => handleClick(n)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
