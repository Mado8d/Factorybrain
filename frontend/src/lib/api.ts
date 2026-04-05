/**
 * FactoryBrain API client.
 * Handles authentication, requests, and WebSocket connections.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
// Derive WS_BASE from API_BASE: http→ws, https→wss
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ||
  API_BASE.replace(/^http/, 'ws');

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  tenant_id: string;
}

export interface UserDetails {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null, remember: boolean = true) {
    this.token = token;
    if (typeof window !== 'undefined') {
      // Clear from both storages first
      localStorage.removeItem('fb_token');
      sessionStorage.removeItem('fb_token');
      if (token) {
        const storage = remember ? localStorage : sessionStorage;
        storage.setItem('fb_token', token);
      }
    }
  }

  getToken(): string | null {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('fb_token') || sessionStorage.getItem('fb_token');
    }
    return this.token;
  }

  logout() {
    this.setToken(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('fb_refresh_token');
      sessionStorage.removeItem('fb_refresh_token');
      window.location.href = '/login';
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Add request timeout (15s)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (response.status === 401) {
        // Attempt token refresh before giving up
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${this.getToken()}`;
          const retry = await fetch(`${API_BASE}${path}`, { ...options, headers });
          if (retry.ok) {
            if (retry.status === 204) return undefined as T;
            return retry.json();
          }
        }
        this.logout();
        throw new Error('Unauthorized');
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `API error: ${response.status}`);
      }

      if (response.status === 204) return undefined as T;
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async tryRefreshToken(): Promise<boolean> {
    const refreshToken =
      (typeof window !== 'undefined' && (localStorage.getItem('fb_refresh_token') || sessionStorage.getItem('fb_refresh_token'))) || null;
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) return false;
      const data = await response.json();
      this.setToken(data.access_token);
      return true;
    } catch {
      return false;
    }
  }

  // --- Auth ---
  async login(email: string, password: string, remember: boolean = true): Promise<LoginResponse> {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Login mislukt');
    }

    const data: LoginResponse = await response.json();
    this.setToken(data.access_token, remember);
    if (typeof window !== 'undefined') {
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem('fb_refresh_token', data.refresh_token);
    }
    return data;
  }

  async getMe(): Promise<User> {
    return this.request('/api/auth/me');
  }

  // --- Dashboard ---
  async getDashboardKPIs() {
    return this.request('/api/dashboard/kpis');
  }

  async getOEE(hours: number = 24) {
    return this.request(`/api/dashboard/oee?hours=${hours}`);
  }

  async getLatestTelemetry() {
    return this.request('/api/dashboard/latest-telemetry');
  }

  async getTelemetryHistory(params?: {
    node_id?: string;
    node_type?: string;
    hours?: number;
    start?: string;
    end?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.node_id) searchParams.set('node_id', params.node_id);
    if (params?.node_type) searchParams.set('node_type', params.node_type);
    if (params?.hours) searchParams.set('hours', String(params.hours));
    if (params?.start) searchParams.set('start', params.start);
    if (params?.end) searchParams.set('end', params.end);
    const qs = searchParams.toString();
    return this.request(`/api/dashboard/telemetry-history${qs ? `?${qs}` : ''}`);
  }

  // --- Machines ---
  async getMachines() {
    return this.request('/api/machines');
  }

  async getMachine(id: string) {
    return this.request(`/api/machines/${id}`);
  }

  async getMachineTelemetry(id: string, hours: number = 24) {
    return this.request(`/api/machines/${id}/telemetry?hours=${hours}`);
  }

  async createMachine(data: {
    name: string;
    asset_tag?: string;
    machine_type?: string;
    manufacturer?: string;
    model?: string;
    year_installed?: number;
    rated_power_kw?: number;
    specifications?: Record<string, any>;
  }) {
    return this.request('/api/machines', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMachine(id: string, data: {
    name?: string;
    asset_tag?: string;
    machine_type?: string;
    manufacturer?: string;
    model?: string;
    year_installed?: number;
    rated_power_kw?: number;
    status?: string;
    specifications?: Record<string, any>;
  }) {
    return this.request(`/api/machines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteMachine(id: string) {
    return this.request(`/api/machines/${id}`, { method: 'DELETE' });
  }

  async getMachineDiagnostics(id: string) {
    return this.request(`/api/machines/${id}/diagnostics`);
  }

  async getMachineThresholds(id: string) {
    return this.request(`/api/machines/${id}/thresholds`);
  }

  async updateMachineThresholds(id: string, overrides: Record<string, number | null>) {
    return this.request(`/api/machines/${id}/thresholds`, {
      method: 'PUT',
      body: JSON.stringify(overrides),
    });
  }

  // --- Documents ---
  async getDocuments(machineId: string) {
    return this.request(`/api/machines/${machineId}/documents`);
  }

  async uploadDocument(machineId: string, file: File) {
    const token = this.getToken();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/api/machines/${machineId}/documents`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Upload failed: ${response.status}`);
    }
    return response.json();
  }

  async deleteDocument(machineId: string, filename: string) {
    return this.request(`/api/machines/${machineId}/documents/${encodeURIComponent(filename)}`, { method: 'DELETE' });
  }

  getDocumentUrl(machineId: string, filename: string) {
    return `${API_BASE}/api/uploads/${machineId}/${encodeURIComponent(filename)}`;
  }

  // --- Plants ---
  async getPlants() {
    return this.request('/api/plants');
  }

  // --- Sensor Nodes ---
  async getNodes() {
    return this.request('/api/nodes');
  }

  async createNode(data: {
    id: string;
    machine_id?: string;
    node_type?: string;
    firmware_ver?: string;
    hw_revision?: string;
    config?: Record<string, any>;
  }) {
    return this.request('/api/nodes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateNode(id: string, data: {
    machine_id?: string;
    firmware_ver?: string;
    hw_revision?: string;
    config?: Record<string, any>;
    is_active?: boolean;
  }) {
    return this.request(`/api/nodes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteNode(id: string) {
    return this.request(`/api/nodes/${id}`, { method: 'DELETE' });
  }

  async assignNodeToMachine(nodeId: string, machineId: string | null) {
    return this.request(`/api/nodes/${nodeId}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ machine_id: machineId }),
    });
  }

  // --- Maintenance ---
  async getAlerts(status?: string) {
    const params = status ? `?status=${status}` : '';
    return this.request(`/api/maintenance/alerts${params}`);
  }

  async updateAlert(id: string, data: { status?: string; acknowledged_by?: string }) {
    return this.request(`/api/maintenance/alerts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getWorkOrders(status?: string) {
    const params = status ? `?status=${status}` : '';
    return this.request(`/api/maintenance/work-orders${params}`);
  }

  async createWorkOrder(data: {
    machine_id: string;
    title: string;
    trigger_type?: string;
    trigger_alert_id?: string;
    description?: string;
    priority?: string;
    category?: string;
    requested_date?: string;
  }) {
    return this.request('/api/maintenance/work-orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateWorkOrder(id: string, data: {
    title?: string;
    description?: string;
    priority?: string;
    status?: string;
    scheduled_date?: string;
    work_performed?: string;
    root_cause?: string;
    labor_hours?: number;
    total_cost?: number;
    checklist?: { step: string; required: boolean; completed: boolean }[];
  }) {
    return this.request(`/api/maintenance/work-orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // --- Spare Parts ---
  async getSpareParts() {
    return this.request('/api/maintenance/parts');
  }

  async createSparePart(data: any) {
    return this.request('/api/maintenance/parts', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateSparePart(id: string, data: any) {
    return this.request(`/api/maintenance/parts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteSparePart(id: string) {
    return this.request(`/api/maintenance/parts/${id}`, { method: 'DELETE' });
  }

  // --- PM Schedules ---
  async getPMSchedules(params?: { machine_id?: string; is_active?: boolean; trigger_type?: string }) {
    const sp = new URLSearchParams();
    if (params?.machine_id) sp.set('machine_id', params.machine_id);
    if (params?.is_active !== undefined) sp.set('is_active', String(params.is_active));
    if (params?.trigger_type) sp.set('trigger_type', params.trigger_type);
    const qs = sp.toString();
    return this.request(`/api/maintenance/pm-schedules${qs ? `?${qs}` : ''}`);
  }

  async getPMSchedulesDueToday() {
    return this.request('/api/maintenance/pm-schedules/due-today');
  }

  async getPMTemplates() {
    return this.request('/api/maintenance/pm-schedules/templates');
  }

  async getPMCompliance(periodStart?: string, periodEnd?: string) {
    const sp = new URLSearchParams();
    if (periodStart) sp.set('period_start', periodStart);
    if (periodEnd) sp.set('period_end', periodEnd);
    const qs = sp.toString();
    return this.request(`/api/maintenance/pm-schedules/compliance${qs ? `?${qs}` : ''}`);
  }

  async createPMSchedule(data: any) {
    return this.request('/api/maintenance/pm-schedules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createPMFromTemplate(templateId: string, machineId: string) {
    return this.request('/api/maintenance/pm-schedules/from-template', {
      method: 'POST',
      body: JSON.stringify({ template_id: templateId, machine_id: machineId }),
    });
  }

  async updatePMSchedule(id: string, data: any) {
    return this.request(`/api/maintenance/pm-schedules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deletePMSchedule(id: string) {
    return this.request(`/api/maintenance/pm-schedules/${id}`, { method: 'DELETE' });
  }

  async getPMOccurrences(scheduleId: string) {
    return this.request(`/api/maintenance/pm-schedules/${scheduleId}/occurrences`);
  }

  async skipPMOccurrence(scheduleId: string, occurrenceId: string, reason: string) {
    return this.request(`/api/maintenance/pm-schedules/${scheduleId}/occurrences/${occurrenceId}/skip`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // --- Tenant Settings ---
  async getTenantSettings() {
    return this.request('/api/tenants/settings');
  }

  async updateTenantSettings(settings: any) {
    return this.request('/api/tenants/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // --- Users ---
  async getUsers(params?: { include_inactive?: boolean; limit?: number; offset?: number }) {
    const sp = new URLSearchParams();
    if (params?.include_inactive) sp.set('include_inactive', 'true');
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return this.request<UserDetails[]>(`/api/users${qs ? `?${qs}` : ''}`);
  }

  async getUser(id: string) {
    return this.request<UserDetails>(`/api/users/${id}`);
  }

  async createUser(data: { email: string; name: string; role: string; password: string }) {
    return this.request<UserDetails>('/api/users', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateUser(id: string, data: { name?: string; email?: string; role?: string; is_active?: boolean }) {
    return this.request<UserDetails>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deactivateUser(id: string) {
    return this.request<UserDetails>(`/api/users/${id}/deactivate`, { method: 'POST' });
  }

  async activateUser(id: string) {
    return this.request<UserDetails>(`/api/users/${id}/activate`, { method: 'POST' });
  }

  async resetUserPassword(id: string, newPassword: string) {
    return this.request(`/api/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword }),
    });
  }

  async changeMyPassword(currentPassword: string, newPassword: string) {
    return this.request('/api/users/me/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
  }

  async updateMyProfile(data: { name?: string }) {
    return this.request<UserDetails>('/api/users/me', { method: 'PATCH', body: JSON.stringify(data) });
  }

  async getRoles() {
    return this.request<{ roles: { value: string; label: string; level: number }[]; assignable: string[]; current_role: string }>('/api/users/roles');
  }

  // --- Work Order Events (Activity Feed) ---
  async getWOEvents(woId: string, params?: { types?: string; limit?: number; offset?: number }) {
    const sp = new URLSearchParams();
    if (params?.types) sp.set('types', params.types);
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return this.request<any[]>(`/api/maintenance/work-orders/${woId}/events${qs ? `?${qs}` : ''}`);
  }

  async createWOEvent(woId: string, data: { event_type?: string; content?: string; mentions?: string[]; attachments?: any[] }) {
    return this.request<any>(`/api/maintenance/work-orders/${woId}/events`, { method: 'POST', body: JSON.stringify(data) });
  }

  // --- Time Tracking ---
  async getWOTime(woId: string) {
    return this.request<any[]>(`/api/maintenance/work-orders/${woId}/time`);
  }

  async getWOTimeSummary(woId: string) {
    return this.request<any>(`/api/maintenance/work-orders/${woId}/time/summary`);
  }

  async startTimer(woId: string, category: string = 'wrench') {
    return this.request<any>(`/api/maintenance/work-orders/${woId}/time/start`, { method: 'POST', body: JSON.stringify({ category }) });
  }

  async pauseTimer(woId: string) {
    return this.request(`/api/maintenance/work-orders/${woId}/time/pause`, { method: 'POST' });
  }

  async resumeTimer(woId: string) {
    return this.request(`/api/maintenance/work-orders/${woId}/time/resume`, { method: 'POST' });
  }

  async stopTimer(woId: string, notes?: string) {
    return this.request<any>(`/api/maintenance/work-orders/${woId}/time/stop`, { method: 'POST', body: JSON.stringify({ notes }) });
  }

  async getMyTimer() {
    return this.request<any | null>('/api/maintenance/my-timer');
  }

  // --- Work Requests ---
  async getRequests(params?: { status?: string; limit?: number; offset?: number }) {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.limit) sp.set('limit', String(params.limit));
    const qs = sp.toString();
    return this.request<any[]>(`/api/maintenance/requests${qs ? `?${qs}` : ''}`);
  }

  async getRequestCount(status: string = 'new') {
    return this.request<{ count: number }>(`/api/maintenance/requests/count?status=${status}`);
  }

  async approveRequest(id: string) {
    return this.request<any>(`/api/maintenance/requests/${id}/approve`, { method: 'POST' });
  }

  async rejectRequest(id: string, reason: string) {
    return this.request<any>(`/api/maintenance/requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
  }

  // --- Public Request Portal (no auth) ---
  async submitPublicRequest(tenantSlug: string, data: {
    title: string; description?: string; machine_id?: string;
    urgency?: string; requester_name?: string; requester_contact?: string;
    photos?: any[];
  }) {
    const response = await fetch(`${API_BASE}/api/requests/${tenantSlug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to submit request');
    }
    return response.json();
  }

  async checkRequestStatus(tenantSlug: string, requestId: string) {
    const response = await fetch(`${API_BASE}/api/requests/${tenantSlug}/${requestId}/status`);
    if (!response.ok) throw new Error('Request not found');
    return response.json();
  }

  async getPublicMachines(tenantSlug: string) {
    const response = await fetch(`${API_BASE}/api/requests/${tenantSlug}/machines`);
    if (!response.ok) throw new Error('Failed to load machines');
    return response.json() as Promise<{ id: string; name: string; asset_tag: string | null }[]>;
  }

  // --- KPIs ---
  async getKPIDashboard(days: number = 30) {
    return this.request<any>(`/api/kpis/dashboard?days=${days}`);
  }

  // --- Failure Codes ---
  async getFailureCodes(params?: { level?: string; parent_id?: string }) {
    const sp = new URLSearchParams();
    if (params?.level) sp.set('level', params.level);
    if (params?.parent_id) sp.set('parent_id', params.parent_id);
    const qs = sp.toString();
    return this.request<any[]>(`/api/failure-codes${qs ? `?${qs}` : ''}`);
  }

  async createFailureCode(data: { code: string; name: string; description?: string; level: string; parent_id?: string; sort_order?: number }) {
    return this.request<any>('/api/failure-codes', { method: 'POST', body: JSON.stringify(data) });
  }

  async seedDefaultFailureCodes() {
    return this.request('/api/failure-codes/seed-defaults', { method: 'POST' });
  }

  // --- Audit Logs ---
  async getAuditLogs(params?: { resource_type?: string; resource_id?: string; limit?: number; offset?: number }) {
    const sp = new URLSearchParams();
    if (params?.resource_type) sp.set('resource_type', params.resource_type);
    if (params?.resource_id) sp.set('resource_id', params.resource_id);
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return this.request<any[]>(`/api/audit${qs ? `?${qs}` : ''}`);
  }

  // --- Shift Handover ---
  async getHandovers(params?: { plant_id?: string; limit?: number }) {
    const sp = new URLSearchParams();
    if (params?.plant_id) sp.set('plant_id', params.plant_id);
    if (params?.limit) sp.set('limit', String(params.limit));
    const qs = sp.toString();
    return this.request<any[]>(`/api/shift-handover${qs ? `?${qs}` : ''}`);
  }
  async getHandover(id: string) { return this.request<any>(`/api/shift-handover/${id}`); }
  async createHandover(data: { shift_date: string; shift_type: string; plant_id?: string }) {
    return this.request<any>('/api/shift-handover', { method: 'POST', body: JSON.stringify(data) });
  }
  async updateHandover(id: string, data: any) {
    return this.request<any>(`/api/shift-handover/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }
  async signOutgoing(id: string) { return this.request<any>(`/api/shift-handover/${id}/sign-outgoing`, { method: 'POST' }); }
  async acknowledgeIncoming(id: string) { return this.request<any>(`/api/shift-handover/${id}/acknowledge-incoming`, { method: 'POST' }); }

  // --- LOTO / Safety ---
  async getLOTOProcedures(machineId?: string) {
    const qs = machineId ? `?machine_id=${machineId}` : '';
    return this.request<any[]>(`/api/safety/loto-procedures${qs}`);
  }
  async getLOTOProcedure(machineId: string) { return this.request<any>(`/api/safety/loto-procedures/machine/${machineId}`); }
  async createLOTOProcedure(data: any) { return this.request<any>('/api/safety/loto-procedures', { method: 'POST', body: JSON.stringify(data) }); }
  async createLOTOPermit(data: { work_order_id: string; procedure_id: string }) {
    return this.request<any>('/api/safety/loto-permits', { method: 'POST', body: JSON.stringify(data) });
  }
  async authorizeLOTOPermit(id: string) { return this.request<any>(`/api/safety/loto-permits/${id}/authorize`, { method: 'POST' }); }
  async lockLOTOStep(id: string, data: { step_idx: number; lock_id: string }) {
    return this.request<any>(`/api/safety/loto-permits/${id}/lock-step`, { method: 'POST', body: JSON.stringify(data) });
  }
  async unlockLOTOStep(id: string, data: { step_idx: number }) {
    return this.request<any>(`/api/safety/loto-permits/${id}/unlock-step`, { method: 'POST', body: JSON.stringify(data) });
  }
  async completeLOTOPermit(id: string) { return this.request<any>(`/api/safety/loto-permits/${id}/complete`, { method: 'POST' }); }
  async getWOLOTOPermit(woId: string) { return this.request<any>(`/api/safety/loto-permits/work-order/${woId}`); }

  // --- Webhooks ---
  async getWebhooks() { return this.request<any[]>('/api/webhooks'); }
  async createWebhook(data: { url: string; events: string[]; description?: string }) {
    return this.request<any>('/api/webhooks', { method: 'POST', body: JSON.stringify(data) });
  }
  async updateWebhook(id: string, data: any) { return this.request<any>(`/api/webhooks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); }
  async deleteWebhook(id: string) { return this.request(`/api/webhooks/${id}`, { method: 'DELETE' }); }
  async testWebhook(id: string) { return this.request<any>(`/api/webhooks/test/${id}`, { method: 'POST' }); }

  // --- Scheduling ---
  async getSkills(userId?: string) {
    const qs = userId ? `?user_id=${userId}` : '';
    return this.request<any[]>(`/api/scheduling/skills${qs}`);
  }
  async setSkill(data: { user_id: string; skill_type: string; level: number; is_certified?: boolean; certification_expiry?: string }) {
    return this.request<any>('/api/scheduling/skills', { method: 'POST', body: JSON.stringify(data) });
  }
  async deleteSkill(id: string) { return this.request(`/api/scheduling/skills/${id}`, { method: 'DELETE' }); }
  async getMachineRequirements(machineId: string) { return this.request<any[]>(`/api/scheduling/machines/${machineId}/requirements`); }
  async setMachineRequirement(machineId: string, data: { skill_type: string; min_level: number }) {
    return this.request<any>(`/api/scheduling/machines/${machineId}/requirements`, { method: 'POST', body: JSON.stringify(data) });
  }
  async getAvailability(dateFrom: string, dateTo: string, userId?: string) {
    const sp = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (userId) sp.set('user_id', userId);
    return this.request<any[]>(`/api/scheduling/availability?${sp}`);
  }
  async setAvailability(data: { user_id: string; date: string; shift_type?: string; status: string; notes?: string }) {
    return this.request<any>('/api/scheduling/availability', { method: 'POST', body: JSON.stringify(data) });
  }
  async suggestAssignment(woId: string) { return this.request<any[]>(`/api/scheduling/suggest-assignment/${woId}`); }
  async getTeamWorkload(dateFrom: string, dateTo: string) {
    return this.request<any[]>(`/api/scheduling/team-workload?date_from=${dateFrom}&date_to=${dateTo}`);
  }

  // --- AI (infrastructure — activate per customer) ---
  async getAIStatus() { return this.request<any>('/api/ai/status'); }
  async aiGenerateDescription(machineId: string, alertId?: string) {
    return this.request<any>('/api/ai/generate-description', { method: 'POST', body: JSON.stringify({ machine_id: machineId, alert_id: alertId }) });
  }
  async aiAnalyzeAnomaly(machineId: string, nodeId?: string) {
    return this.request<any>('/api/ai/analyze-anomaly', { method: 'POST', body: JSON.stringify({ machine_id: machineId, node_id: nodeId }) });
  }
  async aiChat(message: string, conversationId?: string, machineId?: string) {
    return this.request<any>('/api/ai/chat', { method: 'POST', body: JSON.stringify({ message, conversation_id: conversationId, machine_id: machineId }) });
  }

  // --- Production Data ---
  async getProductionLogs(params?: { machine_id?: string; date_from?: string; date_to?: string; limit?: number; offset?: number }) {
    const sp = new URLSearchParams();
    if (params?.machine_id) sp.set('machine_id', params.machine_id);
    if (params?.date_from) sp.set('date_from', params.date_from);
    if (params?.date_to) sp.set('date_to', params.date_to);
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return this.request<any[]>(`/api/production${qs ? `?${qs}` : ''}`);
  }

  async createProductionLog(data: {
    machine_id?: string; shift_date: string; shift_type?: string;
    planned_units?: number; actual_units?: number; defect_units?: number;
    planned_runtime_minutes?: number; actual_runtime_minutes?: number;
    downtime_minutes?: number; ideal_cycle_time_seconds?: number;
    product_type?: string; batch_number?: string; operator_name?: string; notes?: string;
  }) {
    return this.request<any>('/api/production', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateProductionLog(id: string, data: any) {
    return this.request<any>(`/api/production/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteProductionLog(id: string) {
    return this.request(`/api/production/${id}`, { method: 'DELETE' });
  }

  async importProductionCSV(file: File) {
    const token = this.getToken();
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/api/production/import-csv`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Import failed: ${response.status}`);
    }
    return response.json();
  }

  async getProductionSummary(params?: { machine_id?: string; date_from?: string; date_to?: string }) {
    const sp = new URLSearchParams();
    if (params?.machine_id) sp.set('machine_id', params.machine_id);
    if (params?.date_from) sp.set('date_from', params.date_from);
    if (params?.date_to) sp.set('date_to', params.date_to);
    const qs = sp.toString();
    return this.request<any>(`/api/production/summary${qs ? `?${qs}` : ''}`);
  }

  async getProductionOEETrend(params?: { machine_id?: string; days?: number }) {
    const sp = new URLSearchParams();
    if (params?.machine_id) sp.set('machine_id', params.machine_id);
    if (params?.days) sp.set('days', String(params.days));
    const qs = sp.toString();
    return this.request<any[]>(`/api/production/oee-trend${qs ? `?${qs}` : ''}`);
  }

  async seedProductionDemo() {
    return this.request<any>('/api/production/seed-demo', { method: 'POST' });
  }

  // --- Dashboard Preferences ---
  async getDashboardPreferences() {
    return this.request('/api/dashboard/preferences');
  }

  async updateDashboardPreferences(prefs: any) {
    return this.request('/api/dashboard/preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    });
  }

  // --- WebSocket ---
  connectLive(onMessage: (data: any) => void): WebSocket {
    const token = this.getToken();
    const ws = new WebSocket(`${WS_BASE}/api/dashboard/ws/telemetry${token ? `?token=${token}` : ''}`);
    ws.onmessage = (event) => onMessage(JSON.parse(event.data));
    ws.onerror = (error) => console.error('WebSocket error:', error);
    return ws;
  }
}

export const api = new ApiClient();
