'use client';

import { AssetTree } from '@/components/dashboard/asset-tree';

export default function AssetsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Asset Navigator</h1>
      <div className="bg-card rounded-xl border border-border p-4" style={{ minHeight: '60vh' }}>
        <AssetTree />
      </div>
    </div>
  );
}
