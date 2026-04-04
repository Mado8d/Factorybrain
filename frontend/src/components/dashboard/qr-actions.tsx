'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Button } from '@/components/ui/button';
import {
  X,
  ClipboardList,
  PlusCircle,
  AlertTriangle,
  History,
  FileText,
  Activity,
} from 'lucide-react';

interface Machine {
  id: string;
  name: string;
  asset_tag: string | null;
  status: string;
  machine_type: string | null;
}

interface QrActionsProps {
  machine: Machine;
  onClose: () => void;
}

const statusConfig: Record<string, { color: string; dot: string; label: string }> = {
  active: { color: 'bg-green-500/20 text-green-400', dot: 'bg-green-400', label: 'Running' },
  idle: { color: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground', label: 'Idle' },
  alarm: { color: 'bg-red-500/20 text-red-400', dot: 'bg-red-400', label: 'Alarm' },
  maintenance: { color: 'bg-amber-500/20 text-amber-400', dot: 'bg-amber-400', label: 'Maintenance' },
  inactive: { color: 'bg-muted text-muted-foreground/50', dot: 'bg-muted-foreground/50', label: 'Inactive' },
};

export function QrActions({ machine, onClose }: QrActionsProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [woCount, setWoCount] = useState<number | null>(null);

  // Slide-up animation
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Fetch open work order count for this machine
  useEffect(() => {
    api.getWorkOrders()
      .then((orders) => {
        const orderList = orders as any[];
        const count = orderList.filter(
          (wo) => wo.machine_id === machine.id && wo.status !== 'closed' && wo.status !== 'cancelled'
        ).length;
        setWoCount(count);
      })
      .catch(() => setWoCount(null));
  }, [machine.id]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const navigate = (path: string) => {
    handleClose();
    setTimeout(() => router.push(path), 350);
  };

  const config = statusConfig[machine.status] || statusConfig.inactive;

  const actions = [
    {
      icon: ClipboardList,
      label: 'Work Orders',
      badge: woCount,
      onClick: () => navigate(`/dashboard/maintenance?machine_id=${machine.id}`),
    },
    {
      icon: PlusCircle,
      label: 'New Work Order',
      onClick: () => navigate(`/dashboard/maintenance?new=1&machine_id=${machine.id}`),
    },
    {
      icon: AlertTriangle,
      label: 'Report Issue',
      onClick: () => navigate(`/request/${user?.tenant_id || 'default'}?machine_id=${machine.id}`),
    },
    {
      icon: History,
      label: 'History',
      onClick: () => navigate(`/dashboard/machines/${machine.id}`),
    },
    {
      icon: FileText,
      label: 'Documents',
      onClick: () => navigate(`/dashboard/machines/${machine.id}#documents`),
    },
    {
      icon: Activity,
      label: 'Telemetry',
      onClick: () => navigate(`/dashboard/machines/${machine.id}#telemetry`),
    },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />

      {/* Bottom sheet */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 transform transition-transform duration-300 ease-out ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="bg-card border-t border-border rounded-t-2xl max-h-[80vh] overflow-y-auto">
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>

          {/* Header */}
          <div className="flex items-start justify-between px-5 pb-4 pt-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-foreground truncate">{machine.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
                  {config.label}
                </span>
                {machine.machine_type && (
                  <span className="text-xs text-muted-foreground">{machine.machine_type}</span>
                )}
                {machine.asset_tag && (
                  <span className="text-xs text-muted-foreground">{machine.asset_tag}</span>
                )}
              </div>
            </div>
            <button
              onClick={handleClose}
              className="ml-3 p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Action grid */}
          <div className="grid grid-cols-2 gap-3 px-5 pb-6">
            {actions.map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                className="relative flex flex-col items-center gap-2 p-4 rounded-xl bg-[#111] border border-border hover:border-brand-600/50 hover:bg-brand-600/5 transition-colors text-center group"
              >
                <action.icon className="h-6 w-6 text-brand-400 group-hover:text-brand-300 transition-colors" />
                <span className="text-sm font-medium text-foreground">{action.label}</span>
                {action.badge != null && action.badge > 0 && (
                  <span className="absolute top-2.5 right-2.5 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold">
                    {action.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
