'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTimer } from '@/store/timer';
import { Button } from '@/components/ui/button';
import { Timer, Pause, Play, Square } from 'lucide-react';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export function TimerBar() {
  const router = useRouter();
  const { activeTimer, elapsed, loading, tick, pause, resume, stop } = useTimer();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  // Tick interval
  useEffect(() => {
    if (activeTimer && !activeTimer.isPaused) {
      intervalRef.current = setInterval(() => {
        tick();
      }, 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeTimer?.isPaused, activeTimer?.workOrderId, tick]);

  if (!activeTimer) return null;

  const handleStop = async () => {
    await stop();
    setShowStopConfirm(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 h-12 border-t border-border bg-card/95 backdrop-blur-sm">
      <div className="flex h-full items-center justify-between px-4">
        {/* Left: timer info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-brand-400 flex-shrink-0" />
            <span
              className={`font-mono text-sm font-bold tabular-nums ${
                activeTimer.isPaused ? 'text-yellow-400' : 'text-brand-400'
              }`}
            >
              {formatTime(elapsed)}
            </span>
          </div>
          <span className="text-muted-foreground text-xs hidden sm:inline">|</span>
          <button
            onClick={() => router.push(`/dashboard/maintenance/work-orders/${activeTimer.workOrderId}`)}
            className="text-sm text-foreground hover:text-brand-400 transition-colors truncate max-w-[200px] sm:max-w-[300px]"
            title={activeTimer.workOrderTitle}
          >
            {activeTimer.workOrderTitle}
          </button>
          {activeTimer.isPaused && (
            <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-yellow-400 text-[10px] font-medium flex-shrink-0">
              PAUSED
            </span>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeTimer.isPaused ? (
            <Button size="sm" variant="ghost" onClick={() => resume()} disabled={loading}>
              <Play className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => pause()} disabled={loading}>
              <Pause className="h-3.5 w-3.5" />
            </Button>
          )}
          {showStopConfirm ? (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="destructive" onClick={handleStop} disabled={loading}>
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowStopConfirm(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowStopConfirm(true)}
              disabled={loading}
              className="text-red-400 hover:text-red-300"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
