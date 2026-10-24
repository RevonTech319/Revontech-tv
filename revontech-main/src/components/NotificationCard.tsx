import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export type NotificationType = 'success' | 'warning' | 'error' | 'info';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  created_at?: any;
  is_read?: boolean;
  type?: NotificationType | string;
  action_url?: string;
}

interface NotificationCardProps {
  notification: AppNotification;
  onClick?: () => void;
}

const TYPE_MAP: Record<
  NotificationType,
  { Icon: typeof Info; iconClass: string; borderClass: string; bgClass: string }
> = {
  success: {
    Icon: CheckCircle2,
    iconClass: 'text-success',
    borderClass: 'border-success/30',
    bgClass: 'bg-success/10',
  },
  warning: {
    Icon: AlertTriangle,
    iconClass: 'text-warning',
    borderClass: 'border-warning/30',
    bgClass: 'bg-warning/10',
  },
  error: {
    Icon: XCircle,
    iconClass: 'text-destructive',
    borderClass: 'border-destructive/30',
    bgClass: 'bg-destructive/10',
  },
  info: {
    Icon: Info,
    iconClass: 'text-info',
    borderClass: 'border-info/30',
    bgClass: 'bg-info/10',
  },
};

function normalizeType(t: string | undefined): NotificationType {
  if (t === 'success' || t === 'warning' || t === 'error' || t === 'info') return t;
  return 'info';
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value.toDate && typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export default function NotificationCard({ notification, onClick }: NotificationCardProps) {
  const type = normalizeType(notification.type as string | undefined);
  const { Icon, iconClass, borderClass, bgClass } = TYPE_MAP[type];
  const createdDate = toDate(notification.created_at);

  return (
    <button
      onClick={onClick}
      type="button"
      className={`w-full text-left glass ${borderClass} rounded-2xl p-4 flex gap-3 items-start press hover-lift tap-safe relative animate-slide-up`}
    >
      {/* Unread indicator */}
      {notification.is_read === false && (
        <span
          aria-label="Haija-somwa"
          className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary animate-pulse"
        />
      )}

      <div
        className={`flex-shrink-0 w-10 h-10 rounded-xl ${bgClass} border ${borderClass} flex items-center justify-center`}
      >
        <Icon className={`w-5 h-5 ${iconClass}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-sm font-black text-foreground line-clamp-1 pr-6">
            {notification.title}
          </h3>
        </div>
        <p className="text-body text-muted-foreground line-clamp-2">
          {notification.message}
        </p>
        {createdDate && (
          <p className="text-caption mt-2">
            {formatDistanceToNow(createdDate, { addSuffix: true })}
          </p>
        )}
      </div>
    </button>
  );
}
