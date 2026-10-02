import { Router, Request, Response } from 'express';
import { Database, getMySqlStatus, runFullSchemaInit, initDatabaseConnection, ensureDbConnected } from './db';
import { RegistrationItem, MatchItem, CategoryDetail, SponsorItem } from '../src/types';
import { generateUniqueRegCode } from '../src/utils/registrationCode';
import { blobRouter } from './blob';
import { r2Router } from './r2';
import { mediaRouter } from './mediaRoutes';

export const apiRouter = Router();

// Mount TiDB Centralized Media Storage Router
apiRouter.use(mediaRouter);

// Mount Cloudflare R2 and Vercel Blob cloud upload handlers as legacy fallback
apiRouter.use(r2Router);
apiRouter.use(blobRouter);

// Helper to deeply extract media storage IDs from any text or nested data structure
export function extractMediaIds(data: any): string[] {
  const ids = new Set<string>();
  if (!data) return [];

  const checkStr = (str: string) => {
    if (!str || typeof str !== 'string') return;
    const viewMatches = str.match(/\/api\/media\/view\/([a-zA-Z0-9_-]+)/g);
    if (viewMatches) {
      for (const m of viewMatches) {
        const id = m.replace('/api/media/view/', '').split(/[?#]/)[0];
        if (id) ids.add(id);
      }
    }
    const directMatches = str.match(/\bmed-\d+-[a-zA-Z0-9_-]+\b/g);
    if (directMatches) {
      for (const m of directMatches) {
        ids.add(m);
      }
    }
  };

  const walk = (item: any) => {
    if (!item) return;
    if (typeof item === 'string') {
      checkStr(item);
    } else if (Array.isArray(item)) {
      for (const x of item) walk(x);
    } else if (typeof item === 'object') {
      for (const v of Object.values(item)) walk(v);
    }
  };

  walk(data);
  return Array.from(ids);
}

// Helper to associate media storage records with parent entities for automatic cascading cleanup
export async function linkRegistrationMedia(regId: string, teamLogo?: string, documents?: Record<string, any>) {
  try {
    if (!regId) return;

    if (teamLogo) {
      const logoIds = extractMediaIds(teamLogo);
      for (const id of logoIds) {
        await Database.updateMediaRef(id, regId, 'teamLogo');
      }
    }

    if (documents) {
      const docsObj = typeof documents === 'string' ? (() => { try { return JSON.parse(documents); } catch { return {}; } })() : documents;
      if (docsObj && typeof docsObj === 'object') {
        for (const [key, val] of Object.entries(docsObj)) {
          const docIds = extractMediaIds(val);
          for (const id of docIds) {
            await Database.updateMediaRef(id, regId, key);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[linkRegistrationMedia warning]', err);
  }
}

async function linkSponsorMedia(sponsorId: string, logoUrl?: string) {
  try {
    if (logoUrl && logoUrl.includes('/api/media/view/')) {
      const match = logoUrl.match(/\/api\/media\/view\/([^/?#]+)/);
      if (match && match[1]) {
        await Database.updateMediaRef(match[1], sponsorId, 'sponsorLogo');
      }
    }
  } catch (err) {
    console.warn('[linkSponsorMedia warning]', err);
  }
}

// 1. Health & Database Status
apiRouter.get('/health', async (req: Request, res: Response) => {
  await ensureDbConnected();
  const status = getMySqlStatus();
  res.json({
    status: 'online',
    system: 'WabupCup 2026 Full-Stack Engine',
    timestamp: new Date().toISOString(),
    database: status,
  });
});

// 2. Database Init / Migration Trigger
apiRouter.post('/database/init', async (req: Request, res: Response) => {
  try {
    const result = await runFullSchemaInit();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Database init failed' });
  }
});

// 3. Test & Reconnect Database
apiRouter.post('/database/reconnect', async (req: Request, res: Response) => {
  try {
    const connected = await initDatabaseConnection();
    const status = getMySqlStatus();
    res.json({
      success: connected,
      status,
      error: !connected ? (status.error || 'Tidak dapat terhubung ke MySQL server. Periksa konfigurasi .env') : undefined,
    });
  } catch (err: any) {
    const status = getMySqlStatus();
    res.json({
      success: false,
      error: err?.message || 'Gagal memeriksa koneksi database',
      status,
    });
  }
});

// 3b. Configure & Connect Database dynamically (TiDB Cloud / Custom MySQL)
apiRouter.post('/database/connect', async (req: Request, res: Response) => {
  try {
    const config = req.body || {};
    const connected = await initDatabaseConnection(config);
    const status = getMySqlStatus();
    if (connected) {
      res.json({
        success: true,
        message: 'Koneksi database MySQL/TiDB Cloud berhasil terhubung dan tabel telah tersinkronisasi!',
        status,
      });
    } else {
      res.json({
        success: false,
        error: status.error || 'Gagal terhubung ke MySQL dengan konfigurasi yang diberikan. Periksa kredensial/koneksi.',
        status,
      });
    }
  } catch (err: any) {
    res.json({
      success: false,
      error: err?.message || 'Terjadi kesalahan saat menghubungkan database',
      status: getMySqlStatus(),
    });
  }
});

// 4. Export Complete SQL Dump
apiRouter.get('/database/export-sql', async (req: Request, res: Response) => {
  try {
    const sqlDump = await Database.exportFullSqlDump();
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', 'attachment; filename="wabupcup_2026_backup.sql"');
    res.send(sqlDump);
  } catch (err: any) {
    res.status(500).send(`-- Error generating SQL dump: ${err?.message}`);
  }
});

// 5. Config
apiRouter.get('/config', async (req: Request, res: Response) => {
  const config = await Database.getConfig();
  res.json(config);
});

apiRouter.put('/config', async (req: Request, res: Response) => {
  try {
    const updated = await Database.updateConfig(req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 6. Categories
apiRouter.get('/categories', async (req: Request, res: Response) => {
  const categories = await Database.getCategories();
  res.json(categories);
});

apiRouter.post('/categories/sync-quota', async (req: Request, res: Response) => {
  try {
    await Database.syncCategoryRegisteredCounts();
    const categories = await Database.getCategories();
    res.json({ success: true, categories });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/categories', async (req: Request, res: Response) => {
  try {
    const saved = await Database.saveCategory(req.body);
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/categories/reorder', async (req: Request, res: Response) => {
  try {
    const list = Array.isArray(req.body) ? req.body : req.body.categories;
    const saved = await Database.reorderCategories(list || []);
    res.json({ success: true, categories: saved });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.put('/categories/:id', async (req: Request, res: Response) => {
  try {
    const saved = await Database.saveCategory(req.body);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.delete('/categories/:id', async (req: Request, res: Response) => {
  try {
    await Database.deleteCategory(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 7. Registrations
apiRouter.get('/registrations', async (req: Request, res: Response) => {
  const list = await Database.getRegistrations();
  res.json(list);
});

apiRouter.post('/registrations', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (!data || !data.teamName || !data.category || !data.coachName || !data.coachPhone) {
      return res.status(400).json({
        error: 'Data tidak lengkap. Field wajib: teamName, category, coachName, coachPhone.',
      });
    }

    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // Fetch latest registrations & categories directly from database
    const [existing, categories] = await Promise.all([
      Database.getRegistrations(),
      Database.getCategories(),
    ]);

    // Strict quota check: Reject if category has reached its maximum quota
    const targetCat = categories.find(
      c => String(c.id).trim().toUpperCase() === String(data.category).trim().toUpperCase()
    );
    if (targetCat) {
      const activeInCat = existing.filter(
        r => r.category && String(r.category).trim().toUpperCase() === String(data.category).trim().toUpperCase() && r.status !== 'REJECTED'
      );
      if (activeInCat.length >= targetCat.maxTeams) {
        return res.status(400).json({
          error: `Kuota pendaftaran untuk kategori ${targetCat.name || data.category} telah penuh (${targetCat.maxTeams} tim)! Pendaftaran untuk kategori ini sudah ditutup.`,
        });
      }
    }
    
    // Check if client-provided regCode is non-empty AND genuinely unused
    
    // Check if client-provided regCode is non-empty AND genuinely unused
    const candidateCode = typeof data.regCode === 'string' ? data.regCode.trim().toUpperCase() : '';
    const isCodeInUse = candidateCode !== '' && existing.some(r => r.regCode && r.regCode.trim().toUpperCase() === candidateCode);

    // If no regCode or candidate code is already in use by any team, generate a brand new unique sequential code
    const regCode = (!candidateCode || isCodeInUse)
      ? generateUniqueRegCode(data.category, existing)
      : candidateCode;

    // Ensure ID is fresh and cannot collide with any existing registration
    const candidateId = typeof data.id === 'string' ? data.id.trim() : '';
    const isIdInUse = candidateId !== '' && existing.some(r => r.id === candidateId);
    const id = (!candidateId || isIdInUse)
      ? `reg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      : candidateId;

    const newReg: RegistrationItem = {
      ...data,
      id,
      regCode,
      registrationDate: data.registrationDate || formattedDate,
      status: data.status || 'PENDING_PAYMENT',
      paymentStatus: data.paymentStatus || 'UNPAID',
      lastUpdated: formattedDate,
    };

    const saved = await Database.saveRegistration(newReg);
    // Link uploaded media storage records to this registration ID for cascading cleanup
    await linkRegistrationMedia(newReg.id, newReg.teamLogo, newReg.documents);
    res.status(201).json(saved);
  } catch (err: any) {
    console.error('[API] Error in POST /api/registrations:', err);
    res.status(500).json({ error: err?.message || 'Gagal menyimpan pendaftaran' });
  }
});

apiRouter.put('/registrations/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'ID pendaftaran diperlukan.' });
    }

    const existingList = await Database.getRegistrations();
    const current = existingList.find(r => r.id === id);
    if (!current) {
      return res.status(404).json({ error: 'Data pendaftaran tidak ditemukan.' });
    }

    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const updatedItem: RegistrationItem = {
      ...current,
      ...req.body,
      id, // Preserve ID
      regCode: current.regCode, // Preserve original regCode
      lastUpdated: formattedDate,
    };

    // Cascading media cleanup: detect any media files from previous registration that were replaced or removed
    const oldMediaIds = new Set([
      ...extractMediaIds(current.teamLogo),
      ...extractMediaIds(current.documents),
    ]);
    const newMediaIds = new Set([
      ...extractMediaIds(updatedItem.teamLogo),
      ...extractMediaIds(updatedItem.documents),
    ]);

    for (const oldId of oldMediaIds) {
      if (!newMediaIds.has(oldId)) {
        await Database.deleteMedia(oldId);
        console.log(`[Storage Cleanup] Replaced/removed old media file ${oldId} deleted from TiDB Cloud for registration ${id}`);
      }
    }

    const saved = await Database.saveRegistration(updatedItem);
    // Link updated media storage records to this registration ID
    await linkRegistrationMedia(id, updatedItem.teamLogo, updatedItem.documents);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal memperbarui pendaftaran' });
  }
});

apiRouter.patch('/registrations/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, reason, notes } = req.body;
    const list = await Database.getRegistrations();
    const item = list.find(r => r.id === id);
    if (!item) {
      return res.status(404).json({ error: 'Registration not found' });
    }
    const updated: RegistrationItem = {
      ...item,
      status,
      rejectionReason: reason !== undefined ? reason : item.rejectionReason,
      adminNotes: notes !== undefined ? notes : item.adminNotes,
      lastUpdated: new Date().toISOString().replace('T', ' ').substring(0, 16),
    };
    await Database.saveRegistration(updated);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.patch('/registrations/:id/payment', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;
    const list = await Database.getRegistrations();
    const item = list.find(r => r.id === id);
    if (!item) {
      return res.status(404).json({ error: 'Registration not found' });
    }
    const newStatus = paymentStatus === 'PAID' && item.status === 'PENDING_PAYMENT' ? 'APPROVED' : item.status;
    const updated: RegistrationItem = {
      ...item,
      paymentStatus,
      status: newStatus,
      lastUpdated: new Date().toISOString().replace('T', ' ').substring(0, 16),
    };
    await Database.saveRegistration(updated);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.delete('/registrations/:id', async (req: Request, res: Response) => {
  try {
    await Database.deleteRegistration(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 8. Matches & Live Score
apiRouter.get('/matches', async (req: Request, res: Response) => {
  const matches = await Database.getMatches();
  res.json(matches);
});

apiRouter.post('/matches', async (req: Request, res: Response) => {
  try {
    const id = req.body.id || `match-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const saved = await Database.saveMatch({ ...req.body, id });
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/matches/replace-category', async (req: Request, res: Response) => {
  try {
    const { category, matches } = req.body;
    if (!category || !Array.isArray(matches)) {
      return res.status(400).json({ error: 'category and matches array are required' });
    }
    const saved = await Database.replaceCategoryMatches(category, matches);
    res.json({ success: true, count: saved.length, matches: saved });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/matches/batch', async (req: Request, res: Response) => {
  try {
    const list = Array.isArray(req.body) ? req.body : req.body.matches;
    const saved = await Database.saveMatchesBatch(list || []);
    res.json({ success: true, count: saved.length, matches: saved });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.put('/matches/:id', async (req: Request, res: Response) => {
  try {
    const saved = await Database.saveMatch(req.body);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.delete('/matches/:id', async (req: Request, res: Response) => {
  try {
    await Database.deleteMatch(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 9. Sponsors
apiRouter.get('/sponsors', async (req: Request, res: Response) => {
  const list = await Database.getSponsors();
  res.json(list);
});

apiRouter.post('/sponsors', async (req: Request, res: Response) => {
  try {
    const id = req.body.id || `sp-${Date.now()}`;
    const saved = await Database.saveSponsor({ ...req.body, id });
    await linkSponsorMedia(id, saved.logoUrl);
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.put('/sponsors/:id', async (req: Request, res: Response) => {
  try {
    const saved = await Database.saveSponsor(req.body);
    await linkSponsorMedia(req.params.id, saved.logoUrl);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.delete('/sponsors/:id', async (req: Request, res: Response) => {
  try {
    await Database.deleteSponsor(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 10. Admin Users & Auth
apiRouter.get('/admins', async (req: Request, res: Response) => {
  try {
    const admins = await Database.getAdmins();
    res.json(admins);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/admins', async (req: Request, res: Response) => {
  try {
    const { username, fullName, role, email, phone, avatarColor, password } = req.body;
    if (!username || !fullName) {
      return res.status(400).json({ error: 'Username dan Nama Lengkap wajib diisi' });
    }
    const cleanUsername = username.toLowerCase().trim().replace(/[^a-z0-9_.]/g, '');
    const newAdmin = {
      id: `adm-${Date.now()}`,
      username: cleanUsername,
      fullName: fullName.trim(),
      role: role || 'PANITIA_INTI',
      email: email ? email.trim() : '',
      phone: phone ? phone.trim() : '',
      avatarColor: avatarColor || 'bg-red-600',
      createdAt: new Date().toISOString().split('T')[0],
      password: password || 'admin123',
    };
    const saved = await Database.saveAdmin(newAdmin, password);
    const dbStatus = getMySqlStatus();
    res.status(201).json({
      success: true,
      ...saved,
      savedToDatabase: dbStatus.connected,
      databaseMode: dbStatus.mode,
      databaseHost: dbStatus.host,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal menambahkan admin' });
  }
});

apiRouter.put('/admins/:id', async (req: Request, res: Response) => {
  try {
    const { username, fullName, role, email, phone, avatarColor, password } = req.body;
    const existingList = await Database.getAdmins();
    const target = existingList.find(a => a.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Admin dengan ID tersebut tidak ditemukan' });
    }
    const updatedAdmin = {
      ...target,
      username: username ? username.toLowerCase().trim() : target.username,
      fullName: fullName !== undefined ? fullName.trim() : target.fullName,
      role: role || target.role,
      email: email !== undefined ? email.trim() : target.email,
      phone: phone !== undefined ? phone.trim() : target.phone,
      avatarColor: avatarColor || target.avatarColor,
      password: password || target.password,
    };
    const saved = await Database.saveAdmin(updatedAdmin, password);
    const dbStatus = getMySqlStatus();
    res.json({
      success: true,
      ...saved,
      savedToDatabase: dbStatus.connected,
      databaseMode: dbStatus.mode,
      databaseHost: dbStatus.host,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal memperbarui admin' });
  }
});

apiRouter.delete('/admins/:id', async (req: Request, res: Response) => {
  try {
    const success = await Database.deleteAdmin(req.params.id);
    if (!success) {
      return res.status(400).json({ error: 'Akun Superadmin utama tidak dapat dihapus demi keamanan sistem.' });
    }
    const dbStatus = getMySqlStatus();
    res.json({ success: true, id: req.params.id, savedToDatabase: dbStatus.connected });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal menghapus admin' });
  }
});

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
    }
    const result = await Database.verifyAdminLogin(username, password);
    if (result.success && result.user) {
      return res.json({ success: true, user: result.user });
    }
    res.status(401).json({ success: false, message: result.error || 'Username atau password salah' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Gagal memproses login' });
  }
});
