import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, addDoc, deleteDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/AdminLayout';
import { Bell, Send, Trash2, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type NotifType = 'info' | 'success' | 'warning' | 'error';

interface Notification {
  id: string;
  title: string;
  message: string;
  type?: NotifType;
  created_at: any;
}

const TYPE_OPTIONS: Array<{
  value: NotifType;
  label: string;
  Icon: typeof Info;
  color: string;
  bg: string;
}> = [
  { value: 'info', label: 'Info', Icon: Info, color: 'text-info', bg: 'bg-info/10 border-info/30' },
  { value: 'success', label: 'Success', Icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10 border-green-500/30' },
  { value: 'warning', label: 'Warning', Icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  { value: 'error', label: 'Error', Icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/30' },
];

export default function AdminNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<NotifType>('info');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { fetchNotifications(); }, []);

  const fetchNotifications = async () => {
    try {
      const q = query(collection(db, 'notifications'), orderBy('created_at', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      setNotifications(data);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    try {
      // 1. Save notification to Firestore
      await addDoc(collection(db, 'notifications'), {
        title: title.trim(),
        message: message.trim(),
        type,
        created_at: serverTimestamp()
      });

      // 2. Send push notification via OneSignal
      try {
        const settingsRef = doc(db, 'settings', 'general_settings');
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          const s = settingsSnap.data();
          const appId = s.onesignal_app_id;
          const restApiKey = s.onesignal_rest_api_key;
          if (appId && restApiKey) {
            await fetch('https://onesignal.com/api/v1/notifications', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Authorization': `Basic ${restApiKey}`
              },
              body: JSON.stringify({
                app_id: appId,
                included_segments: ['All'],
                headings: { en: title.trim() },
                contents: { en: message.trim() }
              })
            });
          }
        }
      } catch (pushErr) {
        console.error("OneSignal push error (non-blocking):", pushErr);
      }

      setTitle('');
      setMessage('');
      setMsg('Arifa imetumwa kwa watumiaji wote!');
      setTimeout(() => setMsg(''), 3000);
      await fetchNotifications();
    } catch (error) {
      console.error("Error sending notification:", error);
    }
    setSending(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Futa arifa hii?')) return;
    try {
      await deleteDoc(doc(db, 'notifications', id));
      await fetchNotifications();
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-primary/10 rounded-2xl">
          <Bell className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-black text-foreground">Tuma Arifa</h1>
          <p className="text-xs text-muted-foreground">Arifa zitaonekana kwa watumiaji wote</p>
        </div>
      </div>

      {/* Compose */}
      <div className="cyber-card rounded-2xl p-5 mb-6">
        <h2 className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-4">Arifa Mpya</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-foreground mb-1 block font-bold">Kichwa cha Arifa</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Habari mpya..." className="bg-muted border-border text-foreground" />
          </div>
          <div>
            <label className="text-xs text-foreground mb-1 block font-bold">Ujumbe</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Andika ujumbe hapa..."
              rows={3}
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-foreground mb-1 block font-bold">Aina ya Arifa (Type)</label>
            <div className="grid grid-cols-4 gap-2">
              {TYPE_OPTIONS.map((opt) => {
                const selected = type === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] font-black uppercase transition-all ${
                      selected ? `${opt.bg} ${opt.color} border-2` : 'bg-muted border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <opt.Icon className="w-4 h-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Aina huhamishwa kwa website — kila aina ina rangi na icon tofauti.
            </p>
          </div>
        </div>
        {msg && <p className="text-sm text-primary mt-2">{msg}</p>}
        <Button
          onClick={handleSend}
          disabled={sending || !title.trim() || !message.trim()}
          className="w-full mt-4 bg-primary text-primary-foreground glow-primary font-black tracking-wider"
        >
          <Send className="w-4 h-4 mr-2" />
          {sending ? 'INATUMA...' : 'TUMA KWA WATUMIAJI WOTE'}
        </Button>
      </div>

      {/* History */}
      <div>
        <h2 className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-3">Historia ya Arifa</h2>
        {notifications.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Hakuna arifa bado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const date = n.created_at?.toDate ? n.created_at.toDate() : new Date(n.created_at);
              const typeMeta = TYPE_OPTIONS.find((t) => t.value === (n.type as NotifType)) || TYPE_OPTIONS[0];
              const TypeIcon = typeMeta.Icon;
              return (
                <div key={n.id} className="cyber-card rounded-xl p-3 flex items-start gap-3">
                  <div className={`flex items-center gap-2 p-2 rounded-lg flex-shrink-0 border ${typeMeta.bg}`}>
                    <TypeIcon className={`w-4 h-4 ${typeMeta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-foreground">{n.title}</p>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${typeMeta.color} ${typeMeta.bg} border`}>
                        {typeMeta.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">{date.toLocaleString()}</p>
                  </div>
                  <button onClick={() => handleDelete(n.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
