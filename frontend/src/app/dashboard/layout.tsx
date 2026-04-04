'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthGuard } from '@/components/auth-guard';
import { useAuth } from '@/store/auth';
import { useState } from 'react';

const TimerBarWrapper = dynamic(
  () => import('@/components/dashboard/timer-bar').then((mod) => mod.TimerBar),
  { ssr: false, loading: () => null }
);
import {
  Factory, Cog, Cpu, Wrench, Calendar, Zap, BarChart3, Settings, LogOut,
  Map, FolderTree, Package, Menu, X, Users, QrCode,
} from 'lucide-react';

const navigation = [
  { name: 'Overview', href: '/dashboard', icon: Factory },
  { name: 'Scan', href: '/dashboard/scan', icon: QrCode },
  { name: 'Floor Plan', href: '/dashboard/floor-plan', icon: Map },
  { name: 'Assets', href: '/dashboard/assets', icon: FolderTree },
  { name: 'Machines', href: '/dashboard/machines', icon: Cog },
  { name: 'Sensors', href: '/dashboard/sensors', icon: Cpu },
  { name: 'Maintenance', href: '/dashboard/maintenance', icon: Wrench },
  { name: 'Scheduling', href: '/dashboard/scheduling', icon: Calendar },
  { name: 'Parts', href: '/dashboard/parts', icon: Package },
  { name: 'Energy', href: '/dashboard/energy', icon: Zap },
  { name: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
  { name: 'Users', href: '/dashboard/users', icon: Users, adminOnly: true },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
] as const;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <DashboardShell>{children}</DashboardShell>
    </AuthGuard>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-[#111] border-b border-border px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-brand-400">FactoryBrain</h1>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-muted-foreground hover:text-foreground">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/60" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:static z-30 md:z-auto w-64 h-full bg-[#111] border-r border-border flex-col transition-transform md:flex ${mobileOpen ? 'flex' : 'hidden md:flex'}`}>
        <div className="p-6 border-b border-border">
          <h1 className="text-xl font-bold text-brand-400">FactoryBrain</h1>
          <p className="text-xs text-muted-foreground mt-1">v0.1.0</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navigation
            .filter((item) => !('adminOnly' in item && item.adminOnly) || user?.role === 'admin' || user?.role === 'superadmin')
            .map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-brand-600/20 text-brand-400 font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-600/20 flex items-center justify-center text-brand-400 text-sm font-medium">
              {user?.name?.charAt(0).toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.name || 'Loading...'}
              </p>
              <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
            </div>
            <button
              onClick={logout}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        <div className="p-4 md:p-8 pb-20">{children}</div>
      </main>

      {/* Persistent timer bar — shows when a timer is active */}
      <TimerBarWrapper />
    </div>
  );
}
