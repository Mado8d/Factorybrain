'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, UserDetails } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Plus, Pencil, ShieldCheck, ShieldOff, KeyRound, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-red-500/10 text-red-400 border border-red-500/20',
  admin: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  manager: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  operator: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  viewer: 'bg-gray-500/10 text-gray-400 border border-gray-500/20',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  superadmin: 'Full platform access across all tenants',
  admin: 'Full access within own company, manage users',
  manager: 'Manage machines, maintenance, settings',
  operator: 'View dashboards, handle alerts & work orders',
  viewer: 'Read-only access to dashboards',
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [assignableRoles, setAssignableRoles] = useState<string[]>([]);

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserDetails | null>(null);
  const [resetPwUser, setResetPwUser] = useState<UserDetails | null>(null);
  const [toggleUser, setToggleUser] = useState<UserDetails | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  const loadUsers = useCallback(async () => {
    try {
      const [usersData, rolesData] = await Promise.all([
        api.getUsers({ include_inactive: showInactive }),
        api.getRoles(),
      ]);
      setUsers(usersData);
      setAssignableRoles(rolesData.assignable);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // --- Handlers ---

  const handleCreate = async (data: { email: string; name: string; role: string; password: string }) => {
    setSubmitting(true);
    setError(null);
    try {
      await api.createUser(data);
      setCreateOpen(false);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (data: { name?: string; email?: string; role?: string }) => {
    if (!editUser) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.updateUser(editUser.id, data);
      setEditUser(null);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (newPassword: string) => {
    if (!resetPwUser) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.resetUserPassword(resetPwUser.id, newPassword);
      setResetPwUser(null);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async () => {
    if (!toggleUser) return;
    setSubmitting(true);
    try {
      if (toggleUser.is_active) {
        await api.deactivateUser(toggleUser.id);
      } else {
        await api.activateUser(toggleUser.id);
      }
      setToggleUser(null);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle user');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-20">
        <ShieldOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-foreground">Access Denied</h1>
        <p className="text-muted-foreground mt-2">Only admins can manage users.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const activeCount = users.filter(u => u.is_active).length;
  const inactiveCount = users.filter(u => !u.is_active).length;

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeCount} active{inactiveCount > 0 ? `, ${inactiveCount} inactive` : ''} user{activeCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-border"
            />
            Show inactive
          </label>
          <Button onClick={() => { setError(null); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add User
          </Button>
        </div>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {Object.entries(ROLE_DESCRIPTIONS).map(([role, desc]) => (
          <div key={role} className="bg-card rounded-lg border border-border p-3">
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[role] || ROLE_COLORS.viewer}`}>
              {role}
            </span>
            <p className="text-xs text-muted-foreground mt-1.5">{desc}</p>
          </div>
        ))}
      </div>

      {/* User table (desktop) + cards (mobile) */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="hidden md:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary">
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">User</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Role</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Status</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Created</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className={`border-b border-border last:border-0 hover:bg-accent transition-colors group ${!u.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-foreground">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded text-xs font-medium ${ROLE_COLORS[u.role] || ROLE_COLORS.viewer}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-400"><span className="h-1.5 w-1.5 rounded-full bg-green-400" /> Active</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500"><span className="h-1.5 w-1.5 rounded-full bg-gray-500" /> Inactive</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setError(null); setEditUser(u); }} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {!isSelf && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setError(null); setResetPwUser(u); }} title="Reset password">
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className={`h-8 w-8 ${u.is_active ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}`}
                              onClick={() => setToggleUser(u)}
                              title={u.is_active ? 'Deactivate' : 'Activate'}
                            >
                              {u.is_active ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-border">
          {users.map((u) => {
            const isSelf = u.id === currentUser?.id;
            return (
              <div key={u.id} className={`p-4 ${!u.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className="font-medium text-foreground">{u.name} {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[u.role] || ROLE_COLORS.viewer}`}>
                    {u.role}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setError(null); setEditUser(u); }}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  {!isSelf && (
                    <>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setError(null); setResetPwUser(u); }}>
                        <KeyRound className="h-3 w-3 mr-1" /> Reset pw
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className={`h-7 text-xs ${u.is_active ? 'text-red-400' : 'text-green-400'}`}
                        onClick={() => setToggleUser(u)}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>Create a new user in your organization.</DialogDescription>
          </DialogHeader>
          <CreateUserForm
            assignableRoles={assignableRoles}
            onSubmit={handleCreate}
            isSubmitting={submitting}
            error={error}
          />
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details and role.</DialogDescription>
          </DialogHeader>
          {editUser && (
            <EditUserForm
              user={editUser}
              assignableRoles={assignableRoles}
              currentUserRole={currentUser?.role || ''}
              isSelf={editUser.id === currentUser?.id}
              onSubmit={handleEdit}
              isSubmitting={submitting}
              error={error}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetPwUser} onOpenChange={(open) => { if (!open) setResetPwUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Set a new password for {resetPwUser?.name}.</DialogDescription>
          </DialogHeader>
          {resetPwUser && (
            <ResetPasswordForm onSubmit={handleResetPassword} isSubmitting={submitting} error={error} />
          )}
        </DialogContent>
      </Dialog>

      {/* Toggle Active Confirmation */}
      <AlertDialog open={!!toggleUser} onOpenChange={(open) => { if (!open) setToggleUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleUser?.is_active ? 'Deactivate' : 'Activate'} User
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleUser?.is_active
                ? `${toggleUser?.name} will no longer be able to log in. This can be reversed.`
                : `${toggleUser?.name} will be able to log in again.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleActive} disabled={submitting}>
              {toggleUser?.is_active ? 'Deactivate' : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


// --- Sub-components ---

function CreateUserForm({
  assignableRoles,
  onSubmit,
  isSubmitting,
  error,
}: {
  assignableRoles: string[];
  onSubmit: (data: { email: string; name: string; role: string; password: string }) => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(assignableRoles.includes('viewer') ? 'viewer' : assignableRoles[0] || 'viewer');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ email, name, role, password }); }} className="space-y-4">
      {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required minLength={2}
          className="w-full px-3 py-2 border border-border bg-card rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="John Doe" />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          className="w-full px-3 py-2 border border-border bg-card rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="john@company.com" />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}
          className="w-full px-3 py-2 border border-border bg-card rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
          {assignableRoles.map((r) => (
            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
          ))}
        </select>
        {ROLE_DESCRIPTIONS[role] && <p className="text-xs text-muted-foreground mt-1">{ROLE_DESCRIPTIONS[role]}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Password</label>
        <div className="relative">
          <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
            className="w-full px-3 py-2 pr-10 border border-border bg-card rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Min. 8 characters" />
          <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Creating...' : 'Create User'}
      </Button>
    </form>
  );
}

function EditUserForm({
  user,
  assignableRoles,
  currentUserRole,
  isSelf,
  onSubmit,
  isSubmitting,
  error,
}: {
  user: UserDetails;
  assignableRoles: string[];
  currentUserRole: string;
  isSelf: boolean;
  onSubmit: (data: { name?: string; email?: string; role?: string }) => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);

  // Include current role in list even if not assignable (to show it)
  const roleOptions = assignableRoles.includes(user.role)
    ? assignableRoles
    : [user.role, ...assignableRoles];

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const updates: Record<string, string> = {};
      if (name !== user.name) updates.name = name;
      if (email !== user.email) updates.email = email;
      if (role !== user.role) updates.role = role;
      onSubmit(updates);
    }} className="space-y-4">
      {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required minLength={2}
          className="w-full px-3 py-2 border border-border bg-card rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          className="w-full px-3 py-2 border border-border bg-card rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={isSelf}
          className="w-full px-3 py-2 border border-border bg-card rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          {roleOptions.map((r) => (
            <option key={r} value={r} disabled={!assignableRoles.includes(r) && r !== user.role}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
        {isSelf && <p className="text-xs text-muted-foreground mt-1">You cannot change your own role.</p>}
        {ROLE_DESCRIPTIONS[role] && <p className="text-xs text-muted-foreground mt-1">{ROLE_DESCRIPTIONS[role]}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save Changes'}
      </Button>
    </form>
  );
}

function ResetPasswordForm({
  onSubmit,
  isSubmitting,
  error,
}: {
  onSubmit: (newPassword: string) => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(password); }} className="space-y-4">
      {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">New Password</label>
        <div className="relative">
          <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
            className="w-full px-3 py-2 pr-10 border border-border bg-card rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Min. 8 characters" />
          <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Resetting...' : 'Reset Password'}
      </Button>
    </form>
  );
}
