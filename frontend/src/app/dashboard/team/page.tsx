'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { UserDetails } from '@/lib/api';
import {
  Users, ChevronLeft, ChevronRight, Star, ShieldCheck, Plus, X,
  Calendar, Clock, Wrench, Award, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

// --- Types ---
interface Skill {
  id: string;
  user_id: string;
  skill_type: string;
  level: number;
  is_certified: boolean;
  certification_expiry: string | null;
}

interface Availability {
  id: string;
  user_id: string;
  date: string;
  shift_type: string;
  status: string;
  notes: string | null;
}

interface WorkloadEntry {
  user_id: string;
  user_name: string;
  date: string;
  active_wo_count: number;
  availability_status: string | null;
}

// --- Constants ---
const SKILL_TYPES = [
  'Electrical', 'Mechanical', 'Hydraulic', 'Pneumatic',
  'Welding', 'Instrumentation', 'HVAC', 'Plumbing',
];

const AVAILABILITY_STATUSES = [
  'Available', 'Off', 'Sick', 'Vacation', 'On-Call', 'Training',
];

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-500/20 text-green-400 border-green-500/30',
  off: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  sick: 'bg-red-500/20 text-red-400 border-red-500/30',
  vacation: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'on-call': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  training: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

const STATUS_BG: Record<string, string> = {
  available: 'bg-green-500/10',
  off: 'bg-zinc-500/10',
  sick: 'bg-red-500/10',
  vacation: 'bg-blue-500/10',
  'on-call': 'bg-amber-500/10',
  training: 'bg-purple-500/10',
};

const LEVEL_LABELS: Record<number, string> = {
  1: 'Apprentice',
  2: 'Basic',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Master',
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// --- Date Helpers ---
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getWeekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function renderStars(level: number): string {
  return '★'.repeat(level) + '☆'.repeat(5 - level);
}

// --- Component ---
export default function TeamPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [activeTab, setActiveTab] = useState<'overview' | 'skills' | 'availability'>('overview');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  // Data
  const [users, setUsers] = useState<UserDetails[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [workload, setWorkload] = useState<WorkloadEntry[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);

  // Week navigation
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));

  // Add Skill dialog
  const [addSkillOpen, setAddSkillOpen] = useState(false);
  const [addSkillUserId, setAddSkillUserId] = useState('');
  const [addSkillType, setAddSkillType] = useState('');
  const [addSkillLevel, setAddSkillLevel] = useState(3);
  const [addSkillCertified, setAddSkillCertified] = useState(false);
  const [addSkillExpiry, setAddSkillExpiry] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Technician detail
  const [selectedTech, setSelectedTech] = useState<string | null>(null);

  // Bulk selection for availability
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 3000);
  };

  const weekDays = getWeekDays(weekStart);
  const dateFrom = toISODate(weekDays[0]);
  const dateTo = toISODate(weekDays[6]);

  const loadData = useCallback(async () => {
    try {
      const [u, s] = await Promise.all([
        api.getUsers() as Promise<UserDetails[]>,
        api.getSkills() as Promise<Skill[]>,
      ]);
      setUsers(u.filter(usr => usr.is_active));
      setSkills(s);

      // Load week-dependent data
      try {
        const [wl, av] = await Promise.all([
          api.getTeamWorkload(dateFrom, dateTo) as Promise<WorkloadEntry[]>,
          api.getAvailability(dateFrom, dateTo) as Promise<Availability[]>,
        ]);
        setWorkload(wl);
        setAvailability(av);
      } catch {
        // Endpoints may not be available yet
        setWorkload([]);
        setAvailability([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  const navigateWeek = (delta: number) => {
    setWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta * 7);
      return d;
    });
    setSelectedCells(new Set());
    setLoading(true);
  };

  const goToThisWeek = () => {
    setWeekStart(getMonday(new Date()));
    setSelectedCells(new Set());
    setLoading(true);
  };

  // --- Helpers ---
  const getWorkloadForCell = (userId: string, date: string): WorkloadEntry | undefined =>
    workload.find(w => w.user_id === userId && w.date === date);

  const getAvailabilityForCell = (userId: string, date: string): Availability | undefined =>
    availability.find(a => a.user_id === userId && a.date === date);

  const getStatusKey = (status: string | null | undefined): string =>
    (status || 'available').toLowerCase().replace(/\s+/g, '-');

  const getUserSkills = (userId: string): Skill[] =>
    skills.filter(s => s.user_id === userId);

  const todayStr = toISODate(new Date());
  const availableToday = users.filter(u => {
    const av = getAvailabilityForCell(u.id, todayStr);
    const status = getStatusKey(av?.status);
    return status === 'available' || status === 'on-call' || !av;
  }).length;

  const totalWOs = workload.reduce((sum, w) => sum + (w.date === todayStr ? w.active_wo_count : 0), 0);
  const avgWOs = users.length > 0 ? (totalWOs / users.length).toFixed(1) : '0';

  // --- Skill Management ---
  const openAddSkill = (userId: string) => {
    setAddSkillUserId(userId);
    setAddSkillType('');
    setAddSkillLevel(3);
    setAddSkillCertified(false);
    setAddSkillExpiry('');
    setAddSkillOpen(true);
  };

  const handleAddSkill = async () => {
    if (!addSkillUserId || !addSkillType) return;
    setSubmitting(true);
    try {
      await api.setSkill({
        user_id: addSkillUserId,
        skill_type: addSkillType,
        level: addSkillLevel,
        is_certified: addSkillCertified,
        certification_expiry: addSkillExpiry || undefined,
      });
      await loadData();
      setAddSkillOpen(false);
      showFeedback('Skill added');
    } catch (err: any) {
      showFeedback(err.message || 'Failed to add skill');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    try {
      await api.deleteSkill(skillId);
      await loadData();
      showFeedback('Skill removed');
    } catch {
      showFeedback('Failed to remove skill');
    }
  };

  // --- Availability Management ---
  const handleSetAvailability = async (userId: string, date: string, status: string) => {
    try {
      await api.setAvailability({ user_id: userId, date, status });
      await loadData();
      showFeedback('Availability updated');
    } catch (err: any) {
      showFeedback(err.message || 'Failed to update');
    }
  };

  const toggleCellSelection = (key: string) => {
    setSelectedCells(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleBulkSet = async () => {
    if (!bulkStatus || selectedCells.size === 0) return;
    setSubmitting(true);
    try {
      const promises = Array.from(selectedCells).map(key => {
        const [userId, date] = key.split('|');
        return api.setAvailability({ user_id: userId, date, status: bulkStatus });
      });
      await Promise.all(promises);
      setSelectedCells(new Set());
      setBulkStatus('');
      await loadData();
      showFeedback(`Updated ${promises.length} entries`);
    } catch (err: any) {
      showFeedback(err.message || 'Bulk update failed');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Render ---
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" />
    </div>
  );

  return (
    <div>
      {/* Feedback toast */}
      {feedback && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-bottom-2">
          {feedback}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Team Scheduling</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-secondary rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === 'overview' ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Users className="h-3.5 w-3.5 inline mr-1" />Team Overview
        </button>
        <button
          onClick={() => setActiveTab('skills')}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === 'skills' ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Award className="h-3.5 w-3.5 inline mr-1" />Skills &amp; Certs
        </button>
        <button
          onClick={() => setActiveTab('availability')}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === 'availability' ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Calendar className="h-3.5 w-3.5 inline mr-1" />Availability
        </button>
      </div>

      {/* ===== TAB 1: Team Overview ===== */}
      {activeTab === 'overview' && (
        <div>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">Total Technicians</p>
              <p className="text-2xl font-bold text-foreground mt-1">{users.length}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">Available Today</p>
              <p className="text-2xl font-bold text-green-400 mt-1">{availableToday}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">Avg WOs per Tech</p>
              <p className="text-2xl font-bold text-foreground mt-1">{avgWOs}</p>
            </div>
          </div>

          {/* Week navigator */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => navigateWeek(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <button onClick={goToThisWeek} className="px-3 py-1.5 text-sm font-medium text-foreground hover:text-brand-400 transition-colors">
                This Week
              </button>
              <Button size="sm" variant="outline" onClick={() => navigateWeek(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDate(weekDays[0])} — {formatDate(weekDays[6])}
            </p>
          </div>

          {/* Workload grid */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-48">Technician</th>
                    {weekDays.map((day, i) => (
                      <th key={i} className={`text-center px-2 py-3 text-xs font-medium ${isToday(day) ? 'text-brand-400' : 'text-muted-foreground'}`}>
                        <div>{DAY_NAMES[i]}</div>
                        <div className="font-normal">{day.getDate()}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedTech(selectedTech === u.id ? null : u.id)}
                          className="text-left hover:text-brand-400 transition-colors font-medium text-foreground"
                        >
                          {u.name}
                        </button>
                        <span className="text-xs text-muted-foreground ml-2">{u.role}</span>
                      </td>
                      {weekDays.map((day, i) => {
                        const dateStr = toISODate(day);
                        const wl = getWorkloadForCell(u.id, dateStr);
                        const av = getAvailabilityForCell(u.id, dateStr);
                        const statusKey = getStatusKey(wl?.availability_status || av?.status);
                        const woCount = wl?.active_wo_count || 0;
                        return (
                          <td key={i} className={`text-center px-2 py-3 ${STATUS_BG[statusKey] || ''} ${isToday(day) ? 'ring-1 ring-inset ring-brand-500/30' : ''}`}>
                            {woCount > 0 && (
                              <div className="text-xs font-bold text-foreground">{woCount} WO{woCount > 1 ? 's' : ''}</div>
                            )}
                            <div className={`text-[10px] inline-block px-1.5 py-0.5 rounded-full border ${STATUS_COLORS[statusKey] || STATUS_COLORS.available}`}>
                              {statusKey === 'on-call' ? 'On-Call' : statusKey.charAt(0).toUpperCase() + statusKey.slice(1)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-muted-foreground">No team members found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Technician detail panel */}
          {selectedTech && (
            <div className="mt-4 bg-card rounded-xl border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">
                  {users.find(u => u.id === selectedTech)?.name || 'Technician'}
                </h3>
                <Button size="sm" variant="ghost" onClick={() => setSelectedTech(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Skills */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Skills</h4>
                  <div className="space-y-2">
                    {getUserSkills(selectedTech).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No skills recorded</p>
                    ) : getUserSkills(selectedTech).map(skill => (
                      <div key={skill.id} className="flex items-center gap-2 text-sm">
                        <Badge variant="muted">{skill.skill_type}</Badge>
                        <span className="text-amber-400 font-mono text-xs">{renderStars(skill.level)}</span>
                        <span className="text-xs text-muted-foreground">{LEVEL_LABELS[skill.level]}</span>
                        {skill.is_certified && <ShieldCheck className="h-3.5 w-3.5 text-green-400" />}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Current WOs */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">This Week&apos;s Workload</h4>
                  {(() => {
                    const techWorkload = workload.filter(w => w.user_id === selectedTech && w.active_wo_count > 0);
                    if (techWorkload.length === 0) return <p className="text-sm text-muted-foreground">No work orders this week</p>;
                    return (
                      <div className="space-y-1">
                        {techWorkload.map((w, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{formatDate(new Date(w.date + 'T00:00:00'))}</span>
                            <Badge variant="info">{w.active_wo_count} WO{w.active_wo_count > 1 ? 's' : ''}</Badge>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== TAB 2: Skills & Certifications ===== */}
      {activeTab === 'skills' && (
        <div className="space-y-4">
          {users.map(u => {
            const userSkills = getUserSkills(u.id);
            return (
              <div key={u.id} className="bg-card rounded-xl border border-border p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-brand-600/20 flex items-center justify-center text-brand-400 font-semibold text-sm">
                      {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.role} &middot; {u.email}</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <Button size="sm" variant="outline" onClick={() => openAddSkill(u.id)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Skill
                    </Button>
                  )}
                </div>

                {userSkills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No skills recorded yet</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {userSkills.map(skill => {
                      const isExpired = skill.certification_expiry && new Date(skill.certification_expiry) < new Date();
                      return (
                        <div
                          key={skill.id}
                          className={`flex items-center gap-2 bg-secondary rounded-lg px-3 py-2 border ${isExpired ? 'border-red-500/40' : 'border-border'}`}
                        >
                          <Badge variant="default">{skill.skill_type}</Badge>
                          <span className="text-amber-400 font-mono text-xs tracking-wider">{renderStars(skill.level)}</span>
                          <span className="text-[10px] text-muted-foreground">{LEVEL_LABELS[skill.level]}</span>
                          {skill.is_certified && (
                            <ShieldCheck className={`h-3.5 w-3.5 ${isExpired ? 'text-red-400' : 'text-green-400'}`} />
                          )}
                          {skill.certification_expiry && (
                            <span className={`text-[10px] ${isExpired ? 'text-red-400 font-medium' : 'text-muted-foreground'}`}>
                              {isExpired ? 'Expired ' : 'Exp '}
                              {new Date(skill.certification_expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                          {isExpired && <AlertTriangle className="h-3 w-3 text-red-400" />}
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteSkill(skill.id)}
                              className="ml-1 text-muted-foreground hover:text-red-400 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {users.length === 0 && (
            <div className="text-center py-12 bg-card rounded-xl border border-border">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No team members found</p>
            </div>
          )}
        </div>
      )}

      {/* ===== TAB 3: Availability ===== */}
      {activeTab === 'availability' && (
        <div>
          {/* Week navigator */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => navigateWeek(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <button onClick={goToThisWeek} className="px-3 py-1.5 text-sm font-medium text-foreground hover:text-brand-400 transition-colors">
                This Week
              </button>
              <Button size="sm" variant="outline" onClick={() => navigateWeek(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                {formatDate(weekDays[0])} — {formatDate(weekDays[6])}
              </p>
              {/* Bulk actions */}
              {isAdmin && selectedCells.size > 0 && (
                <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-1.5 border border-border">
                  <span className="text-xs text-muted-foreground">{selectedCells.size} selected</span>
                  <Select value={bulkStatus} onValueChange={setBulkStatus}>
                    <SelectTrigger className="h-7 w-32 text-xs">
                      <SelectValue placeholder="Set status..." />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABILITY_STATUSES.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-7 text-xs" disabled={!bulkStatus || submitting} onClick={handleBulkSet}>
                    Apply
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setSelectedCells(new Set()); setBulkStatus(''); }}>
                    Clear
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Status legend */}
          <div className="flex flex-wrap gap-2 mb-4">
            {AVAILABILITY_STATUSES.map(s => {
              const key = s.toLowerCase().replace(/\s+/g, '-');
              return (
                <div key={s} className={`text-[10px] px-2 py-1 rounded-full border ${STATUS_COLORS[key]}`}>
                  {s}
                </div>
              );
            })}
          </div>

          {/* Availability grid */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-48">Technician</th>
                    {weekDays.map((day, i) => (
                      <th key={i} className={`text-center px-2 py-3 text-xs font-medium ${isToday(day) ? 'text-brand-400' : 'text-muted-foreground'}`}>
                        <div>{DAY_NAMES[i]}</div>
                        <div className="font-normal">{day.getDate()}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-border/50">
                      <td className="px-4 py-3 font-medium text-foreground">{u.name}</td>
                      {weekDays.map((day, i) => {
                        const dateStr = toISODate(day);
                        const av = getAvailabilityForCell(u.id, dateStr);
                        const statusKey = getStatusKey(av?.status);
                        const cellKey = `${u.id}|${dateStr}`;
                        const isSelected = selectedCells.has(cellKey);

                        return (
                          <td
                            key={i}
                            className={`text-center px-1 py-2 ${STATUS_BG[statusKey] || ''} ${isToday(day) ? 'ring-1 ring-inset ring-brand-500/30' : ''} ${isSelected ? 'ring-2 ring-inset ring-brand-500' : ''}`}
                          >
                            {isAdmin ? (
                              <div className="flex flex-col items-center gap-1">
                                <select
                                  value={av?.status || 'Available'}
                                  onChange={(e) => handleSetAvailability(u.id, dateStr, e.target.value)}
                                  className="bg-transparent border-0 text-[11px] text-center cursor-pointer focus:outline-none focus:ring-0 w-full appearance-none px-1"
                                  style={{ WebkitAppearance: 'none' }}
                                >
                                  {AVAILABILITY_STATUSES.map(s => (
                                    <option key={s} value={s} className="bg-zinc-900 text-foreground">{s}</option>
                                  ))}
                                </select>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleCellSelection(cellKey)}
                                  className="h-3 w-3 rounded border-border bg-card text-brand-600 focus:ring-brand-500 cursor-pointer"
                                />
                              </div>
                            ) : (
                              <div className={`text-[11px] inline-block px-1.5 py-0.5 rounded-full border ${STATUS_COLORS[statusKey] || STATUS_COLORS.available}`}>
                                {statusKey === 'on-call' ? 'On-Call' : statusKey.charAt(0).toUpperCase() + statusKey.slice(1)}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-muted-foreground">No team members found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Skill Dialog */}
      <Dialog open={addSkillOpen} onOpenChange={setAddSkillOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Skill</DialogTitle>
            <DialogDescription>
              Add a skill for {users.find(u => u.id === addSkillUserId)?.name || 'technician'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Skill Type *</Label>
              <Select value={addSkillType} onValueChange={setAddSkillType}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select skill type..." /></SelectTrigger>
                <SelectContent>
                  {SKILL_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Level: {addSkillLevel} — {LEVEL_LABELS[addSkillLevel]}</Label>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-amber-400 font-mono text-lg tracking-wider">{renderStars(addSkillLevel)}</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={addSkillLevel}
                  onChange={(e) => setAddSkillLevel(Number(e.target.value))}
                  className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-brand-600"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addSkillCertified}
                  onChange={(e) => setAddSkillCertified(e.target.checked)}
                  className="h-4 w-4 rounded border-border bg-card text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-foreground">Certified</span>
                <ShieldCheck className={`h-4 w-4 ${addSkillCertified ? 'text-green-400' : 'text-muted-foreground/30'}`} />
              </label>
            </div>
            {addSkillCertified && (
              <div>
                <Label>Certification Expiry</Label>
                <Input
                  type="date"
                  value={addSkillExpiry}
                  onChange={(e) => setAddSkillExpiry(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleAddSkill} disabled={submitting || !addSkillType}>
              {submitting ? 'Adding...' : 'Add Skill'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
