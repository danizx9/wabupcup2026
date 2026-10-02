import {
  CategoryDetail,
  MatchItem,
  RegistrationItem,
  SponsorItem,
  TournamentConfig,
  AdminUser,
} from '../types';

const API_BASE = '/api';

async function safeJsonFetch<T>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      return null;
    }
    const text = await res.text();
    if (!text || text.trim() === '') return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

export const ApiService = {
  // Check Health & DB status
  async getHealth() {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (!res.ok) {
        return {
          status: 'local',
          database: { connected: false, mode: 'CLIENT_STORAGE', error: `Server returned status ${res.status}` },
        };
      }
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return {
          status: 'local',
          database: { connected: false, mode: 'CLIENT_STORAGE', error: 'Invalid JSON response from server' },
        };
      }
    } catch (err: any) {
      return {
        status: 'local',
        database: { connected: false, mode: 'CLIENT_STORAGE', error: err?.message },
      };
    }
  },

  async checkHealth() {
    return this.getHealth();
  },

  // Database actions
  async initDb(): Promise<{ success: boolean; message?: string; error?: string; status?: any }> {
    try {
      const res = await fetch(`${API_BASE}/database/init`, { method: 'POST' });
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        return json;
      } catch {
        return {
          success: false,
          error: `Server Response Error (${res.status}): ${text.substring(0, 100)}`,
        };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Gagal menghubungi server' };
    }
  },

  async reconnectDb(): Promise<{ success: boolean; status?: any; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/database/reconnect`, { method: 'POST' });
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        return json;
      } catch {
        return {
          success: false,
          error: `Server Response Error (${res.status}): ${text.substring(0, 100)}`,
        };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Gagal menghubungi server' };
    }
  },

  async connectDb(config: {
    databaseUrl?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    ssl?: boolean;
  }): Promise<{ success: boolean; message?: string; status?: any; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/database/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        return json;
      } catch {
        return {
          success: false,
          error: `Server Response Error (${res.status}): ${text.substring(0, 150)}`,
        };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Gagal menghubungi backend database' };
    }
  },

  getExportSqlUrl() {
    return `${API_BASE}/database/export-sql`;
  },

  // Config
  async getConfig(): Promise<TournamentConfig | null> {
    return safeJsonFetch<TournamentConfig>(`${API_BASE}/config`);
  },

  async updateConfig(config: Partial<TournamentConfig>): Promise<TournamentConfig | null> {
    return safeJsonFetch<TournamentConfig>(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  },

  // Categories
  async getCategories(): Promise<CategoryDetail[] | null> {
    return safeJsonFetch<CategoryDetail[]>(`${API_BASE}/categories`);
  },

  async saveCategory(category: CategoryDetail): Promise<CategoryDetail | null> {
    return safeJsonFetch<CategoryDetail>(`${API_BASE}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(category),
    });
  },

  async syncCategoryQuotas(): Promise<CategoryDetail[] | null> {
    const res = await safeJsonFetch<{ success: boolean; categories: CategoryDetail[] }>(`${API_BASE}/categories/sync-quota`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return res ? res.categories : null;
  },

  async reorderCategories(categories: CategoryDetail[]): Promise<CategoryDetail[] | null> {
    const res = await safeJsonFetch<{ success: boolean; categories: CategoryDetail[] }>(`${API_BASE}/categories/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories }),
    });
    return res ? res.categories : null;
  },

  async deleteCategory(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/categories/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  },

  // Registrations
  async getRegistrations(): Promise<RegistrationItem[] | null> {
    return safeJsonFetch<RegistrationItem[]>(`${API_BASE}/registrations`);
  },

  async createRegistration(data: Partial<RegistrationItem>): Promise<RegistrationItem | null> {
    return safeJsonFetch<RegistrationItem>(`${API_BASE}/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  async updateRegistration(item: RegistrationItem): Promise<RegistrationItem | null> {
    return safeJsonFetch<RegistrationItem>(`${API_BASE}/registrations/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
  },

  async updateRegistrationStatus(id: string, status: string, reason?: string, notes?: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/registrations/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason, notes }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async updatePaymentStatus(id: string, paymentStatus: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/registrations/${id}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentStatus }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async deleteRegistration(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/registrations/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  },

  // Matches
  async getMatches(): Promise<MatchItem[] | null> {
    return safeJsonFetch<MatchItem[]>(`${API_BASE}/matches`);
  },

  async saveMatch(match: MatchItem): Promise<MatchItem | null> {
    return safeJsonFetch<MatchItem>(`${API_BASE}/matches/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(match),
    });
  },

  async replaceCategoryMatches(category: string, matches: MatchItem[]): Promise<MatchItem[] | null> {
    const res = await safeJsonFetch<{ success: boolean; count: number; matches: MatchItem[] }>(`${API_BASE}/matches/replace-category`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, matches }),
    });
    return res ? res.matches : null;
  },

  async saveMatchesBatch(matches: MatchItem[]): Promise<MatchItem[] | null> {
    const res = await safeJsonFetch<{ success: boolean; count: number; matches: MatchItem[] }>(`${API_BASE}/matches/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matches }),
    });
    return res ? res.matches : null;
  },

  async deleteMatch(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/matches/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  },

  // Sponsors
  async getSponsors(): Promise<SponsorItem[] | null> {
    return safeJsonFetch<SponsorItem[]>(`${API_BASE}/sponsors`);
  },

  async saveSponsor(sponsor: SponsorItem): Promise<SponsorItem | null> {
    return safeJsonFetch<SponsorItem>(`${API_BASE}/sponsors/${sponsor.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sponsor),
    });
  },

  async deleteSponsor(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/sponsors/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  },

  // Admins & Auth
  async getAdmins(): Promise<AdminUser[] | null> {
    const res = await safeJsonFetch<any>(`${API_BASE}/admins`);
    if (res && Array.isArray(res.admins)) {
      return res.admins;
    }
    if (Array.isArray(res)) {
      return res;
    }
    return null;
  },

  async createAdmin(admin: Omit<AdminUser, 'id' | 'createdAt'> & { password?: string }): Promise<{ success: boolean; user?: AdminUser; error?: string; savedToDatabase?: boolean }> {
    try {
      const res = await fetch(`${API_BASE}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(admin),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return { success: false, error: data.error || `Error ${res.status}: Gagal membuat admin` };
      }
      return { success: true, user: data, savedToDatabase: data.savedToDatabase };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Gagal menghubungi server database' };
    }
  },

  async updateAdmin(id: string, admin: Partial<AdminUser> & { password?: string }): Promise<{ success: boolean; user?: AdminUser; error?: string; savedToDatabase?: boolean }> {
    try {
      const res = await fetch(`${API_BASE}/admins/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(admin),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return { success: false, error: data.error || `Error ${res.status}: Gagal memperbarui admin` };
      }
      return { success: true, user: data, savedToDatabase: data.savedToDatabase };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Gagal menghubungi server database' };
    }
  },

  async deleteAdmin(id: string): Promise<{ success: boolean; error?: string; savedToDatabase?: boolean }> {
    try {
      const res = await fetch(`${API_BASE}/admins/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || data.error) {
        return { success: false, error: data.error || 'Gagal menghapus admin' };
      }
      return { success: true, savedToDatabase: data.savedToDatabase };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Gagal menghubungi server database' };
    }
  },

  async loginAdmin(username: string, pass: string): Promise<{ success: boolean; user?: AdminUser; message?: string }> {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pass }),
      });
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return { success: false, message: 'Invalid response from server' };
      }
    } catch (err: any) {
      return { success: false, message: err?.message || 'Network error during login' };
    }
  },
};

