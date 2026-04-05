'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, Maximize, Cog, Lock, Unlock, ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Machine {
  id: string;
  name: string;
  asset_tag: string | null;
  status: string;
  machine_type: string | null;
  specifications: Record<string, any>;
}

interface TelemetryData {
  [nodeId: string]: {
    node_type: string;
    vib_rms_x: number | null;
    anomaly_score: number | null;
    temperature_1: number | null;
    grid_power_w: number | null;
  };
}

const statusColor: Record<string, string> = {
  active: 'border-green-500 bg-green-500/20',
  idle: 'border-gray-500 bg-gray-500/20',
  alarm: 'border-red-500 bg-red-500/20',
  maintenance: 'border-amber-500 bg-amber-500/20',
  inactive: 'border-gray-600 bg-gray-600/20',
};

const statusDot: Record<string, string> = {
  active: 'bg-green-500',
  idle: 'bg-gray-500',
  alarm: 'bg-red-500',
  maintenance: 'bg-amber-500',
  inactive: 'bg-gray-600',
};

const CANVAS_W = 1600;
const CANVAS_H = 1000;

export default function FloorPlanPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'superadmin';

  const [machines, setMachines] = useState<Machine[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryData>({});
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hoveredMachine, setHoveredMachine] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [bgImage, setBgImage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const showFeedback = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(''), 2000); };

  useEffect(() => {
    const saved = localStorage.getItem('fb_floorplan_bg');
    if (saved) setBgImage(saved);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [m, t] = await Promise.all([
          api.getMachines() as Promise<Machine[]>,
          api.getLatestTelemetry() as Promise<TelemetryData>,
        ]);
        // Assign default positions to machines without floor_position
        const withPos = m.map((machine, i) => {
          if (!machine.specifications?.floor_position) {
            const col = i % 4;
            const row = Math.floor(i / 4);
            machine.specifications = {
              ...machine.specifications,
              floor_position: { x: 100 + col * 350, y: 100 + row * 250 },
            };
          }
          return machine;
        });
        setMachines(withPos);
        setTelemetry(t);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();

    // Refresh telemetry every 30s
    const interval = setInterval(async () => {
      try {
        const t = await api.getLatestTelemetry() as TelemetryData;
        setTelemetry(t);
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const getPosition = (machine: Machine) => {
    return machine.specifications?.floor_position || { x: 100, y: 100 };
  };

  const handlePointerDown = useCallback((e: React.PointerEvent, machineId: string) => {
    if (!editMode) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = (e.target as HTMLElement).closest('[data-machine-id]')?.getBoundingClientRect();
    if (!rect) return;
    setDragging(machineId);
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [editMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !canvasRef.current) return;
    e.stopPropagation();
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const scale = canvasRect.width / CANVAS_W;
    const newX = Math.max(0, Math.min(CANVAS_W - 120, (e.clientX - canvasRect.left) / scale - dragOffset.x / scale));
    const newY = Math.max(0, Math.min(CANVAS_H - 80, (e.clientY - canvasRect.top) / scale - dragOffset.y / scale));

    setMachines((prev) =>
      prev.map((m) =>
        m.id === dragging
          ? { ...m, specifications: { ...m.specifications, floor_position: { x: Math.round(newX), y: Math.round(newY) } } }
          : m
      )
    );
  }, [dragging, dragOffset]);

  const handlePointerUp = useCallback(async () => {
    if (!dragging) return;
    const machine = machines.find((m) => m.id === dragging);
    if (machine) {
      try {
        await api.updateMachine(machine.id, {
          specifications: machine.specifications,
        });
        showFeedback('Position saved');
      } catch { showFeedback('Failed to save position'); }
    }
    setDragging(null);
  }, [dragging, machines]);

  const getMachineNodeData = (machine: Machine) => {
    const entry = Object.entries(telemetry).find(([nodeId]) =>
      nodeId.toLowerCase().includes(machine.asset_tag?.toLowerCase() ?? '')
    );
    return entry?.[1];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-6rem)]">
      {feedback && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-bottom-2">
          {feedback}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Floor Plan</h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <label className="cursor-pointer">
                <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const data = reader.result as string;
                    setBgImage(data);
                    localStorage.setItem('fb_floorplan_bg', data);
                    showFeedback('Background uploaded');
                  };
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }} />
                <span className="inline-flex items-center gap-1 px-3 h-8 text-xs rounded-lg border border-border bg-transparent hover:bg-accent text-foreground cursor-pointer transition-colors">
                  <ImagePlus className="h-3.5 w-3.5" />Background
                </span>
              </label>
              {bgImage && (
                <Button size="sm" variant="ghost" onClick={() => { setBgImage(null); localStorage.removeItem('fb_floorplan_bg'); showFeedback('Background removed'); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                size="sm"
                variant={editMode ? 'default' : 'outline'}
                onClick={() => setEditMode(!editMode)}
              >
                {editMode ? <Unlock className="h-3.5 w-3.5 mr-1" /> : <Lock className="h-3.5 w-3.5 mr-1" />}
                {editMode ? 'Editing' : 'Edit Layout'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="bg-card rounded-xl border border-border overflow-hidden" style={{ height: 'calc(100% - 3rem)' }}>
        <TransformWrapper
          disabled={editMode && !!dragging}
          minScale={0.3}
          maxScale={3}
          initialScale={0.8}
          centerOnInit
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              {/* Zoom controls */}
              <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
                <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => zoomIn()}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => zoomOut()}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => resetTransform()}>
                  <Maximize className="h-4 w-4" />
                </Button>
              </div>

              <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                <div
                  ref={canvasRef}
                  className="relative"
                  style={{
                    width: CANVAS_W,
                    height: CANVAS_H,
                    backgroundImage: bgImage ? `url(${bgImage})` : 'radial-gradient(circle, #2a2a3e 1px, transparent 1px)',
                    backgroundSize: bgImage ? 'cover' : '30px 30px',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                  }}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  {machines.map((machine) => {
                    const pos = getPosition(machine);
                    const sc = statusColor[machine.status] || statusColor.inactive;
                    const sd = statusDot[machine.status] || statusDot.inactive;
                    const nodeData = getMachineNodeData(machine);
                    const isHovered = hoveredMachine === machine.id;

                    return (
                      <div
                        key={machine.id}
                        data-machine-id={machine.id}
                        className={`absolute select-none transition-shadow ${editMode ? 'cursor-move' : 'cursor-pointer'} ${dragging === machine.id ? 'z-20' : 'z-10'}`}
                        style={{ left: pos.x, top: pos.y }}
                        onPointerDown={(e) => handlePointerDown(e, machine.id)}
                        onClick={() => !editMode && !dragging && router.push(`/dashboard/machines/${machine.id}`)}
                        onMouseEnter={() => setHoveredMachine(machine.id)}
                        onMouseLeave={() => setHoveredMachine(null)}
                      >
                        {/* Machine icon */}
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 ${sc} backdrop-blur-sm`}>
                          <div className="relative">
                            <Cog className="h-5 w-5 text-muted-foreground" />
                            <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${sd} border border-card`} />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-foreground leading-tight">
                              {machine.asset_tag || machine.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground leading-tight">
                              {machine.machine_type || 'Machine'}
                            </p>
                          </div>
                        </div>

                        {/* Hover tooltip */}
                        {isHovered && !editMode && nodeData && (
                          <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg p-3 shadow-xl z-30 min-w-[160px]">
                            <p className="text-xs font-medium text-foreground mb-2">{machine.name}</p>
                            {nodeData.vib_rms_x != null && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Vibration</span>
                                <span className="text-foreground">{nodeData.vib_rms_x.toFixed(2)} g</span>
                              </div>
                            )}
                            {nodeData.anomaly_score != null && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Anomaly</span>
                                <span className="text-foreground">{(nodeData.anomaly_score * 100).toFixed(0)}%</span>
                              </div>
                            )}
                            {nodeData.temperature_1 != null && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Temperature</span>
                                <span className="text-foreground">{nodeData.temperature_1.toFixed(0)}°C</span>
                              </div>
                            )}
                            {nodeData.grid_power_w != null && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Power</span>
                                <span className="text-foreground">{(nodeData.grid_power_w / 1000).toFixed(1)} kW</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>
    </div>
  );
}
