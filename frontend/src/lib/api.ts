/**
 * FactoryBrain API client.
 * Handles authentication, requests, and WebSocket connections.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  tenant_id: string;
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

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `API error: ${response.status}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json();
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

  async getMachineThresholds(id: string) {
    return this.request(`/api/machines/${id}/thresholds`);
  }

  async updateMachineThresholds(id: string, overrides: Record<string, number | null>) {
    return this.request(`/api/machines/${id}/thresholds`, {
      method: 'PUT',
      body: JSON.stringify(overrides),
    });
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

  async getWorkOrders(status?: string) {
    const params = status ? `?status=${status}` : '';
    return this.request(`/api/maintenance/work-orders${params}`);
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
    const ws = new WebSocket(`${WS_BASE}/api/dashboard/ws/telemetry`);
    ws.onmessage = (event) => onMessage(JSON.parse(event.data));
    ws.onerror = (error) => console.error('WebSocket error:', error);
    return ws;
  }
}

export const api = new ApiClient();
