'use client';

import { create } from 'zustand';
import { api, User } from '@/lib/api';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email: string, password: string, remember: boolean = true) => {
    await api.login(email, password, remember);
    const user = await api.getMe() as User;
    set({ user, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    set({ user: null, isAuthenticated: false, isLoading: false });
    api.logout();
  },

  loadUser: async () => {
    const token = api.getToken();
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }
    try {
      const user = await api.getMe() as User;
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
      api.setToken(null);
    }
  },
}));
