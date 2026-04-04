'use client';

import { useState, useCallback } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { QrActions } from '@/components/dashboard/qr-actions';
import { Camera, CameraOff, Keyboard, ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface Machine {
  id: string;
  name: string;
  asset_tag: string | null;
  status: string;
  machine_type: string | null;
}

type ScanState = 'scanning' | 'loading' | 'found' | 'error' | 'camera-error';

function extractMachineId(raw: string): string | null {
  try {
    // Try parsing as URL first
    const url = new URL(raw, 'https://placeholder.com');
    const path = url.pathname;

    // Match /s/{uuid}
    const shortMatch = path.match(/\/s\/([0-9a-f-]{36})/i);
    if (shortMatch) return shortMatch[1];

    // Match /dashboard/machines/{uuid}
    const fullMatch = path.match(/\/dashboard\/machines\/([0-9a-f-]{36})/i);
    if (fullMatch) return fullMatch[1];
  } catch {
    // Not a URL — check if raw value is a UUID itself
  }

  // Direct UUID
  const uuidMatch = raw.match(/^[0-9a-f-]{36}$/i);
  if (uuidMatch) return raw;

  return null;
}

export default function ScanPage() {
  const [state, setState] = useState<ScanState>('scanning');
  const [machine, setMachine] = useState<Machine | null>(null);
  const [error, setError] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [manualId, setManualId] = useState('');

  const lookupMachine = useCallback(async (machineId: string) => {
    setState('loading');
    setError('');
    try {
      const data = await api.getMachine(machineId) as Machine;
      setMachine(data);
      setState('found');
    } catch {
      setError('Machine not found. Check the QR code and try again.');
      setState('error');
    }
  }, []);

  const handleScan = useCallback((result: any[]) => {
    if (state !== 'scanning' || !result || result.length === 0) return;
    const raw = result[0]?.rawValue;
    if (!raw) return;

    const machineId = extractMachineId(raw);
    if (machineId) {
      lookupMachine(machineId);
    } else {
      setError('QR code does not contain a valid machine ID.');
      setState('error');
    }
  }, [state, lookupMachine]);

  const handleManualSubmit = () => {
    const trimmed = manualId.trim();
    if (!trimmed) return;
    const machineId = extractMachineId(trimmed);
    if (machineId) {
      lookupMachine(machineId);
    } else {
      setError('Invalid machine ID format.');
      setState('error');
    }
  };

  const reset = () => {
    setState('scanning');
    setMachine(null);
    setError('');
    setManualId('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#111] flex flex-col">
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-[#111]/80 backdrop-blur-sm">
        <Link href="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm">Back</span>
        </Link>
        <h1 className="text-foreground font-semibold">Scan QR Code</h1>
        <div className="w-16" />
      </div>

      {/* Scanner area */}
      <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
        {(state === 'scanning' || state === 'loading') && (
          <>
            <div className="w-full max-w-md aspect-square relative">
              <Scanner
                onScan={handleScan}
                onError={() => setState('camera-error')}
                styles={{
                  container: { width: '100%', height: '100%' },
                  video: { objectFit: 'cover' as const },
                }}
                components={{
                  finder: true,
                }}
              />
              {state === 'loading' && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" />
                    <p className="text-sm text-muted-foreground">Looking up machine...</p>
                  </div>
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground mt-6 px-4 text-center">
              Point your camera at a machine QR code
            </p>

            {/* Manual entry toggle */}
            <button
              onClick={() => setShowManual(!showManual)}
              className="mt-4 flex items-center gap-2 text-sm text-brand-400 hover:text-brand-300 transition-colors"
            >
              <Keyboard className="h-4 w-4" />
              Type ID manually
            </button>

            {showManual && (
              <div className="mt-3 flex items-center gap-2 px-4 w-full max-w-md">
                <input
                  type="text"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                  placeholder="Machine ID or URL..."
                  className="flex-1 h-10 rounded-lg bg-card border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
                <Button onClick={handleManualSubmit} size="sm" disabled={!manualId.trim()}>
                  Go
                </Button>
              </div>
            )}
          </>
        )}

        {/* Camera permission error */}
        {state === 'camera-error' && (
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <CameraOff className="h-8 w-8 text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Camera Access Required</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              Please allow camera access in your browser settings to scan QR codes.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Button onClick={reset} variant="outline" className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" /> Try Again
              </Button>
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center"><span className="bg-[#111] px-2 text-xs text-muted-foreground">or</span></div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                  placeholder="Machine ID or URL..."
                  className="flex-1 h-10 rounded-lg bg-card border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
                <Button onClick={handleManualSubmit} size="sm" disabled={!manualId.trim()}>
                  Go
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Error state */}
        {state === 'error' && (
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <Camera className="h-8 w-8 text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Scan Failed</h2>
            <p className="text-sm text-muted-foreground max-w-xs">{error}</p>
            <Button onClick={reset}>
              <RefreshCw className="h-4 w-4 mr-2" /> Try Again
            </Button>
          </div>
        )}
      </div>

      {/* Quick Actions sheet */}
      {state === 'found' && machine && (
        <QrActions machine={machine} onClose={reset} />
      )}
    </div>
  );
}
