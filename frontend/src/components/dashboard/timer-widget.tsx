'use client';

import { useState } from 'react';
import { useTimer } from '@/store/timer';
import { Button } from '@/components/ui/button';
import { Play, Pause, Square, Wrench, Car, Clock3, FileText } from 'lucide-react';

const CATEGORIES = [
  { value: 'wrench', label: 'Wrench time', icon: Wrench },
  { value: 'travel', label: 'Travel', icon: Car },
  { value: 'waiting', label: 'Waiting', icon: Clock3 },
  { value: 'admin', label: 'Admin', icon: FileText },
] as const;

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

interface TimerWidgetProps {
  workOrderId: string;
  workOrderTitle: string;
}

export function TimerWidget({ workOrderId, workOrderTitle }: TimerWidgetProps) {
  const { activeTimer, elapsed, loading, start, pause, resume, stop } = useTimer();
  const [category, setCategory] = useState<string>('wrench');
  const [showStopForm, setShowStopForm] = useState(false);
  const [notes, setNotes] = useState('');

  const isActiveForThis = activeTimer?.workOrderId === workOrderId;
  const isActiveForOther = activeTimer !== null && !isActiveForThis;

  const handleStart = async () => {
    await start(workOrderId, workOrderTitle, category);
  };

  const handlePause = async () => {
    await pause();
  };

  const handleResume = async () => {
    await resume();
  };

  const handleStop = async () => {
    await stop(notes || undefined);
    setShowStopForm(false);
    setNotes('');
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Time Tracking</h3>
        {isActiveForThis && (
          <span className="text-2xl font-mono font-bold text-brand-400 tabular-nums">
            {formatTime(elapsed)}
          </span>
        )}
      </div>

      {/* Category selector - only show when no timer is running for this WO */}
      {!isActiveForThis && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Category</label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${
                    category === cat.value
                      ? 'border-brand-600 bg-brand-600/10 text-brand-400'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active timer info */}
      {isActiveForThis && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {CATEGORIES.find((c) => c.value === activeTimer.category)?.icon &&
            (() => {
              const Icon = CATEGORIES.find((c) => c.value === activeTimer.category)!.icon;
              return <Icon className="h-3.5 w-3.5" />;
            })()}
          <span className="capitalize">{activeTimer.category}</span>
          {activeTimer.isPaused && (
            <span className="ml-2 rounded bg-yellow-500/20 px-1.5 py-0.5 text-yellow-400 text-[10px] font-medium">
              PAUSED
            </span>
          )}
        </div>
      )}

      {/* Stop form */}
      {showStopForm && isActiveForThis && (
        <div className="space-y-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)..."
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-600 resize-none"
            rows={2}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={handleStop} disabled={loading}>
              <Square className="h-3.5 w-3.5 mr-1" />
              Confirm Stop
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowStopForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!showStopForm && (
        <div className="flex gap-2">
          {!isActiveForThis && (
            <Button
              size="sm"
              onClick={handleStart}
              disabled={loading || isActiveForOther}
            >
              <Play className="h-3.5 w-3.5 mr-1" />
              Start Timer
            </Button>
          )}
          {isActiveForThis && !activeTimer.isPaused && (
            <Button size="sm" variant="secondary" onClick={handlePause} disabled={loading}>
              <Pause className="h-3.5 w-3.5 mr-1" />
              Pause
            </Button>
          )}
          {isActiveForThis && activeTimer.isPaused && (
            <Button size="sm" onClick={handleResume} disabled={loading}>
              <Play className="h-3.5 w-3.5 mr-1" />
              Resume
            </Button>
          )}
          {isActiveForThis && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowStopForm(true)}
              disabled={loading}
            >
              <Square className="h-3.5 w-3.5 mr-1" />
              Stop
            </Button>
          )}
        </div>
      )}

      {/* Warning when timer is active on another WO */}
      {isActiveForOther && (
        <p className="text-xs text-yellow-400">
          Timer is running on another work order. Stop it first before starting here.
        </p>
      )}
    </div>
  );
}
