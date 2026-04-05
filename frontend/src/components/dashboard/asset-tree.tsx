'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Factory, Layers, Cog, Cpu, CalendarCheck, Wrench,
  AlertTriangle, FileText, ChevronRight, Search,
  ChevronsUpDown, Minimize2, Maximize2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Machine {
  id: string;
  name: string;
  asset_tag: string | null;
  status: string;
  machine_type: string | null;
}

interface SensorNode {
  id: string;
  machine_id: string | null;
  node_type: string;
  is_active: boolean;
}

interface TreeNodeData {
  id: string;
  label: string;
  icon: React.ElementType;
  href?: string;
  status?: string;
  children?: TreeNodeData[];
}

const statusColor: Record<string, string> = {
  active: 'bg-green-500',
  idle: 'bg-gray-500',
  alarm: 'bg-red-500',
  maintenance: 'bg-amber-500',
  inactive: 'bg-gray-500',
};

function TreeNode({
  node,
  level,
  expanded,
  onToggle,
  searchQuery,
}: {
  node: TreeNodeData;
  level: number;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  searchQuery: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded[node.id] ?? (level === 0);
  const isActive = node.href && pathname === node.href;
  const Icon = node.icon;

  // Filter children by search
  const filteredChildren = node.children?.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const matchesSelf = c.label.toLowerCase().includes(q);
    const matchesChild = c.children?.some((gc) => gc.label.toLowerCase().includes(q));
    return matchesSelf || matchesChild;
  });

  // Hide if search active and no match in this subtree
  if (searchQuery && level > 0) {
    const q = searchQuery.toLowerCase();
    const matchesSelf = node.label.toLowerCase().includes(q);
    const hasMatchingChildren = filteredChildren && filteredChildren.length > 0;
    if (!matchesSelf && !hasMatchingChildren) return null;
  }

  return (
    <div role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined}>
      <div
        className={cn(
          'flex items-center gap-1.5 py-1 px-2 rounded-md text-sm cursor-pointer transition-colors group',
          isActive ? 'bg-brand-600/20 text-brand-400' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => {
          if (hasChildren) onToggle(node.id);
          if (node.href) router.push(node.href);
        }}
      >
        {hasChildren ? (
          <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', isExpanded && 'rotate-90')} />
        ) : (
          <span className="w-3.5" />
        )}
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate flex-1 text-xs">{node.label}</span>
        {node.status && (
          <span className={cn('w-2 h-2 rounded-full shrink-0', statusColor[node.status] || 'bg-gray-500')} />
        )}
      </div>
      {hasChildren && isExpanded && (
        <div role="group">
          {(filteredChildren || node.children)!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              expanded={expanded}
              onToggle={onToggle}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AssetTree() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [nodes, setNodes] = useState<SensorNode[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ root: true });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getMachines() as Promise<Machine[]>,
      api.getNodes() as Promise<SensorNode[]>,
    ])
      .then(([m, n]) => { setMachines(m); setNodes(n); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const onToggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const collapseAll = () => {
    setExpanded({ root: true });
  };

  const expandAll = () => {
    const all: Record<string, boolean> = { root: true };
    const addAll = (node: TreeNodeData) => {
      all[node.id] = true;
      node.children?.forEach(addAll);
    };
    // We'll build tree first, then expand — for now just set all machine nodes
    machines.forEach((m) => {
      all[`m-${m.id}`] = true;
      all[`m-${m.id}-sensors`] = true;
    });
    setExpanded(all);
  };

  if (loading) return <div className="px-3 py-2 text-xs text-muted-foreground">Loading...</div>;

  // Build tree structure
  const tree: TreeNodeData = {
    id: 'root',
    label: 'Factory',
    icon: Factory,
    href: '/dashboard',
    children: machines.map((machine) => {
      const machineNodes = nodes.filter((n) => n.machine_id === machine.id);
      return {
        id: `m-${machine.id}`,
        label: machine.asset_tag || machine.name,
        icon: Cog,
        href: `/dashboard/machines/${machine.id}`,
        status: machine.status,
        children: [
          ...(machineNodes.length > 0
            ? [{
                id: `m-${machine.id}-sensors`,
                label: `Sensors (${machineNodes.length})`,
                icon: Cpu,
                href: '/dashboard/sensors',
                children: machineNodes.map((n) => ({
                  id: `n-${n.id}`,
                  label: `${n.id} (${n.node_type})`,
                  icon: Cpu,
                  status: n.is_active ? 'active' : 'inactive',
                })),
              }]
            : []),
          {
            id: `m-${machine.id}-pm`,
            label: 'PM Schedules',
            icon: CalendarCheck,
            href: '/dashboard/maintenance',
          },
          {
            id: `m-${machine.id}-wo`,
            label: 'Work Orders',
            icon: Wrench,
            href: '/dashboard/maintenance',
          },
          {
            id: `m-${machine.id}-alerts`,
            label: 'Alerts',
            icon: AlertTriangle,
            href: '/dashboard/maintenance',
          },
          {
            id: `m-${machine.id}-docs`,
            label: 'Documents',
            icon: FileText,
            href: `/dashboard/machines/${machine.id}`,
          },
        ],
      };
    }),
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-2 pb-1 space-y-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assets..."
            className="h-7 text-xs pl-7 bg-secondary border-0"
          />
        </div>
        <div className="flex gap-1">
          <button
            onClick={expandAll}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground rounded hover:bg-accent transition-colors"
            title="Expand all"
          >
            <Maximize2 className="h-3 w-3" /> Expand
          </button>
          <button
            onClick={collapseAll}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground rounded hover:bg-accent transition-colors"
            title="Collapse all"
          >
            <Minimize2 className="h-3 w-3" /> Collapse
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-1 py-1" role="tree">
        <TreeNode
          node={tree}
          level={0}
          expanded={expanded}
          onToggle={onToggle}
          searchQuery={search}
        />
      </div>
    </div>
  );
}
