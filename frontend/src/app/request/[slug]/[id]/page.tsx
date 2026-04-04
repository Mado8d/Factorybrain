'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

interface RequestStatus {
  id: string;
  title: string;
  status: string;
  urgency: string;
  created_at: string;
  reviewed_at: string | null;
  reviewer_note: string | null;
}

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  new: { label: 'New', bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  approved: { label: 'Approved', bg: 'bg-green-500/20', text: 'text-green-400' },
  rejected: { label: 'Rejected', bg: 'bg-red-500/20', text: 'text-red-400' },
};

const urgencyLabels: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Machine Down!',
};

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export default function RequestStatusPage() {
  const params = useParams();
  const slug = params.slug as string;
  const id = params.id as string;

  const [data, setData] = useState<RequestStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.checkRequestStatus(slug, id)
      .then(setData)
      .catch((err: any) => setError(err.message || 'Request not found'))
      .finally(() => setLoading(false));
  }, [slug, id]);

  const status = data ? (statusConfig[data.status] || statusConfig.new) : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-lg font-bold text-brand-400">FactoryBrain</h1>
          <p className="text-sm text-muted-foreground">Request Status</p>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-6 flex items-start justify-center">
        <div className="w-full max-w-lg">
          {loading && (
            <div className="bg-card rounded-xl border border-border p-8 text-center">
              <div className="animate-pulse text-muted-foreground">Loading...</div>
            </div>
          )}

          {error && (
            <div className="bg-card rounded-xl border border-border p-8 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Request not found</h2>
              <p className="text-sm text-muted-foreground mb-6">{error}</p>
              <a
                href={`/request/${slug}`}
                className="inline-block h-12 leading-[3rem] px-6 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-600/90 transition-colors"
              >
                Submit a new request
              </a>
            </div>
          )}

          {data && status && (
            <div className="bg-card rounded-xl border border-border p-6">
              {/* Status badge */}
              <div className="flex items-center justify-between mb-4">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${status.bg} ${status.text}`}>
                  {status.label}
                </span>
                <span className="text-xs text-muted-foreground font-mono">{data.id.slice(0, 8)}</span>
              </div>

              {/* Title */}
              <h2 className="text-lg font-semibold text-foreground mb-4">{data.title}</h2>

              {/* Details */}
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Urgency</span>
                  <span className="text-foreground">{urgencyLabels[data.urgency] || data.urgency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Submitted</span>
                  <span className="text-foreground">{formatDate(data.created_at)}</span>
                </div>
                {data.reviewed_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reviewed</span>
                    <span className="text-foreground">{formatDate(data.reviewed_at)}</span>
                  </div>
                )}
                {data.reviewer_note && (
                  <div className="pt-2 border-t border-border">
                    <span className="text-muted-foreground block mb-1">Reviewer note</span>
                    <span className="text-foreground">{data.reviewer_note}</span>
                  </div>
                )}
              </div>

              {/* Link back */}
              <div className="mt-6 pt-4 border-t border-border">
                <a
                  href={`/request/${slug}`}
                  className="block w-full h-12 rounded-lg bg-brand-600 text-white font-medium text-center leading-[3rem] hover:bg-brand-600/90 transition-colors"
                >
                  Submit another request
                </a>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-4 py-4 text-center">
        <p className="text-xs text-muted-foreground">
          Powered by <span className="text-brand-400">FactoryBrain</span>
        </p>
      </footer>
    </div>
  );
}
