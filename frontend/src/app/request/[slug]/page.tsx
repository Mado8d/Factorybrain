'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

type Urgency = 'low' | 'medium' | 'high' | 'critical';

const urgencyOptions: { value: Urgency; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'border-blue-500 bg-blue-500/10 text-blue-400' },
  { value: 'medium', label: 'Medium', color: 'border-yellow-500 bg-yellow-500/10 text-yellow-400' },
  { value: 'high', label: 'High', color: 'border-orange-500 bg-orange-500/10 text-orange-400' },
  { value: 'critical', label: 'Machine Down!', color: 'border-red-500 bg-red-500/10 text-red-400' },
];

interface Machine {
  id: string;
  name: string;
  asset_tag: string | null;
}

interface SubmitResult {
  id: string;
  title: string;
}

export default function PublicRequestPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const preselectedMachine = searchParams.get('machine_id') || '';

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machineId, setMachineId] = useState(preselectedMachine);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('medium');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [requesterName, setRequesterName] = useState('');
  const [requesterContact, setRequesterContact] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null);
  const [machinesLoading, setMachinesLoading] = useState(true);

  useEffect(() => {
    api.getPublicMachines(slug)
      .then(setMachines)
      .catch(() => setMachines([]))
      .finally(() => setMachinesLoading(false));
  }, [slug]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setPhoto(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Convert photo to base64 if present
      let photos: any[] | undefined;
      if (photo && photoPreview) {
        photos = [{ filename: photo.name, data: photoPreview }];
      }

      const result = await api.submitPublicRequest(slug, {
        title,
        description: description || undefined,
        machine_id: machineId || undefined,
        urgency,
        requester_name: requesterName || undefined,
        requester_contact: requesterContact || undefined,
        photos,
      });
      setSubmitted({ id: result.id, title });
    } catch (err: any) {
      setError(err.message || 'Failed to submit request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setUrgency('medium');
    setPhoto(null);
    setPhotoPreview(null);
    setRequesterName('');
    setRequesterContact('');
    setMachineId('');
    setError('');
    setSubmitted(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Success screen
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-xl border border-border p-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Request submitted!</h2>
            <p className="text-muted-foreground mb-4">
              Your maintenance request has been received and will be reviewed shortly.
            </p>

            <div className="bg-[#0a0a0a] rounded-lg border border-border p-4 mb-6 text-left">
              <div className="text-sm text-muted-foreground mb-1">Request ID</div>
              <div className="text-foreground font-mono text-sm break-all">{submitted.id}</div>
              <div className="mt-3">
                <a
                  href={`/request/${slug}/${submitted.id}`}
                  className="text-brand-400 text-sm hover:underline"
                >
                  Track your request status →
                </a>
              </div>
            </div>

            <button
              onClick={resetForm}
              className="w-full h-12 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-600/90 transition-colors"
            >
              Submit another request
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Powered by <span className="text-brand-400">FactoryBrain</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-lg font-bold text-brand-400">FactoryBrain</h1>
          <p className="text-sm text-muted-foreground">Report a Maintenance Issue</p>
        </div>
      </header>

      {/* Form */}
      <main className="flex-1 px-4 py-6">
        <form onSubmit={handleSubmit} className="max-w-lg mx-auto space-y-5">
          {/* Machine selector */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Machine
            </label>
            <select
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              disabled={machinesLoading}
              className="w-full h-12 rounded-lg border border-border bg-card text-foreground px-3 text-base appearance-none focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="">
                {machinesLoading ? 'Loading machines...' : 'Select a machine (optional)'}
              </option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.asset_tag ? ` (${m.asset_tag})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              What&apos;s the problem? <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g. Strange noise from motor"
              className="w-full h-12 rounded-lg border border-border bg-card text-foreground px-3 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              More details
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="When did it start? How often does it happen?"
              className="w-full rounded-lg border border-border bg-card text-foreground px-3 py-3 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
            />
          </div>

          {/* Urgency */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Urgency
            </label>
            <div className="grid grid-cols-2 gap-2">
              {urgencyOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setUrgency(opt.value)}
                  className={`h-12 rounded-lg border-2 text-sm font-medium transition-all ${
                    urgency === opt.value
                      ? opt.color
                      : 'border-border bg-card text-muted-foreground hover:border-border/80'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Photo */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Photo
            </label>
            {photoPreview ? (
              <div className="relative">
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="w-full h-48 object-cover rounded-lg border border-border"
                />
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-12 rounded-lg border border-dashed border-border bg-card text-muted-foreground text-sm flex items-center justify-center gap-2 hover:border-brand-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                </svg>
                Add photo
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoChange}
              className="hidden"
            />
          </div>

          {/* Name & Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Your name
              </label>
              <input
                type="text"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                placeholder="Optional"
                className="w-full h-12 rounded-lg border border-border bg-card text-foreground px-3 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Email or phone
              </label>
              <input
                type="text"
                value={requesterContact}
                onChange={(e) => setRequesterContact(e.target.value)}
                placeholder="Optional"
                className="w-full h-12 rounded-lg border border-border bg-card text-foreground px-3 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/20 text-red-400 border border-red-500/30 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="w-full h-14 rounded-lg bg-brand-600 text-white font-semibold text-base hover:bg-brand-600/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
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
