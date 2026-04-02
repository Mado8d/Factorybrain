'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthGuard } from '@/components/auth-guard';
import { useAuth } from '@/store/auth';
import { AssetTree } from '@/components/dashboard/asset-tree';
import {
  Factory, Cog, Cpu, Wrench, Calendar, Zap, BarChart3, Settings, LogOut,
  Map, ChevronDown, ChevronRight,
} from 'lucide-react';

const navigation = [
  { name: 'Overview', href: '/dashboard', icon: Factory },
  { name: 'Floor Plan', href: '/dashboard/floor-plan', icon: Map },
  { name: 'Machines', href: '/dashboard/machines', icon: Cog },
  { name: 'Sensors', href: '/dashboard/sensors', icon: Cpu },
  { name: 'Maintenance', href: '/dashboard/maintenance', icon: Wrench },
  { name: 'Scheduling', href: '/dashboard/scheduling', icon: Calendar },
  { name: 'Energy', href: '/dashboard/energy', icon: Zap },
  { name: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

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
  const [treeOpen, setTreeOpen] = useState(true);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 bg-[#111] border-r border-border flex-col">
        <div className="p-6 border-b border-border">
          <h1 className="text-xl font-bold text-brand-400">FactoryBrain</h1>
          <p className="text-xs text-muted-foreground mt-1">v0.1.0</p>
        </div>

        {/* Navigation */}
        <nav className="px-3 py-3 space-y-0.5 border-b border-border">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
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

        {/* Asset Tree */}
        <div className="flex-1 flex flex-col min-h-0">
          <button
            onClick={() => setTreeOpen(!treeOpen)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {treeOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Asset Navigator
          </button>
          {treeOpen && (
            <div className="flex-1 overflow-hidden">
              <AssetTree />
            </div>
          )}
        </div>

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

      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
