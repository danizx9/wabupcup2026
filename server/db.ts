import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_ADMIN_USERS,
  DEFAULT_CATEGORIES,
  DEFAULT_TOURNAMENT_CONFIG,
  DEFAULT_SECTIONS_VISIBILITY,
} from './defaultSystemData';
import {
  CategoryDetail,
  MatchItem,
  RegistrationItem,
  SponsorItem,
  TournamentConfig,
  AdminUser,
  CommitteeContact,
  CommitteeBankAccount,
  DownloadableDoc,
} from '../src/types';
import { generateUniqueRegCode } from '../src/utils/registrationCode';

// In-Memory Storage Fallback (used when MySQL host is not configured or in preview mode)
export interface AppMediaItem {
  id: string;
  category: string; // 'REG_DOC' | 'TEAM_LOGO' | 'CMS_WALLPAPER' | 'SPONSOR_LOGO' | 'GENERAL'
  refId?: string;
  subKey?: string;
  filename: string;
  contentType: string;
  fileSize: number;
  fileData: string;
  createdAt?: string;
  updatedAt?: string;
}

class MemoryStore {
  config: TournamentConfig = { ...DEFAULT_TOURNAMENT_CONFIG };
  categories: CategoryDetail[] = [...DEFAULT_CATEGORIES];
  registrations: RegistrationItem[] = [];
  matches: MatchItem[] = [];
  sponsors: SponsorItem[] = [];
  adminUsers: AdminUser[] = [...DEFAULT_ADMIN_USERS];
  media: Map<string, AppMediaItem> = new Map();
}

const memStore = new MemoryStore();

const LOCAL_STORE_FILE = path.join(process.cwd(), 'server', 'local-storage.json');

export function loadLocalStore(): void {
  try {
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      const raw = fs.readFileSync(LOCAL_STORE_FILE, 'utf-8');
      if (raw && raw.trim() !== '') {
        const data = JSON.parse(raw);
        if (data.config) memStore.config = data.config;
        if (Array.isArray(data.categories)) memStore.categories = data.categories;
        if (Array.isArray(data.registrations)) memStore.registrations = data.registrations;
        if (Array.isArray(data.matches)) memStore.matches = data.matches;
        if (Array.isArray(data.sponsors)) memStore.sponsors = data.sponsors;
        if (Array.isArray(data.adminUsers)) memStore.adminUsers = data.adminUsers;
        console.log('[Local Store] Loaded local database cache successfully.');
      }
    }
  } catch (err) {
    console.warn('[Local Store] Warning reading local-storage.json:', err);
  }
}

export function persistLocalStore(): void {
  try {
    const payload = {
      config: memStore.config,
      categories: memStore.categories,
      registrations: memStore.registrations,
      matches: memStore.matches,
      sponsors: memStore.sponsors,
      adminUsers: memStore.adminUsers,
    };
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Local Store] Warning saving local-storage.json:', err);
  }
}

// Initialize local store immediately
loadLocalStore();

let pool: mysql.Pool | null = null;
let isMySqlConnected = false;
let mySqlError: string | null = null;

export const DEFAULT_TIDB_URL =
  'mysql://G3R4PBkMaCJzYe3.root:uSjk1i2XTJoAV6of@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/wabupcup_db?sslaccept=strict';

const DB_CONFIG_FILE = path.join(process.cwd(), 'server', 'db-config.json');

export function loadSavedDbConfig(): CustomDbConfig | null {
  try {
    if (fs.existsSync(DB_CONFIG_FILE)) {
      const content = fs.readFileSync(DB_CONFIG_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('[DB Config] Could not read saved config file:', err);
  }
  return {
    databaseUrl: DEFAULT_TIDB_URL,
    host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: 'G3R4PBkMaCJzYe3.root',
    password: 'uSjk1i2XTJoAV6of',
    database: 'wabupcup_db',
    ssl: true,
  };
}

export function saveDbConfigFile(config: CustomDbConfig): void {
  try {
    fs.writeFileSync(DB_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    console.log('[DB Config] Successfully saved database configuration to', DB_CONFIG_FILE);
  } catch (err) {
    console.warn('[DB Config] Could not write config to file:', err);
  }
}

export function getMySqlStatus() {
  const host = process.env.MYSQL_HOST || (process.env.DATABASE_URL ? 'Via DATABASE_URL' : 'Not configured (In-Memory fallback)');
  const dbName = process.env.MYSQL_DATABASE || 'wabupcup_db';
  return {
    connected: isMySqlConnected,
    host,
    database: dbName,
    error: mySqlError,
    mode: isMySqlConnected ? 'MYSQL_REAL' : 'MEMORY_FALLBACK',
    stats: {
      categoriesCount: memStore.categories.length,
      registrationsCount: memStore.registrations.length,
      matchesCount: memStore.matches.length,
      sponsorsCount: memStore.sponsors.length,
      adminsCount: memStore.adminUsers.length,
    },
  };
}

function resolveSslConfig(urlOrHost?: string, explicitSsl?: boolean): any {
  // If explicitly disabled with false or 0
  if (process.env.MYSQL_SSL === 'false' || process.env.MYSQL_SSL === '0') {
    return undefined;
  }

  // Auto-detect cloud providers that strictly require SSL / TLS 1.2+
  const isCloudHost =
    urlOrHost &&
    (urlOrHost.includes('tidbcloud.com') ||
      urlOrHost.includes('psdb.cloud') ||
      urlOrHost.includes('aivencloud.com') ||
      urlOrHost.includes('railway.app') ||
      urlOrHost.includes('amazonaws.com') ||
      urlOrHost.includes('supabase.co') ||
      urlOrHost.includes('cockroachlabs.cloud'));

  const needsSsl =
    explicitSsl ||
    Boolean(isCloudHost) ||
    process.env.MYSQL_SSL === 'true' ||
    process.env.MYSQL_SSL === '1' ||
    Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.includes('ssl'));

  if (needsSsl) {
    // rejectUnauthorized: false is essential in serverless environments (Vercel) for managed cloud databases (TiDB Cloud)
    const rejectUnauthorized = process.env.MYSQL_SSL_REJECT_UNAUTHORIZED === 'true';
    return {
      minVersion: 'TLSv1.2',
      rejectUnauthorized,
    };
  }

  return undefined;
}

export interface CustomDbConfig {
  databaseUrl?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
}

let dbInitPromise: Promise<boolean> | null = null;
let lastFailedAttempt = 0;

export async function ensureDbConnected(): Promise<boolean> {
  if (isMySqlConnected && pool) {
    return true;
  }
  const dbUrl = (process.env.DATABASE_URL ? process.env.DATABASE_URL.trim() : undefined) || DEFAULT_TIDB_URL;
  const host = process.env.MYSQL_HOST ? process.env.MYSQL_HOST.trim() : undefined;
  if (!dbUrl && !host) {
    return false;
  }

  // Avoid repetitive timeout stalls when database is unreachable
  if (Date.now() - lastFailedAttempt < 30000) {
    return false;
  }

  if (!dbInitPromise) {
    dbInitPromise = initDatabaseConnection().then(res => {
      if (!res) {
        lastFailedAttempt = Date.now();
      } else {
        lastFailedAttempt = 0;
      }
      return res;
    }).finally(() => {
      dbInitPromise = null;
    });
  }

  // Guarantee max 2.5 seconds wait time to prevent blocking requests
  const timeoutPromise = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(isMySqlConnected), 2500);
  });

  try {
    return await Promise.race([dbInitPromise, timeoutPromise]);
  } catch {
    return isMySqlConnected;
  }
}

export async function initDatabaseConnection(customConfig?: CustomDbConfig): Promise<boolean> {
  lastFailedAttempt = 0;
  // If no customConfig provided, check if we have a saved config on disk
  const effectiveConfig = customConfig || loadSavedDbConfig();

  if (effectiveConfig) {
    if (effectiveConfig.databaseUrl !== undefined && effectiveConfig.databaseUrl.trim()) {
      process.env.DATABASE_URL = effectiveConfig.databaseUrl.trim();
    }
    if (effectiveConfig.host !== undefined && effectiveConfig.host.trim()) {
      process.env.MYSQL_HOST = effectiveConfig.host.trim();
    }
    if (effectiveConfig.port !== undefined) {
      process.env.MYSQL_PORT = String(effectiveConfig.port);
    }
    if (effectiveConfig.user !== undefined && effectiveConfig.user.trim()) {
      process.env.MYSQL_USER = effectiveConfig.user.trim();
    }
    if (effectiveConfig.password !== undefined) {
      process.env.MYSQL_PASSWORD = effectiveConfig.password;
    }
    if (effectiveConfig.database !== undefined && effectiveConfig.database.trim()) {
      process.env.MYSQL_DATABASE = effectiveConfig.database.trim();
    }
    if (effectiveConfig.ssl !== undefined) {
      process.env.MYSQL_SSL = effectiveConfig.ssl ? 'true' : 'false';
    }
  }

  const dbUrl = (process.env.DATABASE_URL ? process.env.DATABASE_URL.trim() : undefined) || DEFAULT_TIDB_URL;
  const host = process.env.MYSQL_HOST ? process.env.MYSQL_HOST.trim() : undefined;
  const user = process.env.MYSQL_USER ? process.env.MYSQL_USER.trim() : undefined;
  const password = process.env.MYSQL_PASSWORD !== undefined ? process.env.MYSQL_PASSWORD : undefined;
  const database = (process.env.MYSQL_DATABASE || 'wabupcup_db').trim();
  const isTidb = Boolean((dbUrl && dbUrl.includes('tidbcloud.com')) || (host && host.includes('tidbcloud.com')));
  const defaultPort = isTidb ? 4000 : 3306;
  const port = parseInt(process.env.MYSQL_PORT || String(defaultPort), 10);
  const useSsl = process.env.MYSQL_SSL === 'true' || process.env.MYSQL_SSL === '1' || isTidb;

  if (!dbUrl && !host) {
    console.log('[Database] No MySQL host or DATABASE_URL provided. Operating with in-memory persistence layer.');
    isMySqlConnected = false;
    mySqlError = 'Belum dikonfigurasi. Silakan atur kredensial database di tab Database.';
    return false;
  }

  try {
    let poolOptions: mysql.PoolOptions;

    if (dbUrl) {
      const ssl = resolveSslConfig(dbUrl, useSsl || isTidb);
      try {
        // Parse DATABASE_URL for fine-tuned PoolOptions with guaranteed SSL handling
        const parsedUrl = new URL(dbUrl);
        const urlDbName = parsedUrl.pathname.replace(/^\/+/, '') || database;
        const urlPort = parsedUrl.port ? parseInt(parsedUrl.port, 10) : (isTidb ? 4000 : 3306);
        poolOptions = {
          host: parsedUrl.hostname,
          port: urlPort,
          user: decodeURIComponent(parsedUrl.username),
          password: decodeURIComponent(parsedUrl.password),
          database: urlDbName,
          waitForConnections: true,
          connectionLimit: 4,
          maxIdle: 2,
          idleTimeout: 30000,
          enableKeepAlive: true,
          keepAliveInitialDelay: 10000,
          connectTimeout: 5000,
          queueLimit: 0,
          ssl: ssl || (isTidb ? { minVersion: 'TLSv1.2', rejectUnauthorized: false } : undefined),
        };
      } catch {
        // If not a standard URL object, pass uri with ssl option
        poolOptions = {
          uri: dbUrl,
          waitForConnections: true,
          connectionLimit: 4,
          maxIdle: 2,
          idleTimeout: 30000,
          enableKeepAlive: true,
          keepAliveInitialDelay: 10000,
          connectTimeout: 5000,
          queueLimit: 0,
          ssl,
        };
      }
    } else {
      const ssl = resolveSslConfig(host, useSsl || isTidb);
      poolOptions = {
        host,
        user,
        password,
        database,
        port: port || (isTidb ? 4000 : 3306),
        waitForConnections: true,
        connectionLimit: 4,
        maxIdle: 2,
        idleTimeout: 30000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        connectTimeout: 5000,
        queueLimit: 0,
        ssl: ssl || (isTidb ? { minVersion: 'TLSv1.2', rejectUnauthorized: false } : undefined),
      };
    }

    try {
      // Close previous pool if exists
      if (pool) {
        try { await pool.end(); } catch {}
      }
      pool = mysql.createPool(poolOptions);
      (pool as any).on?.('error', (poolErr: any) => {
        console.warn('[MySQL Pool Non-fatal Event]', poolErr?.message || poolErr);
      });
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();
    } catch (connErr: any) {
      // If error is Unknown database (ER_BAD_DB_ERROR / 1049), try connecting to default 'test' and creating db
      const isBadDb =
        connErr?.code === 'ER_BAD_DB_ERROR' ||
        connErr?.errno === 1049 ||
        (connErr?.message && connErr.message.toLowerCase().includes('unknown database'));

      if (isBadDb) {
        console.log(`[MySQL] Database "${database}" does not exist yet. Attempting to create automatically...`);
        try {
          const tempOptions = { ...poolOptions, database: isTidb ? 'test' : undefined, connectTimeout: 3000 };
          const tempConn = await mysql.createConnection(tempOptions as any);
          (tempConn as any).on?.('error', (err: any) => console.warn('[MySQL Temp Connection Event]', err?.message));
          await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4;`);
          await tempConn.end();

          // Re-create pool with the now existing database
          pool = mysql.createPool(poolOptions);
          (pool as any).on?.('error', (poolErr: any) => {
            console.warn('[MySQL Pool Non-fatal Event]', poolErr?.message || poolErr);
          });
          const connection = await pool.getConnection();
          await connection.ping();
          connection.release();
          console.log(`[MySQL] Database "${database}" created and connected successfully.`);
        } catch (createErr: any) {
          console.warn('[MySQL] Auto-create database fallback warning:', createErr?.message);
          // If CREATE DATABASE failed, connect using 'test' database in TiDB
          if (isTidb) {
            const fallbackOptions = { ...poolOptions, database: 'test' };
            pool = mysql.createPool(fallbackOptions);
            (pool as any).on?.('error', (poolErr: any) => {
              console.warn('[MySQL Pool Non-fatal Event]', poolErr?.message || poolErr);
            });
            const connection = await pool.getConnection();
            await connection.ping();
            connection.release();
          } else {
            throw connErr;
          }
        }
      } else {
        throw connErr;
      }
    }

    isMySqlConnected = true;
    mySqlError = null;
    console.log(`[MySQL] Successfully connected to MySQL database: ${database} at ${host || 'DATABASE_URL'}`);

    // If custom config was successfully connected, save to persistent config file
    if (customConfig) {
      saveDbConfigFile(customConfig);
    }

    // Auto-check and setup tables if needed
    await autoMigrateTables();
    return true;
  } catch (err: any) {
    isMySqlConnected = false;
    
    // Human-friendly Indonesian error messages for common database issues
    if (err?.code === 'ER_ACCESS_DENIED_ERROR' || err?.errno === 1045) {
      mySqlError = `Akses Ditolak (ER_ACCESS_DENIED): Password atau Username database tidak cocok. Silakan periksa atau buat ulang password di dashboard database online Anda (misal TiDB Cloud Console).`;
    } else if (err?.code === 'ENOTFOUND') {
      mySqlError = `Host Tidak Ditemukan (ENOTFOUND): Hostname '${host || 'DATABASE_URL'}' tidak dapat dihubungi. Periksa URL koneksi database.`;
    } else if (err?.code === 'ETIMEDOUT') {
      mySqlError = `Koneksi Timeout (ETIMEDOUT): Server database tidak merespons. Pastikan IP Allowlist diatur ke 0.0.0.0/0.`;
    } else {
      mySqlError = err?.message || 'Gagal terhubung ke MySQL';
    }
    
    console.warn(`[MySQL Warning] Could not connect to MySQL: ${mySqlError}. Using fallback storage.`);
    return false;
  }
}

async function autoMigrateTables() {
  if (!pool || !isMySqlConnected) return;

  try {
    const [rows]: any = await pool.query("SHOW TABLES LIKE 'categories'");
    if (rows.length === 0) {
      console.log('[MySQL] Tables not found. Initializing schema automatically...');
      await runFullSchemaInit();
    } else {
      // Safe non-blocking column upgrade for existing databases (e.g. migrate ENUM role to VARCHAR(64))
      try {
        await pool.query("ALTER TABLE admin_users MODIFY COLUMN role VARCHAR(64) NOT NULL DEFAULT 'PANITIA_INTI'");
      } catch (colErr: any) {
        // Table might not exist yet or already updated, safe to ignore
      }
    }
  } catch (err) {
    console.error('[MySQL] Error checking tables:', err);
  }
}

export async function runFullSchemaInit() {
  if (!pool || !isMySqlConnected) {
    return { success: true, message: 'In-memory data reloaded successfully' };
  }

  const queries = [
    `CREATE TABLE IF NOT EXISTS categories (
      id VARCHAR(32) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      badge_title VARCHAR(100) NULL,
      age_restriction VARCHAR(100) NOT NULL,
      max_teams INT NOT NULL DEFAULT 16,
      registered_teams_count INT NOT NULL DEFAULT 0,
      registration_fee DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      total_prize DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      description TEXT NULL,
      prizes_json JSON NULL,
      rules_json JSON NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS registrations (
      id VARCHAR(64) PRIMARY KEY,
      reg_code VARCHAR(32) NOT NULL UNIQUE,
      category_id VARCHAR(32) NOT NULL,
      team_name VARCHAR(150) NOT NULL,
      team_logo LONGTEXT NULL,
      institution_name VARCHAR(200) NOT NULL,
      coach_name VARCHAR(150) NOT NULL,
      coach_phone VARCHAR(50) NOT NULL,
      coach_email VARCHAR(150) NULL,
      player_count INT NOT NULL DEFAULT 18,
      official_count INT NOT NULL DEFAULT 3,
      registration_date VARCHAR(50) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'PENDING_PAYMENT',
      payment_status VARCHAR(32) NOT NULL DEFAULT 'UNPAID',
      payment_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      rejection_reason TEXT NULL,
      admin_notes TEXT NULL,
      documents_json JSON NULL,
      last_updated VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS matches (
      id VARCHAR(64) PRIMARY KEY,
      match_number INT NOT NULL,
      category_id VARCHAR(32) NOT NULL,
      round_name VARCHAR(100) NOT NULL,
      round_index INT NOT NULL DEFAULT 1,
      group_name VARCHAR(50) NULL,
      team_a_name VARCHAR(150) NOT NULL,
      team_a_institution VARCHAR(200) NULL,
      team_a_logo LONGTEXT NULL,
      team_a_score INT NULL,
      team_a_penalties INT NULL,
      team_b_name VARCHAR(150) NOT NULL,
      team_b_institution VARCHAR(200) NULL,
      team_b_logo LONGTEXT NULL,
      team_b_score INT NULL,
      team_b_penalties INT NULL,
      match_date VARCHAR(20) NOT NULL,
      match_time VARCHAR(20) NOT NULL,
      pitch VARCHAR(100) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'UPCOMING',
      live_minute VARCHAR(20) NULL,
      events_json JSON NULL,
      winner_id VARCHAR(10) NULL,
      next_match_id VARCHAR(64) NULL,
      next_match_slot VARCHAR(10) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS sponsors (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      tier VARCHAR(50) NOT NULL DEFAULT 'GOLD',
      logo_text VARCHAR(100) NOT NULL,
      logo_url LONGTEXT NULL,
      website_url VARCHAR(255) NULL,
      description TEXT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS admin_users (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(64) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(150) NOT NULL,
      role VARCHAR(64) NOT NULL DEFAULT 'PANITIA_INTI',
      email VARCHAR(150) NULL,
      phone VARCHAR(50) NULL,
      avatar_color VARCHAR(30) NOT NULL DEFAULT 'bg-red-600',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS tournament_config (
      config_key VARCHAR(64) PRIMARY KEY,
      config_value LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS app_media_storage (
      id VARCHAR(64) PRIMARY KEY,
      category VARCHAR(32) NOT NULL,
      ref_id VARCHAR(64) NULL,
      sub_key VARCHAR(64) NULL,
      filename VARCHAR(255) NOT NULL,
      content_type VARCHAR(100) NOT NULL,
      file_size INT NOT NULL,
      file_data LONGTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_category (category),
      INDEX idx_ref_id (ref_id),
      INDEX idx_sub_key (sub_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
  ];

  for (const q of queries) {
    await pool.query(q);
  }

  // Seed default categories if empty
  const [catRows]: any = await pool.query('SELECT COUNT(*) as count FROM categories');
  if (catRows[0].count === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      await pool.query(
        `INSERT INTO categories (id, name, badge_title, age_restriction, max_teams, registered_teams_count, registration_fee, total_prize, description, prizes_json, rules_json) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cat.id,
          cat.name,
          cat.badgeTitle || '',
          cat.ageRestriction,
          cat.maxTeams,
          cat.registeredTeamsCount,
          cat.registrationFee,
          cat.totalPrize,
          cat.description || '',
          JSON.stringify(cat.prizes),
          JSON.stringify(cat.rules),
        ]
      );
    }
  }

  // Seed default admin users if empty
  const [admRows]: any = await pool.query('SELECT COUNT(*) as count FROM admin_users');
  if (admRows[0].count === 0) {
    for (const adm of DEFAULT_ADMIN_USERS) {
      await pool.query(
        `INSERT INTO admin_users (id, username, password_hash, full_name, role, email, phone, avatar_color)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          adm.id,
          adm.username,
          adm.password || 'admin123',
          adm.fullName,
          adm.role,
          adm.email || '',
          adm.phone || '',
          adm.avatarColor || 'bg-red-600',
        ]
      );
    }
  }

  // Seed default config if empty
  const [cfgRows]: any = await pool.query('SELECT COUNT(*) as count FROM tournament_config');
  if (cfgRows[0].count === 0) {
    await pool.query(
      `INSERT INTO tournament_config (config_key, config_value) VALUES (?, ?)`,
      ['main_config', JSON.stringify(DEFAULT_TOURNAMENT_CONFIG)]
    );
  }

  return { success: true, message: 'MySQL Database Tables Initialized and Seeded Successfully' };
}

// ----------------------------------------------------
// DATABASE SERVICE METHODS (WITH AUTOMATIC HYBRID RESOLVER)
// ----------------------------------------------------

export const Database = {
  // Config
  async getConfig(): Promise<TournamentConfig> {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query('SELECT config_value FROM tournament_config WHERE config_key = ?', ['main_config']);
        if (rows.length > 0) {
          const parsed = JSON.parse(rows[0].config_value);
          return {
            ...DEFAULT_TOURNAMENT_CONFIG,
            ...parsed,
            sectionsVisibility: {
              ...DEFAULT_SECTIONS_VISIBILITY,
              ...(parsed.sectionsVisibility || {}),
            },
          };
        }
      } catch (err) {
        console.error('Error fetching config from MySQL:', err);
      }
    }
    return {
      ...memStore.config,
      sectionsVisibility: {
        ...DEFAULT_SECTIONS_VISIBILITY,
        ...(memStore.config.sectionsVisibility || {}),
      },
    };
  },

  async updateConfig(newConfig: Partial<TournamentConfig>): Promise<TournamentConfig> {
    await ensureDbConnected();
    const current = await this.getConfig();
    const updated: TournamentConfig = {
      ...current,
      ...newConfig,
      bankAccounts:
        newConfig.bankAccounts !== undefined
          ? newConfig.bankAccounts
          : current.bankAccounts || [],
      bankAccount:
        newConfig.bankAccount !== undefined
          ? newConfig.bankAccount
          : current.bankAccount,
      committeeContacts:
        newConfig.committeeContacts !== undefined
          ? newConfig.committeeContacts
          : current.committeeContacts || [],
      committeeEmails:
        newConfig.committeeEmails !== undefined
          ? newConfig.committeeEmails
          : current.committeeEmails || [],
      downloadableDocs:
        newConfig.downloadableDocs !== undefined
          ? newConfig.downloadableDocs
          : current.downloadableDocs || [],
      sectionsBackgrounds: {
        ...(current.sectionsBackgrounds || {}),
        ...(newConfig.sectionsBackgrounds || {}),
      },
      sectionsVisibility: {
        ...DEFAULT_SECTIONS_VISIBILITY,
        ...(current.sectionsVisibility || {}),
        ...(newConfig.sectionsVisibility || {}),
      },
    };

    // Offload any large Base64 data URIs from config into app_media_storage table
    // so tournament_config JSON stays tiny (<20KB) and NEVER breaches TiDB max entry size limit (6MB)
    const offloadMedia = async (
      dataUri: string | undefined,
      category: string,
      filename: string,
      refId: string,
      subKey: string
    ): Promise<string | undefined> => {
      if (!dataUri || !dataUri.startsWith('data:') || dataUri.length < 200) {
        return dataUri;
      }
      try {
        const id = `med-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        const mimeMatch = dataUri.match(/^data:([^;]+);base64,/);
        const contentType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
        const base64Content = dataUri.replace(/^data:[^;]+;base64,/, '');
        const fileSize = Math.round((base64Content.length * 3) / 4);

        await Database.saveMedia({
          id,
          category,
          refId,
          subKey,
          filename,
          contentType,
          fileSize,
          fileData: dataUri,
        });

        return `/api/media/view/${id}`;
      } catch (err) {
        console.error('Failed to offload Base64 to app_media_storage:', err);
        return dataUri;
      }
    };

    // 1. Offload downloadable documents
    if (updated.downloadableDocs && updated.downloadableDocs.length > 0) {
      for (let i = 0; i < updated.downloadableDocs.length; i++) {
        const doc = updated.downloadableDocs[i];
        if (doc.fileUrl && doc.fileUrl.startsWith('data:')) {
          const offloadedUrl = await offloadMedia(
            doc.fileUrl,
            'CMS_DOC',
            doc.fileName || `${(doc.title || 'dokumen').replace(/\s+/g, '_')}.${(doc.fileType || 'pdf').toLowerCase()}`,
            'config_doc',
            doc.id || `doc_${i}`
          );
          if (offloadedUrl) doc.fileUrl = offloadedUrl;
        }
      }
    }

    // 2. Offload primary template URLs
    if (updated.formulirTemplateUrl && updated.formulirTemplateUrl.startsWith('data:')) {
      const offloaded = await offloadMedia(
        updated.formulirTemplateUrl,
        'CMS_DOC',
        'Formulir_Pendaftaran.pdf',
        'config_template',
        'formulir'
      );
      if (offloaded) updated.formulirTemplateUrl = offloaded;
    }

    if (updated.suratPernyataanTemplateUrl && updated.suratPernyataanTemplateUrl.startsWith('data:')) {
      const offloaded = await offloadMedia(
        updated.suratPernyataanTemplateUrl,
        'CMS_DOC',
        'Surat_Pernyataan.pdf',
        'config_template',
        'surat_pernyataan'
      );
      if (offloaded) updated.suratPernyataanTemplateUrl = offloaded;
    }

    if (updated.regulasiPdfUrl && updated.regulasiPdfUrl.startsWith('data:')) {
      const offloaded = await offloadMedia(
        updated.regulasiPdfUrl,
        'CMS_DOC',
        'Buku_Regulasi.pdf',
        'config_template',
        'regulasi'
      );
      if (offloaded) updated.regulasiPdfUrl = offloaded;
    }

    // 3. Offload bank QRIS images
    const legacyBankAccount = updated.bankAccount as any;
    if (legacyBankAccount?.qrisImageUrl && typeof legacyBankAccount.qrisImageUrl === 'string' && legacyBankAccount.qrisImageUrl.startsWith('data:')) {
      const offloaded = await offloadMedia(
        legacyBankAccount.qrisImageUrl,
        'CMS_WALLPAPER',
        'QRIS_Bank.jpg',
        'config_bank',
        'qris'
      );
      if (offloaded) legacyBankAccount.qrisImageUrl = offloaded;
    }

    if (updated.bankAccounts && updated.bankAccounts.length > 0) {
      for (const b of updated.bankAccounts) {
        if (b.qrisImageUrl && b.qrisImageUrl.startsWith('data:')) {
          const offloaded = await offloadMedia(
            b.qrisImageUrl,
            'CMS_WALLPAPER',
            `QRIS_${b.id}.jpg`,
            'config_bank',
            b.id
          );
          if (offloaded) b.qrisImageUrl = offloaded;
        }
      }
    }

    // 4. Offload section background wallpapers
    if (updated.sectionsBackgrounds) {
      for (const [secKey, secBg] of Object.entries(updated.sectionsBackgrounds)) {
        if (secBg?.desktopImage && secBg.desktopImage.startsWith('data:')) {
          const offloaded = await offloadMedia(
            secBg.desktopImage,
            'CMS_WALLPAPER',
            `bg_${secKey}_desktop.jpg`,
            'config_bg',
            `${secKey}_desktop`
          );
          if (offloaded) secBg.desktopImage = offloaded;
        }
        if (secBg?.mobileImage && secBg.mobileImage.startsWith('data:')) {
          const offloaded = await offloadMedia(
            secBg.mobileImage,
            'CMS_WALLPAPER',
            `bg_${secKey}_mobile.jpg`,
            'config_bg',
            `${secKey}_mobile`
          );
          if (offloaded) secBg.mobileImage = offloaded;
        }
      }
    }

    memStore.config = updated;
    persistLocalStore();

    if (pool && isMySqlConnected) {
      try {
        await pool.query(
          `INSERT INTO tournament_config (config_key, config_value) VALUES (?, ?) 
           ON DUPLICATE KEY UPDATE config_value = ?`,
          ['main_config', JSON.stringify(updated), JSON.stringify(updated)]
        );
      } catch (err) {
        console.error('Error saving config to MySQL:', err);
      }
    }
    return updated;
  },

  // Categories
  async syncCategoryRegisteredCounts(): Promise<void> {
    if (pool && isMySqlConnected) {
      try {
        const [countsRows]: any = await pool.query(
          "SELECT category_id, COUNT(*) as cnt FROM registrations GROUP BY category_id"
        );
        const realCounts: Record<string, number> = {};
        if (Array.isArray(countsRows)) {
          for (const row of countsRows) {
            if (row.category_id) {
              realCounts[String(row.category_id).trim().toUpperCase()] = Number(row.cnt) || 0;
            }
          }
        }
        const [cats]: any = await pool.query('SELECT id FROM categories');
        if (Array.isArray(cats)) {
          const updatePromises = cats.map(c => {
            const catId = String(c.id).trim().toUpperCase();
            const count = realCounts[catId] ?? 0;
            return pool.query('UPDATE categories SET registered_teams_count = ? WHERE id = ?', [count, c.id]);
          });
          await Promise.all(updatePromises);
        }
      } catch (err) {
        console.warn('[Database] syncCategoryRegisteredCounts MySQL error:', err);
      }
    }

    const memCounts: Record<string, number> = {};
    for (const r of memStore.registrations) {
      if (r.category) {
        const cat = String(r.category).trim().toUpperCase();
        memCounts[cat] = (memCounts[cat] || 0) + 1;
      }
    }
    for (const c of memStore.categories) {
      const cat = String(c.id).trim().toUpperCase();
      c.registeredTeamsCount = memCounts[cat] ?? 0;
    }
    persistLocalStore();
  },

  async getCategories(): Promise<CategoryDetail[]> {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query('SELECT * FROM categories ORDER BY sort_order ASC, id ASC');
        
        // Dynamically compute the accurate registered teams count from registrations table
        let realCounts: Record<string, number> = {};
        try {
          const [countsRows]: any = await pool.query(
            "SELECT category_id, COUNT(*) as cnt FROM registrations GROUP BY category_id"
          );
          if (Array.isArray(countsRows)) {
            for (const row of countsRows) {
              if (row.category_id) {
                realCounts[String(row.category_id).trim().toUpperCase()] = Number(row.cnt) || 0;
              }
            }
          }
        } catch (cntErr) {
          console.warn('[Database] Error counting active registrations per category:', cntErr);
        }

        return rows.map((r: any) => {
          const catId = String(r.id).trim().toUpperCase();
          const dynamicCount = realCounts[catId] !== undefined ? realCounts[catId] : (r.registered_teams_count || 0);
          return {
            id: r.id,
            name: r.name,
            badgeTitle: r.badge_title,
            ageRestriction: r.age_restriction,
            maxTeams: r.max_teams,
            registeredTeamsCount: dynamicCount,
            registrationFee: Number(r.registration_fee),
            totalPrize: Number(r.total_prize),
            description: r.description,
            prizes: typeof r.prizes_json === 'string' ? JSON.parse(r.prizes_json) : (r.prizes_json || []),
            rules: typeof r.rules_json === 'string' ? JSON.parse(r.rules_json) : (r.rules_json || []),
          };
        });
      } catch (err) {
        console.error('Error getting categories from MySQL:', err);
      }
    }

    const memCounts: Record<string, number> = {};
    for (const r of memStore.registrations) {
      if (r.category) {
        const cat = String(r.category).trim().toUpperCase();
        memCounts[cat] = (memCounts[cat] || 0) + 1;
      }
    }

    return memStore.categories.map(c => ({
      ...c,
      registeredTeamsCount: memCounts[String(c.id).trim().toUpperCase()] !== undefined
        ? memCounts[String(c.id).trim().toUpperCase()]
        : (c.registeredTeamsCount || 0),
    }));
  },

  async saveCategory(cat: CategoryDetail): Promise<CategoryDetail> {
    await ensureDbConnected();

    // Preserve or dynamically calculate accurate registeredTeamsCount
    let realCount = cat.registeredTeamsCount;
    if (pool && isMySqlConnected) {
      try {
        const [cntRows]: any = await pool.query(
          "SELECT COUNT(*) as cnt FROM registrations WHERE category_id = ?",
          [cat.id]
        );
        if (Array.isArray(cntRows) && cntRows[0]) {
          realCount = Number(cntRows[0].cnt) || 0;
        }
      } catch {}
    } else {
      realCount = memStore.registrations.filter(
        r => String(r.category).trim().toUpperCase() === String(cat.id).trim().toUpperCase()
      ).length;
    }
    const catToSave = { ...cat, registeredTeamsCount: realCount };

    const idx = memStore.categories.findIndex(c => c.id === catToSave.id);
    if (idx >= 0) {
      memStore.categories[idx] = catToSave;
    } else {
      memStore.categories.push(catToSave);
    }
    persistLocalStore();

    if (pool && isMySqlConnected) {
      try {
        await pool.query(
          `INSERT INTO categories (id, name, badge_title, age_restriction, max_teams, registered_teams_count, registration_fee, total_prize, description, prizes_json, rules_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name=?, badge_title=?, age_restriction=?, max_teams=?, registered_teams_count=?, registration_fee=?, total_prize=?, description=?, prizes_json=?, rules_json=?`,
          [
            catToSave.id, catToSave.name, catToSave.badgeTitle || '', catToSave.ageRestriction, catToSave.maxTeams, catToSave.registeredTeamsCount, catToSave.registrationFee, catToSave.totalPrize, catToSave.description || '', JSON.stringify(catToSave.prizes), JSON.stringify(catToSave.rules),
            catToSave.name, catToSave.badgeTitle || '', catToSave.ageRestriction, catToSave.maxTeams, catToSave.registeredTeamsCount, catToSave.registrationFee, catToSave.totalPrize, catToSave.description || '', JSON.stringify(catToSave.prizes), JSON.stringify(catToSave.rules),
          ]
        );
      } catch (err) {
        console.error('Error saving category to MySQL:', err);
      }
    }
    return catToSave;
  },

  async deleteCategory(categoryId: string): Promise<boolean> {
    await ensureDbConnected();
    memStore.categories = memStore.categories.filter(c => c.id !== categoryId);
    persistLocalStore();
    if (pool && isMySqlConnected) {
      try {
        await pool.query('DELETE FROM categories WHERE id = ?', [categoryId]);
      } catch (err) {
        console.error('Error deleting category from MySQL:', err);
      }
    }
    return true;
  },

  async reorderCategories(categories: CategoryDetail[]): Promise<CategoryDetail[]> {
    await ensureDbConnected();
    memStore.categories = [...categories];
    persistLocalStore();
    if (pool && isMySqlConnected) {
      try {
        const updatePromises = categories.map((cat, i) => {
          return pool!.query(
            `INSERT INTO categories (id, name, badge_title, age_restriction, max_teams, registered_teams_count, registration_fee, total_prize, description, prizes_json, rules_json, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE sort_order = ?, name = ?, max_teams = ?, registration_fee = ?, total_prize = ?`,
            [
              cat.id, cat.name, cat.badgeTitle || '', cat.ageRestriction, cat.maxTeams, cat.registeredTeamsCount, cat.registrationFee, cat.totalPrize, cat.description || '', JSON.stringify(cat.prizes), JSON.stringify(cat.rules), i,
              i, cat.name, cat.maxTeams, cat.registrationFee, cat.totalPrize,
            ]
          );
        });
        await Promise.all(updatePromises);
      } catch (err) {
        console.error('Error reordering categories in MySQL:', err);
      }
    }
    return categories;
  },

  // Registrations
  async getRegistrations(): Promise<RegistrationItem[]> {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query('SELECT * FROM registrations ORDER BY created_at DESC');
        if (Array.isArray(rows)) {
          return rows.map((r: any) => ({
            id: r.id,
            regCode: r.reg_code,
            category: r.category_id,
            teamName: r.team_name,
            teamLogo: r.team_logo || undefined,
            institutionName: r.institution_name,
            coachName: r.coach_name,
            coachPhone: r.coach_phone,
            coachEmail: r.coach_email || '',
            playerCount: r.player_count,
            officialCount: r.official_count,
            registrationDate: r.registration_date,
            status: r.status,
            paymentStatus: r.payment_status,
            paymentAmount: Number(r.payment_amount),
            rejectionReason: r.rejection_reason || undefined,
            adminNotes: r.admin_notes || undefined,
            documents: typeof r.documents_json === 'string' ? JSON.parse(r.documents_json) : (r.documents_json || {}),
            lastUpdated: r.last_updated || r.registration_date,
          }));
        }
      } catch (err) {
        console.error('Error fetching registrations from MySQL:', err);
      }
    }
    return memStore.registrations;
  },

  async saveRegistration(item: RegistrationItem): Promise<RegistrationItem> {
    await ensureDbConnected();

    // Check if another registration in memory is already using this regCode with a different id
    const codeConflictMem = memStore.registrations.find(
      r => r.id !== item.id && r.regCode && item.regCode && r.regCode.trim().toUpperCase() === item.regCode.trim().toUpperCase()
    );
    if (codeConflictMem) {
      item.regCode = generateUniqueRegCode(item.category, memStore.registrations);
    }

    const idx = memStore.registrations.findIndex(r => r.id === item.id);
    if (idx >= 0) {
      memStore.registrations[idx] = item;
    } else {
      memStore.registrations.unshift(item);
    }
    persistLocalStore();

    if (pool && isMySqlConnected) {
      try {
        // 1. Check if record with this specific ID already exists in MySQL
        const [existingById]: any = await pool.query('SELECT id, reg_code FROM registrations WHERE id = ?', [item.id]);
        
        if (Array.isArray(existingById) && existingById.length > 0) {
          // UPDATE existing record strictly by PRIMARY KEY id
          await pool.execute(
            `UPDATE registrations SET
              reg_code=?, category_id=?, team_name=?, team_logo=?, institution_name=?,
              coach_name=?, coach_phone=?, coach_email=?, player_count=?, official_count=?,
              status=?, payment_status=?, payment_amount=?, rejection_reason=?, admin_notes=?,
              documents_json=?, last_updated=?
             WHERE id = ?`,
            [
              item.regCode, item.category, item.teamName, item.teamLogo || null, item.institutionName,
              item.coachName, item.coachPhone, item.coachEmail || '', item.playerCount, item.officialCount,
              item.status, item.paymentStatus, item.paymentAmount, item.rejectionReason || null, item.adminNotes || null,
              JSON.stringify(item.documents || {}), item.lastUpdated,
              item.id,
            ]
          );
        } else {
          // 2. INSERT new registration.
          // First check if another row in MySQL already holds this reg_code
          const [existingByCode]: any = await pool.query('SELECT id, reg_code FROM registrations WHERE reg_code = ?', [item.regCode]);
          if (Array.isArray(existingByCode) && existingByCode.length > 0) {
            // Code already in use by another team in MySQL! Retrieve all codes in category to find next unique
            const [allCatRows]: any = await pool.query('SELECT reg_code FROM registrations WHERE category_id = ?', [item.category]);
            const existingCatCodes = Array.isArray(allCatRows) ? allCatRows.map((r: any) => ({ regCode: r.reg_code })) : [];
            item.regCode = generateUniqueRegCode(item.category, [...memStore.registrations, ...existingCatCodes]);
            
            // Sync updated regCode to memStore
            const mIdx = memStore.registrations.findIndex(r => r.id === item.id);
            if (mIdx >= 0) memStore.registrations[mIdx].regCode = item.regCode;
            persistLocalStore();
          }

          try {
            await pool.execute(
              `INSERT INTO registrations (
                id, reg_code, category_id, team_name, team_logo, institution_name,
                coach_name, coach_phone, coach_email, player_count, official_count,
                registration_date, status, payment_status, payment_amount,
                rejection_reason, admin_notes, documents_json, last_updated
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                item.id, item.regCode, item.category, item.teamName, item.teamLogo || null, item.institutionName,
                item.coachName, item.coachPhone, item.coachEmail || '', item.playerCount, item.officialCount,
                item.registrationDate, item.status, item.paymentStatus, item.paymentAmount,
                item.rejectionReason || null, item.adminNotes || null, JSON.stringify(item.documents || {}), item.lastUpdated,
              ]
            );
          } catch (insertErr: any) {
            // If duplicate entry error occurs, regenerate code and retry once
            if (insertErr?.code === 'ER_DUP_ENTRY' || insertErr?.errno === 1062) {
              console.warn('[Database] Duplicate entry caught on insert, regenerating unique reg_code...');
              const [allRows]: any = await pool.query('SELECT reg_code FROM registrations WHERE category_id = ?', [item.category]);
              const existingCodes = Array.isArray(allRows) ? allRows.map((r: any) => ({ regCode: r.reg_code })) : [];
              item.regCode = generateUniqueRegCode(item.category, existingCodes);
              
              const mIdx = memStore.registrations.findIndex(r => r.id === item.id);
              if (mIdx >= 0) memStore.registrations[mIdx].regCode = item.regCode;
              persistLocalStore();

              await pool.execute(
                `INSERT INTO registrations (
                  id, reg_code, category_id, team_name, team_logo, institution_name,
                  coach_name, coach_phone, coach_email, player_count, official_count,
                  registration_date, status, payment_status, payment_amount,
                  rejection_reason, admin_notes, documents_json, last_updated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  item.id, item.regCode, item.category, item.teamName, item.teamLogo || null, item.institutionName,
                  item.coachName, item.coachPhone, item.coachEmail || '', item.playerCount, item.officialCount,
                  item.registrationDate, item.status, item.paymentStatus, item.paymentAmount,
                  item.rejectionReason || null, item.adminNotes || null, JSON.stringify(item.documents || {}), item.lastUpdated,
                ]
              );
            } else {
              throw insertErr;
            }
          }
        }
      } catch (err) {
        console.error('[Database] Error saving registration to MySQL:', err);
      }
    }
    this.syncCategoryRegisteredCounts().catch(() => {});
    return item;
  },

  async deleteRegistration(id: string): Promise<boolean> {
    await ensureDbConnected();

    // 1. Locate registration before deletion to extract all linked media IDs
    let localReg = memStore.registrations.find(r => r.id === id || r.regCode === id);
    let mySqlRow: any = null;

    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query('SELECT * FROM registrations WHERE id = ? OR reg_code = ? LIMIT 1', [id, id]);
        if (Array.isArray(rows) && rows.length > 0) {
          mySqlRow = rows[0];
          if (!localReg) {
            localReg = {
              id: mySqlRow.id,
              regCode: mySqlRow.reg_code,
              category: mySqlRow.category_id,
              teamName: mySqlRow.team_name,
              teamLogo: mySqlRow.team_logo,
              institutionName: mySqlRow.institution_name,
              coachName: mySqlRow.coach_name,
              coachPhone: mySqlRow.coach_phone,
              coachEmail: mySqlRow.coach_email,
              playerCount: Number(mySqlRow.player_count),
              officialCount: Number(mySqlRow.official_count),
              registrationDate: mySqlRow.registration_date,
              status: mySqlRow.status,
              paymentStatus: mySqlRow.payment_status,
              paymentAmount: Number(mySqlRow.payment_amount),
              rejectionReason: mySqlRow.rejection_reason,
              adminNotes: mySqlRow.admin_notes,
              documents: typeof mySqlRow.documents_json === 'string' ? JSON.parse(mySqlRow.documents_json) : (mySqlRow.documents_json || {}),
              lastUpdated: mySqlRow.last_updated,
            };
          }
        }
      } catch (err) {
        console.warn('[deleteRegistration] Error fetching registration for cascading media cleanup:', err);
      }
    }

    const regId = localReg?.id || (mySqlRow?.id ? String(mySqlRow.id) : id);
    const regCode = localReg?.regCode || (mySqlRow?.reg_code ? String(mySqlRow.reg_code) : undefined);

    // 2. Collect all media IDs associated with this registration
    const mediaIdsToDelete = new Set<string>();

    const scanForMedia = (data: any) => {
      if (!data) return;
      const str = typeof data === 'string' ? data : JSON.stringify(data);
      const viewMatches = str.match(/\/api\/media\/view\/([a-zA-Z0-9_-]+)/g);
      if (viewMatches) {
        for (const m of viewMatches) {
          const mId = m.replace('/api/media/view/', '').split(/[?#]/)[0];
          if (mId) mediaIdsToDelete.add(mId);
        }
      }
      const directMatches = str.match(/\bmed-\d+-[a-zA-Z0-9_-]+\b/g);
      if (directMatches) {
        for (const m of directMatches) {
          mediaIdsToDelete.add(m);
        }
      }
    };

    if (localReg) {
      scanForMedia(localReg.teamLogo);
      scanForMedia(localReg.documents);
    }
    if (mySqlRow) {
      scanForMedia(mySqlRow.team_logo);
      scanForMedia(mySqlRow.documents_json);
    }

    // Check in-memory media storage for matching ref_id
    for (const [mId, mItem] of memStore.media.entries()) {
      if (mItem.refId === regId || mItem.refId === id || (regCode && mItem.refId === regCode)) {
        mediaIdsToDelete.add(mId);
      }
    }

    // 3. Perform database cascading deletions in MySQL / TiDB Cloud
    if (pool && isMySqlConnected) {
      try {
        const refParams = [regId, id];
        if (regCode) refParams.push(regCode);
        const refPlaceholders = refParams.map(() => '?').join(',');

        // Find any media rows in app_media_storage tagged with ref_id
        const [dbMediaRows]: any = await pool.query(
          `SELECT id FROM app_media_storage WHERE ref_id IN (${refPlaceholders})`,
          refParams
        );
        if (Array.isArray(dbMediaRows)) {
          for (const row of dbMediaRows) {
            if (row.id) mediaIdsToDelete.add(row.id);
          }
        }

        // A. Cascading delete from app_media_storage by ref_id
        await pool.query(
          `DELETE FROM app_media_storage WHERE ref_id IN (${refPlaceholders})`,
          refParams
        );

        // B. Cascading delete from app_media_storage by collected media IDs (in case ref_id was NULL)
        if (mediaIdsToDelete.size > 0) {
          const idList = Array.from(mediaIdsToDelete);
          const idPlaceholders = idList.map(() => '?').join(',');
          await pool.query(
            `DELETE FROM app_media_storage WHERE id IN (${idPlaceholders})`,
            idList
          );
        }

        // C. Delete registration record from registrations table
        await pool.execute(
          'DELETE FROM registrations WHERE id = ? OR id = ? OR reg_code = ?',
          [regId, id, regCode || id]
        );

        console.log(`[Storage Cleanup] Successfully deleted registration ${regId} (${regCode || 'no-code'}) and ${mediaIdsToDelete.size} associated files (${Array.from(mediaIdsToDelete).join(', ')}) from TiDB app_media_storage`);
      } catch (err) {
        console.error('[Storage Cleanup] Error deleting registration and associated media from MySQL:', err);
      }
    }

    // 4. Clean up in-memory cache
    for (const mId of mediaIdsToDelete) {
      memStore.media.delete(mId);
    }
    for (const [mId, mItem] of memStore.media.entries()) {
      if (mItem.refId === regId || mItem.refId === id || (regCode && mItem.refId === regCode)) {
        memStore.media.delete(mId);
      }
    }

    memStore.registrations = memStore.registrations.filter(
      r => r.id !== regId && r.id !== id && (!regCode || r.regCode !== regCode)
    );
    persistLocalStore();

    this.syncCategoryRegisteredCounts().catch(() => {});

    return true;
  },

  // Matches
  async getMatches(): Promise<MatchItem[]> {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query('SELECT * FROM matches ORDER BY match_date ASC, match_time ASC, match_number ASC');
        if (Array.isArray(rows)) {
          return rows.map((r: any) => ({
            id: r.id,
            matchNumber: r.match_number,
            category: r.category_id,
            round: r.round_name,
            roundIndex: r.round_index,
            group: r.group_name || undefined,
            teamA: {
              name: r.team_a_name,
              institution: r.team_a_institution || undefined,
              logo: r.team_a_logo || undefined,
              score: r.team_a_score !== null ? Number(r.team_a_score) : undefined,
              penalties: r.team_a_penalties !== null ? Number(r.team_a_penalties) : undefined,
            },
            teamB: {
              name: r.team_b_name,
              institution: r.team_b_institution || undefined,
              logo: r.team_b_logo || undefined,
              score: r.team_b_score !== null ? Number(r.team_b_score) : undefined,
              penalties: r.team_b_penalties !== null ? Number(r.team_b_penalties) : undefined,
            },
            date: r.match_date,
            time: r.match_time,
            pitch: r.pitch,
            status: r.status,
            liveMinute: r.live_minute || undefined,
            events: typeof r.events_json === 'string' ? JSON.parse(r.events_json) : (r.events_json || []),
            winnerId: r.winner_id || undefined,
            nextMatchId: r.next_match_id || undefined,
            nextMatchSlot: r.next_match_slot || undefined,
          }));
        }
      } catch (err) {
        console.error('Error fetching matches from MySQL:', err);
      }
    }
    return memStore.matches;
  },

  async saveMatch(match: MatchItem): Promise<MatchItem> {
    await ensureDbConnected();
    const idx = memStore.matches.findIndex(m => m.id === match.id);
    if (idx >= 0) {
      memStore.matches[idx] = match;
    } else {
      memStore.matches.push(match);
    }
    persistLocalStore();

    if (pool && isMySqlConnected) {
      try {
        await pool.query(
          `INSERT INTO matches (id, match_number, category_id, round_name, round_index, group_name, team_a_name, team_a_institution, team_a_logo, team_a_score, team_a_penalties, team_b_name, team_b_institution, team_b_logo, team_b_score, team_b_penalties, match_date, match_time, pitch, status, live_minute, events_json, winner_id, next_match_id, next_match_slot)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE match_number=?, category_id=?, round_name=?, round_index=?, group_name=?, team_a_name=?, team_a_institution=?, team_a_logo=?, team_a_score=?, team_a_penalties=?, team_b_name=?, team_b_institution=?, team_b_logo=?, team_b_score=?, team_b_penalties=?, match_date=?, match_time=?, pitch=?, status=?, live_minute=?, events_json=?, winner_id=?, next_match_id=?, next_match_slot=?`,
          [
            match.id, match.matchNumber, match.category, match.round, match.roundIndex, match.group || null, match.teamA.name, match.teamA.institution || null, match.teamA.logo || null, match.teamA.score !== undefined ? match.teamA.score : null, match.teamA.penalties !== undefined ? match.teamA.penalties : null, match.teamB.name, match.teamB.institution || null, match.teamB.logo || null, match.teamB.score !== undefined ? match.teamB.score : null, match.teamB.penalties !== undefined ? match.teamB.penalties : null, match.date, match.time, match.pitch, match.status, match.liveMinute || null, JSON.stringify(match.events || []), match.winnerId || null, match.nextMatchId || null, match.nextMatchSlot || null,
            match.matchNumber, match.category, match.round, match.roundIndex, match.group || null, match.teamA.name, match.teamA.institution || null, match.teamA.logo || null, match.teamA.score !== undefined ? match.teamA.score : null, match.teamA.penalties !== undefined ? match.teamA.penalties : null, match.teamB.name, match.teamB.institution || null, match.teamB.logo || null, match.teamB.score !== undefined ? match.teamB.score : null, match.teamB.penalties !== undefined ? match.teamB.penalties : null, match.date, match.time, match.pitch, match.status, match.liveMinute || null, JSON.stringify(match.events || []), match.winnerId || null, match.nextMatchId || null, match.nextMatchSlot || null,
          ]
        );
      } catch (err) {
        console.error('Error saving match to MySQL:', err);
      }
    }
    return match;
  },

  async deleteMatch(matchId: string): Promise<boolean> {
    await ensureDbConnected();
    memStore.matches = memStore.matches.filter(m => m.id !== matchId);
    persistLocalStore();
    if (pool && isMySqlConnected) {
      try {
        await pool.query('DELETE FROM matches WHERE id = ?', [matchId]);
      } catch (err) {
        console.error('Error deleting match from MySQL:', err);
      }
    }
    return true;
  },

  async replaceCategoryMatches(category: string, newMatches: MatchItem[]): Promise<MatchItem[]> {
    await ensureDbConnected();
    // 1. Update in-memory store
    memStore.matches = memStore.matches.filter(m => m.category !== category).concat(newMatches);
    persistLocalStore();

    // 2. Update MySQL database
    if (pool && isMySqlConnected) {
      try {
        await pool.query('DELETE FROM matches WHERE category_id = ?', [category]);
        for (const match of newMatches) {
          await pool.query(
            `INSERT INTO matches (id, match_number, category_id, round_name, round_index, group_name, team_a_name, team_a_institution, team_a_logo, team_a_score, team_a_penalties, team_b_name, team_b_institution, team_b_logo, team_b_score, team_b_penalties, match_date, match_time, pitch, status, live_minute, events_json, winner_id, next_match_id, next_match_slot)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              match.id, match.matchNumber, match.category, match.round, match.roundIndex, match.group || null, match.teamA.name, match.teamA.institution || null, match.teamA.logo || null, match.teamA.score !== undefined ? match.teamA.score : null, match.teamA.penalties !== undefined ? match.teamA.penalties : null, match.teamB.name, match.teamB.institution || null, match.teamB.logo || null, match.teamB.score !== undefined ? match.teamB.score : null, match.teamB.penalties !== undefined ? match.teamB.penalties : null, match.date, match.time, match.pitch, match.status, match.liveMinute || null, JSON.stringify(match.events || []), match.winnerId || null, match.nextMatchId || null, match.nextMatchSlot || null,
            ]
          );
        }
      } catch (err) {
        console.error('Error replacing category matches in MySQL:', err);
      }
    }
    return newMatches;
  },

  async saveMatchesBatch(matchesToSave: MatchItem[]): Promise<MatchItem[]> {
    await ensureDbConnected();
    for (const match of matchesToSave) {
      const idx = memStore.matches.findIndex(m => m.id === match.id);
      if (idx >= 0) {
        memStore.matches[idx] = match;
      } else {
        memStore.matches.push(match);
      }

      if (pool && isMySqlConnected) {
        try {
          await pool.query(
            `INSERT INTO matches (id, match_number, category_id, round_name, round_index, group_name, team_a_name, team_a_institution, team_a_logo, team_a_score, team_a_penalties, team_b_name, team_b_institution, team_b_logo, team_b_score, team_b_penalties, match_date, match_time, pitch, status, live_minute, events_json, winner_id, next_match_id, next_match_slot)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE match_number=?, category_id=?, round_name=?, round_index=?, group_name=?, team_a_name=?, team_a_institution=?, team_a_logo=?, team_a_score=?, team_a_penalties=?, team_b_name=?, team_b_institution=?, team_b_logo=?, team_b_score=?, team_b_penalties=?, match_date=?, match_time=?, pitch=?, status=?, live_minute=?, events_json=?, winner_id=?, next_match_id=?, next_match_slot=?`,
            [
              match.id, match.matchNumber, match.category, match.round, match.roundIndex, match.group || null, match.teamA.name, match.teamA.institution || null, match.teamA.logo || null, match.teamA.score !== undefined ? match.teamA.score : null, match.teamA.penalties !== undefined ? match.teamA.penalties : null, match.teamB.name, match.teamB.institution || null, match.teamB.logo || null, match.teamB.score !== undefined ? match.teamB.score : null, match.teamB.penalties !== undefined ? match.teamB.penalties : null, match.date, match.time, match.pitch, match.status, match.liveMinute || null, JSON.stringify(match.events || []), match.winnerId || null, match.nextMatchId || null, match.nextMatchSlot || null,
              match.matchNumber, match.category, match.round, match.roundIndex, match.group || null, match.teamA.name, match.teamA.institution || null, match.teamA.logo || null, match.teamA.score !== undefined ? match.teamA.score : null, match.teamA.penalties !== undefined ? match.teamA.penalties : null, match.teamB.name, match.teamB.institution || null, match.teamB.logo || null, match.teamB.score !== undefined ? match.teamB.score : null, match.teamB.penalties !== undefined ? match.teamB.penalties : null, match.date, match.time, match.pitch, match.status, match.liveMinute || null, JSON.stringify(match.events || []), match.winnerId || null, match.nextMatchId || null, match.nextMatchSlot || null,
            ]
          );
        } catch (err) {
          console.error('Error saving batch match item in MySQL:', err);
        }
      }
    }
    return matchesToSave;
  },

  // Sponsors
  async getSponsors(): Promise<SponsorItem[]> {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query('SELECT * FROM sponsors WHERE is_active = TRUE ORDER BY sort_order ASC');
        if (Array.isArray(rows)) {
          return rows.map((r: any) => ({
            id: r.id,
            name: r.name,
            tier: r.tier,
            logoText: r.logo_text,
            logoUrl: r.logo_url || undefined,
            websiteUrl: r.website_url || undefined,
            description: r.description || undefined,
          }));
        }
      } catch (err) {
        console.error('Error fetching sponsors from MySQL:', err);
      }
    }
    return memStore.sponsors;
  },

  async saveSponsor(sponsor: SponsorItem): Promise<SponsorItem> {
    await ensureDbConnected();
    const idx = memStore.sponsors.findIndex(s => s.id === sponsor.id);
    if (idx >= 0) {
      memStore.sponsors[idx] = sponsor;
    } else {
      memStore.sponsors.push(sponsor);
    }
    persistLocalStore();

    if (pool && isMySqlConnected) {
      try {
        await pool.query(
          `INSERT INTO sponsors (id, name, tier, logo_text, logo_url, website_url, description)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name=?, tier=?, logo_text=?, logo_url=?, website_url=?, description=?`,
          [
            sponsor.id, sponsor.name, sponsor.tier, sponsor.logoText, sponsor.logoUrl || null, sponsor.websiteUrl || null, sponsor.description || null,
            sponsor.name, sponsor.tier, sponsor.logoText, sponsor.logoUrl || null, sponsor.websiteUrl || null, sponsor.description || null,
          ]
        );
      } catch (err) {
        console.error('Error saving sponsor to MySQL:', err);
      }
    }
    return sponsor;
  },

  async deleteSponsor(id: string): Promise<boolean> {
    await ensureDbConnected();
    memStore.sponsors = memStore.sponsors.filter(s => s.id !== id);
    persistLocalStore();
    for (const [mId, mItem] of memStore.media.entries()) {
      if (mItem.refId === id) {
        memStore.media.delete(mId);
      }
    }

    if (pool && isMySqlConnected) {
      try {
        await pool.query('DELETE FROM sponsors WHERE id = ?', [id]);
        // Cascading delete: Automatically remove sponsor logo from TiDB app_media_storage
        await pool.query('DELETE FROM app_media_storage WHERE ref_id = ? AND category = ?', [id, 'SPONSOR_LOGO']);
        console.log(`[Storage Cleanup] Deleted sponsor logo for ${id} from TiDB Cloud`);
      } catch (err) {
        console.error('Error deleting sponsor from MySQL:', err);
      }
    }
    return true;
  },

  // Admin Users
  async getAdmins(): Promise<AdminUser[]> {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query('SELECT id, username, full_name, role, email, phone, avatar_color, created_at FROM admin_users ORDER BY created_at ASC');
        if (Array.isArray(rows) && rows.length > 0) {
          const list = rows.map((r: any) => ({
            id: r.id,
            username: r.username,
            fullName: r.full_name,
            role: r.role,
            email: r.email || '',
            phone: r.phone || '',
            avatarColor: r.avatar_color,
            createdAt: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '2026-08-01',
          }));
          memStore.adminUsers = list;
          return list;
        } else if (Array.isArray(rows) && rows.length === 0) {
          // Table exists in MySQL but has 0 rows -> Seed default admins
          for (const adm of DEFAULT_ADMIN_USERS) {
            await pool.query(
              `INSERT INTO admin_users (id, username, password_hash, full_name, role, email, phone, avatar_color)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE full_name = VALUES(full_name)`,
              [
                adm.id,
                adm.username,
                adm.password || 'admin123',
                adm.fullName,
                adm.role,
                adm.email || '',
                adm.phone || '',
                adm.avatarColor || 'bg-red-600',
              ]
            );
          }
          memStore.adminUsers = [...DEFAULT_ADMIN_USERS];
          return memStore.adminUsers;
        }
      } catch (err) {
        console.error('Error fetching admins from MySQL:', err);
      }
    }
    return memStore.adminUsers;
  },

  async saveAdmin(admin: AdminUser, password?: string): Promise<AdminUser> {
    await ensureDbConnected();

    if (pool && isMySqlConnected) {
      const passHash = password || admin.password || 'admin123';
      const roleToSave = admin.role || 'PANITIA_INTI';
      try {
        await pool.query(
          `INSERT INTO admin_users (id, username, password_hash, full_name, role, email, phone, avatar_color, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
             username = VALUES(username),
             full_name = VALUES(full_name),
             role = VALUES(role),
             email = VALUES(email),
             phone = VALUES(phone),
             avatar_color = VALUES(avatar_color),
             password_hash = COALESCE(?, password_hash)`,
          [
            admin.id,
            admin.username,
            passHash,
            admin.fullName,
            roleToSave,
            admin.email || null,
            admin.phone || null,
            admin.avatarColor || 'bg-red-600',
            admin.createdAt ? new Date(admin.createdAt) : new Date(),
            password || null,
          ]
        );

        // Keep local memory store cache in sync with MySQL
        const idx = memStore.adminUsers.findIndex(a => a.id === admin.id);
        if (idx >= 0) {
          memStore.adminUsers[idx] = { ...memStore.adminUsers[idx], ...admin, role: roleToSave };
        } else {
          memStore.adminUsers.push({ ...admin, role: roleToSave });
        }
      } catch (err: any) {
        console.error('Error saving admin user to MySQL:', err);
        const errMsg = String(err?.message || '');
        // Auto-heal: If MySQL has an older schema with ENUM or short VARCHAR causing Error 1265 (WARN_DATA_TRUNCATED)
        if (
          err?.code === 'WARN_DATA_TRUNCATED' ||
          err?.errno === 1265 ||
          errMsg.includes('role') ||
          errMsg.includes('Data truncated')
        ) {
          try {
            console.log('[MySQL Auto-Migration] Migrating column role in admin_users to VARCHAR(64)...');
            await pool.query("ALTER TABLE admin_users MODIFY COLUMN role VARCHAR(64) NOT NULL DEFAULT 'PANITIA_INTI'");
            // Retry the query
            await pool.query(
              `INSERT INTO admin_users (id, username, password_hash, full_name, role, email, phone, avatar_color, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE 
                 username = VALUES(username),
                 full_name = VALUES(full_name),
                 role = VALUES(role),
                 email = VALUES(email),
                 phone = VALUES(phone),
                 avatar_color = VALUES(avatar_color),
                 password_hash = COALESCE(?, password_hash)`,
              [
                admin.id,
                admin.username,
                passHash,
                admin.fullName,
                roleToSave,
                admin.email || null,
                admin.phone || null,
                admin.avatarColor || 'bg-red-600',
                admin.createdAt ? new Date(admin.createdAt) : new Date(),
                password || null,
              ]
            );
            console.log('[MySQL Auto-Migration] Successfully saved admin user after column role auto-migration!');
            const idx = memStore.adminUsers.findIndex(a => a.id === admin.id);
            if (idx >= 0) {
              memStore.adminUsers[idx] = { ...memStore.adminUsers[idx], ...admin, role: roleToSave };
            } else {
              memStore.adminUsers.push({ ...admin, role: roleToSave });
            }
            return { ...admin, role: roleToSave };
          } catch (retryErr: any) {
            console.error('[MySQL Auto-Migration] Retry after role migration failed:', retryErr);
          }
        }
        throw new Error(`Gagal menyimpan data admin ke database MySQL: ${err?.message || err}`);
      }
    } else {
      // Memory Store fallback when MySQL is not connected
      const idx = memStore.adminUsers.findIndex(a => a.id === admin.id || a.username.toLowerCase() === admin.username.toLowerCase());
      if (idx >= 0) {
        memStore.adminUsers[idx] = { ...memStore.adminUsers[idx], ...admin };
      } else {
        memStore.adminUsers.push(admin);
      }
    }

    return admin;
  },

  async deleteAdmin(id: string): Promise<boolean> {
    await ensureDbConnected();
    // Protect master superadmin from deletion
    const target = memStore.adminUsers.find(a => a.id === id);
    if (target && target.username.toLowerCase() === 'superadmin') {
      return false;
    }
    memStore.adminUsers = memStore.adminUsers.filter(a => a.id !== id);
    if (pool && isMySqlConnected) {
      try {
        await pool.query("DELETE FROM admin_users WHERE id = ? AND username != 'superadmin'", [id]);
      } catch (err: any) {
        console.error('Error deleting admin from MySQL:', err);
        throw new Error(`Gagal menghapus admin dari MySQL: ${err?.message || err}`);
      }
    }
    return true;
  },

  async verifyAdminLogin(username: string, pass: string): Promise<{ success: boolean; user?: AdminUser; error?: string }> {
    await ensureDbConnected();
    const cleanUser = (username || '').trim().toLowerCase();

    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query('SELECT * FROM admin_users WHERE LOWER(username) = ?', [cleanUser]);
        if (rows && rows.length > 0) {
          const row = rows[0];
          const passHash = row.password_hash;
          if (passHash === pass) {
            const userObj: AdminUser = {
              id: row.id,
              username: row.username,
              fullName: row.full_name,
              role: row.role,
              email: row.email || '',
              phone: row.phone || '',
              avatarColor: row.avatar_color || 'bg-red-600',
              createdAt: row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : '2026-08-01',
            };
            return { success: true, user: userObj };
          } else {
            return { success: false, error: 'Password tidak sesuai dengan database' };
          }
        } else {
          return { success: false, error: 'Akun username tidak ditemukan dalam tabel users' };
        }
      } catch (err) {
        console.error('Error verifying admin login with MySQL:', err);
      }
    }

    // Fallback to memStore
    const found = memStore.adminUsers.find(a => a.username.toLowerCase() === cleanUser);
    if (found) {
      if (found.password === pass) {
        const { password, ...userWithoutPass } = found;
        return { success: true, user: userWithoutPass as AdminUser };
      }
      return { success: false, error: 'Password tidak sesuai' };
    }
    return { success: false, error: 'Akun username tidak ditemukan' };
  },

  // Generate complete SQL Export dump
  async exportFullSqlDump(): Promise<string> {
    await ensureDbConnected();
    const categories = await this.getCategories();
    const registrations = await this.getRegistrations();
    const matches = await this.getMatches();
    const sponsors = await this.getSponsors();
    const admins = await this.getAdmins();
    const config = await this.getConfig();

    const timestamp = new Date().toISOString();

    let sql = `-- ==========================================================\n`;
    sql += `-- WABUP CUP 2026 COMPLETE DATABASE BACKUP & EXPORT\n`;
    sql += `-- Generated at: ${timestamp}\n`;
    sql += `-- Target: MySQL 5.7+ / 8.0+ / MariaDB / Cloud SQL / phpMyAdmin\n`;
    sql += `-- ==========================================================\n\n`;

    sql += `CREATE DATABASE IF NOT EXISTS \`wabupcup_db\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n`;
    sql += `USE \`wabupcup_db\`;\n\n`;

    sql += `-- 1. CONFIG\n`;
    sql += `INSERT INTO \`tournament_config\` (\`config_key\`, \`config_value\`) VALUES ('main_config', '${JSON.stringify(config).replace(/'/g, "\\'")}') ON DUPLICATE KEY UPDATE \`config_value\`=VALUES(\`config_value\`);\n\n`;

    sql += `-- 2. CATEGORIES\n`;
    for (const c of categories) {
      sql += `INSERT INTO \`categories\` (\`id\`, \`name\`, \`badge_title\`, \`age_restriction\`, \`max_teams\`, \`registered_teams_count\`, \`registration_fee\`, \`total_prize\`, \`description\`, \`prizes_json\`, \`rules_json\`) VALUES ('${c.id}', '${c.name.replace(/'/g, "\\'")}', '${(c.badgeTitle || '').replace(/'/g, "\\'")}', '${c.ageRestriction}', ${c.maxTeams}, ${c.registeredTeamsCount}, ${c.registrationFee}, ${c.totalPrize}, '${(c.description || '').replace(/'/g, "\\'")}', '${JSON.stringify(c.prizes).replace(/'/g, "\\'")}', '${JSON.stringify(c.rules).replace(/'/g, "\\'")}') ON DUPLICATE KEY UPDATE \`name\`=VALUES(\`name\`);\n`;
    }
    sql += `\n`;

    sql += `-- 3. REGISTRATIONS\n`;
    for (const r of registrations) {
      sql += `INSERT INTO \`registrations\` (\`id\`, \`reg_code\`, \`category_id\`, \`team_name\`, \`institution_name\`, \`coach_name\`, \`coach_phone\`, \`coach_email\`, \`player_count\`, \`official_count\`, \`registration_date\`, \`status\`, \`payment_status\`, \`payment_amount\`, \`documents_json\`, \`last_updated\`) VALUES ('${r.id}', '${r.regCode}', '${r.category}', '${r.teamName.replace(/'/g, "\\'")}', '${r.institutionName.replace(/'/g, "\\'")}', '${r.coachName.replace(/'/g, "\\'")}', '${r.coachPhone}', '${r.coachEmail}', ${r.playerCount}, ${r.officialCount}, '${r.registrationDate}', '${r.status}', '${r.paymentStatus}', ${r.paymentAmount}, '${JSON.stringify(r.documents || {}).replace(/'/g, "\\'")}', '${r.lastUpdated}') ON DUPLICATE KEY UPDATE \`team_name\`=VALUES(\`team_name\`);\n`;
    }
    sql += `\n`;

    sql += `-- 4. MATCHES\n`;
    for (const m of matches) {
      sql += `INSERT INTO \`matches\` (\`id\`, \`match_number\`, \`category_id\`, \`round_name\`, \`round_index\`, \`team_a_name\`, \`team_a_institution\`, \`team_a_score\`, \`team_b_name\`, \`team_b_institution\`, \`team_b_score\`, \`match_date\`, \`match_time\`, \`pitch\`, \`status\`, \`live_minute\`, \`events_json\`, \`winner_id\`) VALUES ('${m.id}', ${m.matchNumber}, '${m.category}', '${m.round.replace(/'/g, "\\'")}', ${m.roundIndex}, '${m.teamA.name.replace(/'/g, "\\'")}', '${(m.teamA.institution || '').replace(/'/g, "\\'")}', ${m.teamA.score !== undefined ? m.teamA.score : 'NULL'}, '${m.teamB.name.replace(/'/g, "\\'")}', '${(m.teamB.institution || '').replace(/'/g, "\\'")}', ${m.teamB.score !== undefined ? m.teamB.score : 'NULL'}, '${m.date}', '${m.time}', '${m.pitch.replace(/'/g, "\\'")}', '${m.status}', ${m.liveMinute ? `'${m.liveMinute}'` : 'NULL'}, '${JSON.stringify(m.events || []).replace(/'/g, "\\'")}', ${m.winnerId ? `'${m.winnerId}'` : 'NULL'}) ON DUPLICATE KEY UPDATE \`team_a_name\`=VALUES(\`team_a_name\`);\n`;
    }
    sql += `\n`;

    sql += `-- 5. SPONSORS\n`;
    for (const s of sponsors) {
      sql += `INSERT INTO \`sponsors\` (\`id\`, \`name\`, \`tier\`, \`logo_text\`, \`website_url\`, \`description\`) VALUES ('${s.id}', '${s.name.replace(/'/g, "\\'")}', '${s.tier}', '${s.logoText}', '${s.websiteUrl || ''}', '${(s.description || '').replace(/'/g, "\\'")}') ON DUPLICATE KEY UPDATE \`name\`=VALUES(\`name\`);\n`;
    }
    sql += `\n`;

    sql += `-- 6. ADMIN USERS\n`;
    for (const a of admins) {
      sql += `INSERT INTO \`admin_users\` (\`id\`, \`username\`, \`password_hash\`, \`full_name\`, \`role\`, \`email\`, \`phone\`, \`avatar_color\`) VALUES ('${a.id}', '${a.username}', 'admin123', '${a.fullName.replace(/'/g, "\\'")}', '${a.role}', '${a.email}', '${a.phone}', '${a.avatarColor}') ON DUPLICATE KEY UPDATE \`full_name\`=VALUES(\`full_name\`);\n`;
    }

    return sql;
  },

  // Centralized Media Storage (TiDB Cloud)
  async saveMedia(item: AppMediaItem): Promise<AppMediaItem> {
    await ensureDbConnected();
    memStore.media.set(item.id, item);

    if (pool && isMySqlConnected) {
      try {
        await pool.execute(
          `INSERT INTO app_media_storage (id, category, ref_id, sub_key, filename, content_type, file_size, file_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE category=?, ref_id=?, sub_key=?, filename=?, content_type=?, file_size=?, file_data=?`,
          [
            item.id, item.category, item.refId || null, item.subKey || null, item.filename, item.contentType, item.fileSize, item.fileData,
            item.category, item.refId || null, item.subKey || null, item.filename, item.contentType, item.fileSize, item.fileData,
          ]
        );
      } catch (err) {
        console.error('Error saving media to TiDB app_media_storage:', err);
      }
    }
    return item;
  },

  async getMedia(id: string): Promise<AppMediaItem | null> {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.execute('SELECT * FROM app_media_storage WHERE id = ? LIMIT 1', [id]);
        if (Array.isArray(rows) && rows.length > 0) {
          const r = rows[0];
          return {
            id: r.id,
            category: r.category,
            refId: r.ref_id || undefined,
            subKey: r.sub_key || undefined,
            filename: r.filename,
            contentType: r.content_type,
            fileSize: Number(r.file_size),
            fileData: r.file_data,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
          };
        }
      } catch (err) {
        console.error('Error fetching media from TiDB app_media_storage:', err);
      }
    }
    return memStore.media.get(id) || null;
  },

  async deleteMedia(id: string): Promise<boolean> {
    await ensureDbConnected();
    memStore.media.delete(id);
    if (pool && isMySqlConnected) {
      try {
        await pool.execute('DELETE FROM app_media_storage WHERE id = ?', [id]);
      } catch (err) {
        console.error('Error deleting media from TiDB app_media_storage:', err);
      }
    }
    return true;
  },

  async deleteMediaByRef(refId: string, category?: string): Promise<boolean> {
    await ensureDbConnected();
    for (const [mId, mItem] of memStore.media.entries()) {
      if (mItem.refId === refId && (!category || mItem.category === category)) {
        memStore.media.delete(mId);
      }
    }

    if (pool && isMySqlConnected) {
      try {
        if (category) {
          await pool.execute('DELETE FROM app_media_storage WHERE ref_id = ? AND category = ?', [refId, category]);
        } else {
          await pool.execute('DELETE FROM app_media_storage WHERE ref_id = ?', [refId]);
        }
      } catch (err) {
        console.error('Error deleting media by ref from TiDB app_media_storage:', err);
      }
    }
    return true;
  },

  async deleteMediaByRefAndKey(refId: string, subKey: string): Promise<boolean> {
    await ensureDbConnected();
    for (const [mId, mItem] of memStore.media.entries()) {
      if (mItem.refId === refId && mItem.subKey === subKey) {
        memStore.media.delete(mId);
      }
    }

    if (pool && isMySqlConnected) {
      try {
        await pool.execute('DELETE FROM app_media_storage WHERE ref_id = ? AND sub_key = ?', [refId, subKey]);
      } catch (err) {
        console.error('Error deleting media by ref and key from TiDB app_media_storage:', err);
      }
    }
    return true;
  },

  async updateMediaRef(id: string, refId: string, subKey?: string): Promise<boolean> {
    await ensureDbConnected();
    const memItem = memStore.media.get(id);
    if (memItem) {
      memItem.refId = refId;
      if (subKey) memItem.subKey = subKey;
    }

    if (subKey) {
      // Purge any prior in-memory media with the same refId and subKey
      for (const [mId, m] of memStore.media.entries()) {
        if (m.refId === refId && m.subKey === subKey && mId !== id) {
          memStore.media.delete(mId);
        }
      }
    }

    if (pool && isMySqlConnected) {
      try {
        if (subKey) {
          // Cascading cleanup: delete prior media file for the same ref_id and sub_key if id is different
          await pool.execute(
            'DELETE FROM app_media_storage WHERE ref_id = ? AND sub_key = ? AND id != ?',
            [refId, subKey, id]
          );
          await pool.execute('UPDATE app_media_storage SET ref_id = ?, sub_key = ? WHERE id = ?', [refId, subKey, id]);
        } else {
          await pool.execute('UPDATE app_media_storage SET ref_id = ? WHERE id = ?', [refId, id]);
        }
      } catch (err) {
        console.error('Error updating media ref in TiDB app_media_storage:', err);
      }
    }
    return true;
  },
};
