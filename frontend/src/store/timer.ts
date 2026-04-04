'use client';

import { create } from 'zustand';
import { api } from '@/lib/api';

const LS_KEY = 'fb_active_timer';

interface ActiveTimer {
  workOrderId: string;
  workOrderTitle: string;
  timeEntryId: string;
  startedAt: string;
  category: string;
  isPaused: boolean;
  pausedAt: string | null;
}

interface TimerState {
  activeTimer: ActiveTimer | null;
  elapsed: number; // seconds
  loading: boolean;
  loadActiveTimer: () => Promise<void>;
  start: (woId: string, woTitle: string, category?: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: (notes?: string) => Promise<void>;
  tick: () => void;
}

function persistTimer(timer: ActiveTimer | null) {
  if (typeof window === 'undefined') return;
  if (timer) {
    localStorage.setItem(LS_KEY, JSON.stringify(timer));
  } else {
    localStorage.removeItem(LS_KEY);
  }
}

function loadPersistedTimer(): ActiveTimer | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function calcElapsed(timer: ActiveTimer | null): number {
  if (!timer) return 0;
  const start = new Date(timer.startedAt).getTime();
  const now = timer.isPaused && timer.pausedAt
    ? new Date(timer.pausedAt).getTime()
    : Date.now();
  return Math.max(0, Math.floor((now - start) / 1000));
}

export const useTimer = create<TimerState>((set, get) => ({
  activeTimer: null,
  elapsed: 0,
  loading: false,

  loadActiveTimer: async () => {
    // Read from localStorage first for instant UI
    const cached = loadPersistedTimer();
    if (cached) {
      set({ activeTimer: cached, elapsed: calcElapsed(cached) });
    }

    // Then verify with API
    set({ loading: true });
    try {
      const data = await api.getMyTimer() as any;
      if (data && data.work_order_id) {
        const timer: ActiveTimer = {
          workOrderId: data.work_order_id,
          workOrderTitle: data.work_order_title || cached?.workOrderTitle || 'Work Order',
          timeEntryId: data.id,
          startedAt: data.started_at,
          category: data.category || 'wrench',
          isPaused: data.is_paused || false,
          pausedAt: data.paused_at || null,
        };
        persistTimer(timer);
        set({ activeTimer: timer, elapsed: calcElapsed(timer), loading: false });
      } else {
        persistTimer(null);
        set({ activeTimer: null, elapsed: 0, loading: false });
      }
    } catch {
      // Keep cached state if API fails
      set({ loading: false });
    }
  },

  start: async (woId: string, woTitle: string, category: string = 'wrench') => {
    set({ loading: true });
    try {
      const data = await api.startTimer(woId, category) as any;
      const timer: ActiveTimer = {
        workOrderId: woId,
        workOrderTitle: woTitle,
        timeEntryId: data.id,
        startedAt: data.started_at,
        category,
        isPaused: false,
        pausedAt: null,
      };
      persistTimer(timer);
      set({ activeTimer: timer, elapsed: 0, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  pause: async () => {
    const { activeTimer } = get();
    if (!activeTimer) return;
    set({ loading: true });
    try {
      await api.pauseTimer(activeTimer.workOrderId);
      const updated: ActiveTimer = {
        ...activeTimer,
        isPaused: true,
        pausedAt: new Date().toISOString(),
      };
      persistTimer(updated);
      set({ activeTimer: updated, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  resume: async () => {
    const { activeTimer } = get();
    if (!activeTimer) return;
    set({ loading: true });
    try {
      await api.resumeTimer(activeTimer.workOrderId);
      const updated: ActiveTimer = {
        ...activeTimer,
        isPaused: false,
        pausedAt: null,
      };
      persistTimer(updated);
      set({ activeTimer: updated, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  stop: async (notes?: string) => {
    const { activeTimer } = get();
    if (!activeTimer) return;
    set({ loading: true });
    try {
      await api.stopTimer(activeTimer.workOrderId, notes);
      persistTimer(null);
      set({ activeTimer: null, elapsed: 0, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  tick: () => {
    const { activeTimer } = get();
    if (!activeTimer || activeTimer.isPaused) return;
    set((s) => ({ elapsed: s.elapsed + 1 }));
  },
}));
