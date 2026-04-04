'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import {
  MessageCircle,
  Clock,
  Settings,
  Send,
  Paperclip,
  Camera,
  User,
  ArrowRight,
  Play,
  Square,
  UserPlus,
  X,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';

// --- Types ---

interface WOEvent {
  id: string;
  work_order_id: string;
  event_type: string;
  content?: string;
  user_id?: string;
  user_name?: string;
  attachments?: { url: string; filename: string; content_type?: string }[];
  metadata?: Record<string, any>;
  created_at: string;
}

interface ActivityFeedProps {
  workOrderId: string;
  tenantId: string;
}

// --- Helpers ---

const SYSTEM_EVENT_TYPES = [
  'status_change',
  'time_start',
  'time_stop',
  'time_pause',
  'time_resume',
  'assignment',
  'priority_change',
  'created',
  'escalation',
];

function isSystemEvent(eventType: string): boolean {
  return SYSTEM_EVENT_TYPES.includes(eventType);
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getEventIcon(eventType: string) {
  switch (eventType) {
    case 'comment':
      return MessageCircle;
    case 'status_change':
      return ArrowRight;
    case 'time_start':
      return Play;
    case 'time_stop':
      return Square;
    case 'time_pause':
    case 'time_resume':
      return Clock;
    case 'assignment':
      return UserPlus;
    case 'priority_change':
      return ArrowRight;
    default:
      return Settings;
  }
}

function getSystemEventText(event: WOEvent): string {
  const meta = event.metadata || {};
  const userName = event.user_name || 'System';

  switch (event.event_type) {
    case 'status_change':
      return `${userName} changed status from ${meta.from || '?'} to ${meta.to || '?'}`;
    case 'time_start':
      return `${userName} started the timer`;
    case 'time_stop':
      return `${userName} stopped the timer`;
    case 'time_pause':
      return `${userName} paused the timer`;
    case 'time_resume':
      return `${userName} resumed the timer`;
    case 'assignment':
      return meta.assigned_to
        ? `${userName} assigned to ${meta.assigned_to_name || meta.assigned_to}`
        : `${userName} unassigned the work order`;
    case 'priority_change':
      return `${userName} changed priority from ${meta.from || '?'} to ${meta.to || '?'}`;
    case 'created':
      return `${userName} created this work order`;
    case 'escalation':
      return `${userName} escalated this work order`;
    default:
      return event.content || `${userName} performed ${event.event_type.replace(/_/g, ' ')}`;
  }
}

// --- Component ---

export function ActivityFeed({ workOrderId, tenantId }: ActivityFeedProps) {
  const [events, setEvents] = useState<WOEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Comment composer state
  const [commentText, setCommentText] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // Fetch events
  const fetchEvents = useCallback(async () => {
    try {
      const data = await api.getWOEvents(workOrderId);
      // Sort newest first
      const sorted = (data || []).sort(
        (a: WOEvent, b: WOEvent) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setEvents(sorted);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  // Initial load + polling every 30s
  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 30000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  // Auto-grow textarea
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCommentText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  // File attachment
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setAttachments((prev) => [...prev, ...Array.from(files)]);
    }
    // Reset input so re-selecting same file works
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Send comment
  const handleSend = async () => {
    const content = commentText.trim();
    if (!content && attachments.length === 0) return;

    setSending(true);
    try {
      // Convert file attachments to base64 for the API
      const attachmentData = await Promise.all(
        attachments.map(async (file) => {
          const base64 = await fileToBase64(file);
          return {
            filename: file.name,
            content_type: file.type,
            data: base64,
          };
        })
      );

      await api.createWOEvent(workOrderId, {
        event_type: 'comment',
        content: content || undefined,
        attachments: attachmentData.length > 0 ? attachmentData : undefined,
      });

      // Clear form and refresh
      setCommentText('');
      setAttachments([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      await fetchEvents();
    } catch (err: any) {
      setError(err.message || 'Failed to send comment');
    } finally {
      setSending(false);
    }
  };

  // Handle Enter to send (Shift+Enter for newline)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="h-5 w-5 text-brand-400" />
        <h3 className="text-sm font-semibold text-foreground">Activity</h3>
        <span className="text-xs text-muted-foreground">
          {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-500/20 text-red-400 border border-red-500/30 text-xs px-3 py-2 rounded-lg mb-3">
          {error}
        </div>
      )}

      {/* Timeline */}
      <div ref={feedRef} className="flex-1 overflow-y-auto space-y-1 mb-4 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading activity...
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No activity yet. Add a comment to get started.
          </div>
        ) : (
          events.map((event) =>
            isSystemEvent(event.event_type) ? (
              <SystemEventRow key={event.id} event={event} />
            ) : (
              <CommentRow key={event.id} event={event} />
            )
          )
        )}
      </div>

      {/* Comment composer */}
      <div className="border-t border-border pt-3 space-y-2">
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 bg-card border border-border rounded-md px-2 py-1 text-xs text-muted-foreground"
              >
                <ImageIcon className="h-3 w-3" />
                <span className="max-w-[120px] truncate">{file.name}</span>
                <button
                  onClick={() => removeAttachment(idx)}
                  className="text-muted-foreground hover:text-foreground ml-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={commentText}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder="Write a comment..."
              rows={1}
              className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-600/50"
            />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 h-9 w-9"
            title="Attach photo"
          >
            <Camera className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={sending || (!commentText.trim() && attachments.length === 0)}
            className="shrink-0 h-9 w-9"
            title="Send comment"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

// --- Sub-components ---

function CommentRow({ event }: { event: WOEvent }) {
  const userName = event.user_name || 'Unknown';

  return (
    <div className="flex gap-3 py-3">
      {/* Avatar */}
      <div className="shrink-0 h-8 w-8 rounded-full bg-brand-600 flex items-center justify-center text-xs font-semibold text-white">
        {getInitials(userName)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">{userName}</span>
          <span className="text-xs text-muted-foreground">{formatTimestamp(event.created_at)}</span>
        </div>

        {event.content && (
          <p className="text-sm text-foreground mt-1 whitespace-pre-wrap break-words">
            {event.content}
          </p>
        )}

        {/* Photo attachments */}
        {event.attachments && event.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {event.attachments.map((att, idx) => (
              <a
                key={idx}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg overflow-hidden border border-border hover:border-brand-400 transition-colors"
              >
                {att.content_type?.startsWith('image/') ? (
                  <img
                    src={att.url}
                    alt={att.filename}
                    className="max-h-48 max-w-[240px] object-cover"
                  />
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2 bg-card text-xs text-muted-foreground">
                    <Paperclip className="h-3 w-3" />
                    {att.filename}
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SystemEventRow({ event }: { event: WOEvent }) {
  const Icon = getEventIcon(event.event_type);

  return (
    <div className="flex items-center gap-2 py-1.5 px-1">
      <div className="shrink-0 h-5 w-5 rounded-full bg-muted flex items-center justify-center">
        <Icon className="h-3 w-3 text-muted-foreground" />
      </div>
      <span className="text-xs text-muted-foreground">{getSystemEventText(event)}</span>
      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
        {formatTimestamp(event.created_at)}
      </span>
    </div>
  );
}

// --- Utils ---

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:...;base64, prefix
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default ActivityFeed;
