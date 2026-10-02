import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  AdminUser,
  CategoryDetail,
  CommitteeBankAccount,
  CommitteeContact,
  CommitteeEmail,
  DownloadableDoc,
  MatchItem,
  RegistrationItem,
  RegistrationStatus,
  PaymentStatus,
  SponsorItem,
  TournamentCategory,
  TournamentConfig,
} from '../types';
import {
  DEFAULT_ADMIN_USERS,
  DEFAULT_CATEGORIES,
  DEFAULT_TOURNAMENT_CONFIG,
  DEFAULT_SECTIONS_VISIBILITY,
} from '../data/defaultConfig';
import { ApiService } from '../services/api';
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
  sanitizeRegistrationsForLocalStorage,
  idbGetRegistrations,
  idbSaveRegistrations,
  idbSaveRegistration,
  idbDeleteRegistration,
} from '../utils/storage';
import { generateUniqueRegCode } from '../utils/registrationCode';
import { deleteMediaFromStorage } from '../utils/blobUpload';

// Helpers untuk membersihkan data mock lama dari cache browser
const filterOutMockRegistrations = (list: RegistrationItem[]): RegistrationItem[] => {
  if (!Array.isArray(list)) return [];
  return list.filter(r => !r.id || !/^reg-00\d$/.test(r.id));
};

const filterOutMockMatches = (list: MatchItem[]): MatchItem[] => {
  if (!Array.isArray(list)) return [];
  return list.filter(m => !m.id || (!m.id.startsWith('match-live-') && !m.id.startsWith('match-up-') && !m.id.startsWith('match-fin-')));
};

const filterOutMockSponsors = (list: SponsorItem[]): SponsorItem[] => {
  if (!Array.isArray(list)) return [];
  return list.filter(s => s && s.name && s.name !== '-' && s.id !== '-' && !/^sp-0\d$/.test(s.id));
};

interface TournamentContextType {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  config: TournamentConfig;
  updateConfig: (newConfig: Partial<TournamentConfig>) => void;
  refreshDataFromServer: () => Promise<void>;
  isSyncingWithServer: boolean;
  isInitialLoading: boolean;
  isLoadingCategories: boolean;
  downloadableDocs: DownloadableDoc[];
  addDownloadableDoc: (doc: Omit<DownloadableDoc, 'id' | 'updatedAt'>) => void;
  updateDownloadableDoc: (doc: DownloadableDoc) => void;
  deleteDownloadableDoc: (id: string) => void;
  committeeContacts: CommitteeContact[];
  addCommitteeContact: (contact: Omit<CommitteeContact, 'id'>) => void;
  updateCommitteeContact: (contact: CommitteeContact) => void;
  deleteCommitteeContact: (id: string) => void;
  setPrimaryCommitteeContact: (id: string) => void;
  committeeEmails: CommitteeEmail[];
  addCommitteeEmail: (email: Omit<CommitteeEmail, 'id'>) => void;
  updateCommitteeEmail: (email: CommitteeEmail) => void;
  deleteCommitteeEmail: (id: string) => void;
  bankAccounts: CommitteeBankAccount[];
  addBankAccount: (bank: Omit<CommitteeBankAccount, 'id'>) => void;
  updateBankAccount: (bank: CommitteeBankAccount) => void;
  deleteBankAccount: (id: string) => void;
  setPrimaryBankAccount: (id: string) => void;
  categories: CategoryDetail[];
  addCategory: (category: CategoryDetail) => void;
  updateCategory: (category: CategoryDetail) => void;
  deleteCategory: (categoryId: string) => void;
  reorderCategories: (newCategories: CategoryDetail[]) => Promise<void>;
  syncCategoryQuotas: () => Promise<void>;
  registrations: RegistrationItem[];
  submitNewRegistration: (data: Omit<RegistrationItem, 'id' | 'regCode' | 'registrationDate' | 'status' | 'paymentStatus' | 'lastUpdated'>) => Promise<RegistrationItem>;
  updateRegistration: (item: RegistrationItem) => void;
  updateRegistrationStatus: (id: string, status: RegistrationStatus, reason?: string, notes?: string) => void;
  updatePaymentStatus: (id: string, paymentStatus: PaymentStatus) => void;
  deleteRegistration: (id: string) => void;
  matches: MatchItem[];
  addMatch: (match: Omit<MatchItem, 'id'>) => void;
  updateMatch: (match: MatchItem) => void;
  deleteMatch: (matchId: string) => void;
  randomizeMatchesForCategory: (
    category: TournamentCategory,
    stageOption?: 'AUTO' | 'PENYISIHAN' | '16_BESAR' | '8_BESAR' | 'SEMIFINAL'
  ) => { success: boolean; message: string; matches?: MatchItem[] };
  checkCanDrawNextRound: (category: TournamentCategory) => {
    canDraw: boolean;
    pendingMatchesCount: number;
    currentRoundName?: string;
    completedMatchesCount: number;
    totalMatchesCount: number;
  };
  sponsors: SponsorItem[];
  addSponsor: (sponsor: Omit<SponsorItem, 'id'>) => void;
  updateSponsor: (sponsor: SponsorItem) => void;
  deleteSponsor: (id: string) => void;
  adminUsers: AdminUser[];
  currentAdmin: AdminUser | null;
  loginAdmin: (username: string, pass: string) => Promise<{ success: boolean; message?: string; admin?: AdminUser }>;
  logoutAdmin: () => void;
  addAdminUser: (user: Omit<AdminUser, 'id' | 'createdAt'> & { password?: string }) => Promise<{ success: boolean; savedToDatabase?: boolean; error?: string }>;
  updateAdminUser: (user: AdminUser & { password?: string }) => Promise<{ success: boolean; savedToDatabase?: boolean; error?: string }>;
  deleteAdminUser: (id: string) => Promise<{ success: boolean; savedToDatabase?: boolean; error?: string }>;
  resetAllDataToDefaults: () => void;
  getWhatsAppNotificationUrl: (item: RegistrationItem, type: 'CONFIRMATION' | 'APPROVED' | 'REJECTED' | 'PAYMENT_REMINDER' | 'INVOICE') => string;
  dbStatus: {
    connected: boolean;
    host: string;
    database: string;
    error: string | null;
    mode: 'MYSQL_REAL' | 'MEMORY_FALLBACK';
  };
  checkDbStatus: () => Promise<any>;
}

const TournamentContext = createContext<TournamentContextType | undefined>(undefined);

export const TournamentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('wabupcup_theme') : null;
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    safeLocalStorageSet('wabupcup_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Tournament Config
  const [config, setConfig] = useState<TournamentConfig>(() => {
    const parsed = safeLocalStorageGet<Partial<TournamentConfig> | null>('wabupcup_config', null);
    if (parsed) {
      return {
        ...DEFAULT_TOURNAMENT_CONFIG,
        ...parsed,
        sectionsVisibility: {
          ...DEFAULT_SECTIONS_VISIBILITY,
          ...(parsed.sectionsVisibility || {}),
        },
        sectionsBackgrounds: {
          ...(DEFAULT_TOURNAMENT_CONFIG.sectionsBackgrounds || {}),
          ...(parsed.sectionsBackgrounds || {}),
        },
        bankAccount: undefined,
        downloadableDocs: Array.isArray(parsed.downloadableDocs) ? parsed.downloadableDocs : [],
        committeeContacts: Array.isArray(parsed.committeeContacts) ? parsed.committeeContacts : [],
        committeeEmails: Array.isArray(parsed.committeeEmails) ? parsed.committeeEmails : [],
        bankAccounts: Array.isArray(parsed.bankAccounts) ? parsed.bankAccounts : [],
      };
    }
    return {
      ...DEFAULT_TOURNAMENT_CONFIG,
      sectionsVisibility: DEFAULT_SECTIONS_VISIBILITY,
    };
  });

  // Database Status
  const [dbStatus, setDbStatus] = useState<{
    connected: boolean;
    host: string;
    database: string;
    error: string | null;
    mode: 'MYSQL_REAL' | 'MEMORY_FALLBACK';
  }>({
    connected: false,
    host: 'Memeriksa...',
    database: 'wabupcup_db',
    error: null,
    mode: 'MEMORY_FALLBACK',
  });

  const checkDbStatus = useCallback(async () => {
    try {
      const health = await ApiService.checkHealth();
      if (health && health.database) {
        setDbStatus(health.database);
        return health.database;
      }
    } catch (err: any) {
      console.warn('Could not check database health:', err);
    }
    return dbStatus;
  }, [dbStatus]);

  // Sync with Backend
  const [isSyncingWithServer, setIsSyncingWithServer] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Categories & Prizes
  const [categories, setCategories] = useState<CategoryDetail[]>(() => {
    return safeLocalStorageGet<CategoryDetail[]>('wabupcup_categories', DEFAULT_CATEGORIES);
  });

  // Registrations state
  const [registrations, setRegistrations] = useState<RegistrationItem[]>(() => {
    const cached = safeLocalStorageGet<RegistrationItem[]>('wabupcup_registrations', []);
    return filterOutMockRegistrations(cached);
  });

  // Matches state
  const [matches, setMatches] = useState<MatchItem[]>(() => {
    const cached = safeLocalStorageGet<MatchItem[]>('wabupcup_matches', []);
    return filterOutMockMatches(cached);
  });

  // Sponsors
  const [sponsors, setSponsors] = useState<SponsorItem[]>(() => {
    const cached = safeLocalStorageGet<SponsorItem[]>('wabupcup_sponsors', []);
    return filterOutMockSponsors(cached);
  });

  // Admin Users & Auth
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>(() => {
    return safeLocalStorageGet<AdminUser[]>('wabupcup_admins', DEFAULT_ADMIN_USERS);
  });

  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(() => {
    return safeLocalStorageGet<AdminUser | null>('wabupcup_current_admin', null);
  });

  // Sinkronisasi data server yang dioptimalkan untuk memangkas Fast Origin Transfer
  const refreshDataFromServer = useCallback(async () => {
    try {
      setIsSyncingWithServer(true);
      const activeAdmin = safeLocalStorageGet<AdminUser | null>('wabupcup_current_admin', null);

      // 1. Data publik yang ringan dan aman di-cache di Edge CDN
      const [serverConfig, serverCategories, serverMatches, serverSponsors, health] =
        await Promise.all([
          ApiService.getConfig().catch(() => null),
          ApiService.getCategories().catch(() => null),
          ApiService.getMatches().catch(() => null),
          ApiService.getSponsors().catch(() => null),
          ApiService.checkHealth().catch(() => null),
        ]);

      if (health && health.database) {
        setDbStatus(health.database);
      }

      if (serverConfig) {
        setConfig(prev => {
          const merged: TournamentConfig = {
            ...prev,
            ...serverConfig,
            sectionsVisibility: {
              ...DEFAULT_SECTIONS_VISIBILITY,
              ...(serverConfig.sectionsVisibility || prev.sectionsVisibility || {}),
            },
            sectionsBackgrounds: {
              ...(prev.sectionsBackgrounds || {}),
              ...(serverConfig.sectionsBackgrounds || {}),
            },
            downloadableDocs: Array.isArray(serverConfig.downloadableDocs) ? serverConfig.downloadableDocs : (prev.downloadableDocs || []),
            committeeContacts: Array.isArray(serverConfig.committeeContacts) ? serverConfig.committeeContacts : (prev.committeeContacts || []),
            committeeEmails: Array.isArray(serverConfig.committeeEmails) ? serverConfig.committeeEmails : (prev.committeeEmails || []),
            bankAccounts: Array.isArray(serverConfig.bankAccounts) ? serverConfig.bankAccounts : (prev.bankAccounts || []),
          };
          safeLocalStorageSet('wabupcup_config', JSON.stringify(merged));
          return merged;
        });
      }

      if (serverCategories && Array.isArray(serverCategories)) {
        setCategories(serverCategories);
        safeLocalStorageSet('wabupcup_categories', JSON.stringify(serverCategories));
      }

      if (serverMatches && Array.isArray(serverMatches)) {
        setMatches(serverMatches);
        safeLocalStorageSet('wabupcup_matches', JSON.stringify(serverMatches));
      }

      if (serverSponsors && Array.isArray(serverSponsors)) {
        setSponsors(serverSponsors);
        safeLocalStorageSet('wabupcup_sponsors', JSON.stringify(serverSponsors));
      }

      // 2. Data berat dan sensitif HANYA dipanggil jika admin yang terautentikasi sedang login
      if (activeAdmin) {
        const [serverRegistrations, serverAdmins] = await Promise.all([
          ApiService.getRegistrations().catch(() => null),
          ApiService.getAdmins().catch(() => null),
        ]);

        if (serverRegistrations && Array.isArray(serverRegistrations)) {
          setRegistrations(serverRegistrations);
          idbSaveRegistrations(serverRegistrations).catch(() => {});
          safeLocalStorageSet('wabupcup_registrations', JSON.stringify(sanitizeRegistrationsForLocalStorage(serverRegistrations)));
        }

        if (serverAdmins && Array.isArray(serverAdmins) && serverAdmins.length > 0) {
          // Bersihkan password jika ada sebelum disimpan di state client
          const sanitizedAdmins = serverAdmins.map((a: any) => {
            const { password, ...rest } = a;
            return rest;
          });
          setAdminUsers(sanitizedAdmins);
          safeLocalStorageSet('wabupcup_admins', JSON.stringify(sanitizedAdmins));
        }
      }
    } catch (err) {
      console.warn('[Sync] Gagal menyinkronkan data dengan backend:', err);
    } finally {
      setIsSyncingWithServer(false);
      setIsInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDataFromServer();
  }, [refreshDataFromServer]);

  // Load dokumen besar dari IndexedDB
  useEffect(() => {
    let isMounted = true;
    idbGetRegistrations()
      .then(idbRegs => {
        const realIdbRegs = filterOutMockRegistrations(idbRegs || []);
        if (isMounted && realIdbRegs.length > 0) {
          setRegistrations(prev => {
            const map = new Map<string, RegistrationItem>();
            for (const item of realIdbRegs) {
              map.set(item.id, item);
            }
            for (const item of prev) {
              const existing = map.get(item.id);
              if (existing && existing.documents && Object.keys(existing.documents).length > 0) {
                map.set(item.id, {
                  ...item,
                  documents: existing.documents,
                  teamLogo: item.teamLogo || existing.teamLogo,
                });
              } else {
                map.set(item.id, item);
              }
            }
            return Array.from(map.values());
          });
        }
      })
      .catch(err => {
        console.warn('[IDB] Initial load warning:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Simpan data registrasi ke IndexedDB dan localStorage
  useEffect(() => {
    idbSaveRegistrations(registrations).catch(() => {});
    const sanitized = sanitizeRegistrationsForLocalStorage(registrations);
    safeLocalStorageSet('wabupcup_registrations', JSON.stringify(sanitized));
  }, [registrations]);

  // Evaluasi jadwal langsung (LIVE) tanpa memicu memory leak
  useEffect(() => {
    const evaluateLiveMatches = () => {
      const now = new Date();

      setMatches(prevMatches => {
        let changed = false;
        const updated = prevMatches.map(m => {
          if (m.status === 'FINISHED' || !m.date || !m.time) return m;

          try {
            const dateParts = m.date.split('-').map(Number);
            const timeParts = m.time.split(':').map(Number);
            if (dateParts.length < 3 || timeParts.length < 2) return m;

            const [year, month, day] = dateParts;
            const [hours, minutes] = timeParts;

            if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
              return m;
            }

            const matchStartTime = new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
            const nowTime = now.getTime();
            const diffMs = nowTime - matchStartTime;
            const diffMinutes = Math.floor(diffMs / (60 * 1000));

            if (diffMinutes >= 0 && diffMinutes <= 120) {
              let minuteStr = '';
              if (diffMinutes < 45) {
                minuteStr = `${Math.max(1, diffMinutes + 1)}'`;
              } else if (diffMinutes >= 45 && diffMinutes < 60) {
                minuteStr = `HT (45+')`;
              } else if (diffMinutes >= 60 && diffMinutes < 105) {
                minuteStr = `${diffMinutes - 15}'`;
              } else {
                minuteStr = `90+'`;
              }

              if (m.status !== 'LIVE' || m.liveMinute !== minuteStr) {
                changed = true;
                return {
                  ...m,
                  status: 'LIVE' as const,
                  liveMinute: minuteStr,
                };
              }
            } else if (diffMinutes < 0) {
              if (m.status === 'LIVE') {
                changed = true;
                return {
                  ...m,
                  status: 'UPCOMING' as const,
                  liveMinute: undefined,
                };
              }
            }
          } catch {
            // Abaikan kesalahan hitung waktu
          }

          return m;
        });

        return changed ? updated : prevMatches;
      });
    };

    evaluateLiveMatches();
    const timer = setInterval(evaluateLiveMatches, 15000); // 15 detik sudah sangat ideal dan hemat CPU
    return () => clearInterval(timer);
  }, []);

  const updateConfig = (newConfig: Partial<TournamentConfig>) => {
    setConfig(prev => {
      const updated = { ...prev, ...newConfig };
      safeLocalStorageSet('wabupcup_config', JSON.stringify(updated));
      ApiService.updateConfig(newConfig).catch(err =>
        console.warn('Could not sync config update to backend API:', err)
      );
      return updated;
    });
  };

  // Downloadable Docs
  const downloadableDocs = config.downloadableDocs || [];

  const addDownloadableDoc = (doc: Omit<DownloadableDoc, 'id' | 'updatedAt'>) => {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const newDoc: DownloadableDoc = {
      ...doc,
      id: `doc-${Date.now()}`,
      updatedAt: formattedDate,
    };
    updateConfig({ downloadableDocs: [newDoc, ...downloadableDocs] });
  };

  const updateDownloadableDoc = (updated: DownloadableDoc) => {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const nextDocs = downloadableDocs.map(d =>
      d.id === updated.id ? { ...updated, updatedAt: formattedDate } : d
    );
    updateConfig({ downloadableDocs: nextDocs });
  };

  const deleteDownloadableDoc = (id: string) => {
    updateConfig({ downloadableDocs: downloadableDocs.filter(d => d.id !== id) });
  };

  // Contacts
  const committeeContacts = config.committeeContacts || [];

  const addCommitteeContact = (contact: Omit<CommitteeContact, 'id'>) => {
    const newContact: CommitteeContact = {
      ...contact,
      id: `wa-${Date.now()}`,
    };
    let nextContacts = [...committeeContacts, newContact];
    if (newContact.isPrimary || committeeContacts.length === 0) {
      nextContacts = nextContacts.map(c => ({
        ...c,
        isPrimary: c.id === newContact.id,
      }));
      updateConfig({
        committeeContacts: nextContacts,
        adminContactPhone: newContact.phone.replace(/\D/g, ''),
      });
    } else {
      updateConfig({ committeeContacts: nextContacts });
    }
  };

  const updateCommitteeContact = (updated: CommitteeContact) => {
    let nextContacts = committeeContacts.map(c =>
      c.id === updated.id ? updated : updated.isPrimary ? { ...c, isPrimary: false } : c
    );
    const primary = nextContacts.find(c => c.isPrimary) || nextContacts[0];
    updateConfig({
      committeeContacts: nextContacts,
      adminContactPhone: primary ? primary.phone.replace(/\D/g, '') : config.adminContactPhone,
    });
  };

  const deleteCommitteeContact = (id: string) => {
    const nextContacts = committeeContacts.filter(c => c.id !== id);
    if (nextContacts.length > 0 && !nextContacts.some(c => c.isPrimary)) {
      nextContacts[0].isPrimary = true;
    }
    const primary = nextContacts.find(c => c.isPrimary);
    updateConfig({
      committeeContacts: nextContacts,
      adminContactPhone: primary ? primary.phone.replace(/\D/g, '') : config.adminContactPhone,
    });
  };

  const setPrimaryCommitteeContact = (id: string) => {
    const nextContacts = committeeContacts.map(c => ({
      ...c,
      isPrimary: c.id === id,
    }));
    const primary = nextContacts.find(c => c.id === id);
    updateConfig({
      committeeContacts: nextContacts,
      adminContactPhone: primary ? primary.phone.replace(/\D/g, '') : config.adminContactPhone,
    });
  };

  // Emails
  const committeeEmails = config.committeeEmails || [];

  const addCommitteeEmail = (emailItem: Omit<CommitteeEmail, 'id'>) => {
    const newEmail: CommitteeEmail = {
      ...emailItem,
      id: `em-${Date.now()}`,
    };
    let nextEmails = [...committeeEmails, newEmail];
    if (newEmail.isPrimary || committeeEmails.length === 0) {
      nextEmails = nextEmails.map(e => ({
        ...e,
        isPrimary: e.id === newEmail.id,
      }));
      updateConfig({
        committeeEmails: nextEmails,
        adminContactEmail: newEmail.email,
      });
    } else {
      updateConfig({ committeeEmails: nextEmails });
    }
  };

  const updateCommitteeEmail = (updated: CommitteeEmail) => {
    let nextEmails = committeeEmails.map(e =>
      e.id === updated.id ? updated : updated.isPrimary ? { ...e, isPrimary: false } : e
    );
    const primary = nextEmails.find(e => e.isPrimary) || nextEmails[0];
    updateConfig({
      committeeEmails: nextEmails,
      adminContactEmail: primary ? primary.email : config.adminContactEmail,
    });
  };

  const deleteCommitteeEmail = (id: string) => {
    const nextEmails = committeeEmails.filter(e => e.id !== id);
    if (nextEmails.length > 0 && !nextEmails.some(e => e.isPrimary)) {
      nextEmails[0].isPrimary = true;
    }
    const primary = nextEmails.find(e => e.isPrimary);
    updateConfig({
      committeeEmails: nextEmails,
      adminContactEmail: primary ? primary.email : config.adminContactEmail,
    });
  };

  // Bank Accounts
  const bankAccounts = config.bankAccounts || [];

  const addBankAccount = (bank: Omit<CommitteeBankAccount, 'id'>) => {
    const newBank: CommitteeBankAccount = {
      ...bank,
      id: `bank-${Date.now()}`,
    };
    let nextBanks = [...bankAccounts, newBank];
    if (newBank.isPrimary || bankAccounts.length === 0) {
      nextBanks = nextBanks.map(b => ({
        ...b,
        isPrimary: b.id === newBank.id,
      }));
      updateConfig({
        bankAccounts: nextBanks,
        bankAccount: {
          bankName: newBank.bankName,
          accountNumber: newBank.accountNumber,
          accountHolder: newBank.accountHolder,
        },
      });
    } else {
      updateConfig({ bankAccounts: nextBanks });
    }
  };

  const updateBankAccount = (updated: CommitteeBankAccount) => {
    let nextBanks = bankAccounts.map(b =>
      b.id === updated.id ? updated : updated.isPrimary ? { ...b, isPrimary: false } : b
    );
    const primary = nextBanks.find(b => b.isPrimary) || nextBanks[0];
    updateConfig({
      bankAccounts: nextBanks,
      bankAccount: primary
        ? {
            bankName: primary.bankName,
            accountNumber: primary.accountNumber,
            accountHolder: primary.accountHolder,
          }
        : config.bankAccount,
    });
  };

  const deleteBankAccount = (id: string) => {
    const nextBanks = bankAccounts.filter(b => b.id !== id);
    if (nextBanks.length > 0 && !nextBanks.some(b => b.isPrimary)) {
      nextBanks[0].isPrimary = true;
    }
    const primary = nextBanks.find(b => b.isPrimary);
    updateConfig({
      bankAccounts: nextBanks,
      bankAccount: primary
        ? {
            bankName: primary.bankName,
            accountNumber: primary.accountNumber,
            accountHolder: primary.accountHolder,
          }
        : config.bankAccount,
    });
  };

  const setPrimaryBankAccount = (id: string) => {
    const nextBanks = bankAccounts.map(b => ({
      ...b,
      isPrimary: b.id === id,
    }));
    const primary = nextBanks.find(b => b.id === id);
    updateConfig({
      bankAccounts: nextBanks,
      bankAccount: primary
        ? {
            bankName: primary.bankName,
            accountNumber: primary.accountNumber,
            accountHolder: primary.accountHolder,
          }
        : config.bankAccount,
    });
  };

  // Categories
  const addCategory = (newCat: CategoryDetail) => {
    setCategories(prev => {
      const next = [...prev, newCat];
      safeLocalStorageSet('wabupcup_categories', JSON.stringify(next));
      ApiService.saveCategory(newCat).catch(err =>
        console.warn('Could not save category to backend:', err)
      );
      return next;
    });
  };

  const updateCategory = (updated: CategoryDetail) => {
    setCategories(prev => {
      const next = prev.map(c => (c.id === updated.id ? updated : c));
      safeLocalStorageSet('wabupcup_categories', JSON.stringify(next));
      ApiService.saveCategory(updated).catch(err =>
        console.warn('Could not update category on backend:', err)
      );
      return next;
    });
  };

  const deleteCategory = (categoryId: string) => {
    setCategories(prev => {
      const next = prev.filter(c => c.id !== categoryId);
      safeLocalStorageSet('wabupcup_categories', JSON.stringify(next));
      ApiService.deleteCategory(categoryId).catch(err =>
        console.warn('Could not delete category on backend:', err)
      );
      return next;
    });
  };

  const reorderCategories = async (newCategories: CategoryDetail[]) => {
    setCategories(newCategories);
    safeLocalStorageSet('wabupcup_categories', JSON.stringify(newCategories));
    try {
      await ApiService.reorderCategories(newCategories);
    } catch (err) {
      console.warn('Could not sync reordered categories to backend:', err);
    }
  };

  const syncCategoryQuotas = useCallback(async () => {
    try {
      const updatedCategories = await ApiService.syncCategoryQuotas();
      if (updatedCategories && Array.isArray(updatedCategories)) {
        setCategories(updatedCategories);
        safeLocalStorageSet('wabupcup_categories', JSON.stringify(updatedCategories));
      }
    } catch (err) {
      console.warn('Could not sync category quotas with backend:', err);
    }
  }, []);

  // Payload sanitizer untuk pengiriman data registrasi agar tidak melebihi 4MB
  const prepareRegistrationForApi = (item: RegistrationItem): RegistrationItem => {
    if (!item.documents) return item;

    const sanitizedDocs: any = {};
    for (const [key, doc] of Object.entries(item.documents)) {
      if (!doc) continue;
      const d = doc as any;
      const fileContent = d.fileData || d.previewUrl;
      const fileUrl = d.url || (typeof fileContent === 'string' && fileContent.includes('/api/media/view/') ? fileContent : undefined);
      sanitizedDocs[key] = {
        name: d.name,
        size: d.size,
        uploadDate: d.uploadDate,
        type: d.type,
        url: fileUrl,
        fileData: fileContent,
      };
    }

    let candidate: RegistrationItem = {
      ...item,
      documents: sanitizedDocs,
    };

    try {
      const jsonStr = JSON.stringify(candidate);
      if (jsonStr.length > 3 * 1024 * 1024) {
        const reducedDocs: any = {};
        for (const [key, doc] of Object.entries(candidate.documents || {})) {
          if (!doc) continue;
          const d = doc as any;
          if (key === 'buktiPembayaran' || key === 'logoTim') {
            reducedDocs[key] = d;
          } else {
            reducedDocs[key] = {
              name: d.name,
              size: d.size,
              uploadDate: d.uploadDate,
              type: d.type,
              url: d.url || (typeof d.fileData === 'string' && d.fileData.includes('/api/media/view/') ? d.fileData : undefined),
            };
          }
        }
        candidate = { ...candidate, documents: reducedDocs };
      }
    } catch {
      // Abaikan fallback
    }

    return candidate;
  };

  const submitNewRegistration = async (
    data: Omit<RegistrationItem, 'id' | 'regCode' | 'registrationDate' | 'status' | 'paymentStatus' | 'lastUpdated'> & { id?: string }
  ): Promise<RegistrationItem> => {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const regCode = generateUniqueRegCode(data.category, registrations);
    const generatedId = (data as any).id || `reg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    let currentReg: RegistrationItem = {
      ...data,
      id: generatedId,
      regCode,
      registrationDate: formattedDate,
      status: 'PENDING_PAYMENT',
      paymentStatus: 'UNPAID',
      lastUpdated: formattedDate,
    };

    setRegistrations(prev => [currentReg, ...prev.filter(r => r.id !== currentReg.id)]);
    idbSaveRegistration(currentReg).catch(() => {});

    try {
      const apiPayload = prepareRegistrationForApi(currentReg);
      const serverSaved = await ApiService.createRegistration(apiPayload);
      if (serverSaved && serverSaved.id) {
        currentReg = {
          ...currentReg,
          ...serverSaved,
          documents: currentReg.documents || serverSaved.documents,
        };
        setRegistrations(prev => [currentReg, ...prev.filter(r => r.id !== currentReg.id && r.id !== generatedId)]);
        idbSaveRegistration(currentReg).catch(() => {});
      }
    } catch (err) {
      console.warn('Could not persist new registration to backend, using local copy:', err);
    }

    setCategories(prev => {
      const next = prev.map(c =>
        c.id === data.category
          ? { ...c, registeredTeamsCount: c.registeredTeamsCount + 1 }
          : c
      );
      const updatedCat = next.find(c => c.id === data.category);
      if (updatedCat) {
        ApiService.saveCategory(updatedCat).catch(() => {});
      }
      return next;
    });

    return currentReg;
  };

  const updateRegistration = (updatedItem: RegistrationItem) => {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const fullUpdated = { ...updatedItem, lastUpdated: formattedDate };

    const oldItem = registrations.find(r => r.id === updatedItem.id || r.regCode === updatedItem.id);
    if (oldItem) {
      const newMediaUrls = new Set<string>();
      const oldMediaUrls: string[] = [];

      const extractUrls = (target: any, setOrList: Set<string> | string[], isOld = false) => {
        if (!target) return;
        const addUrl = (u: string) => {
          if (typeof u === 'string' && u.includes('/api/media/view/')) {
            if (isOld) {
              if (!newMediaUrls.has(u)) (setOrList as string[]).push(u);
            } else {
              (setOrList as Set<string>).add(u);
            }
          }
        };

        if (typeof target === 'string') {
          addUrl(target);
        } else if (typeof target === 'object') {
          if (target.url) addUrl(target.url);
          if (target.fileData) addUrl(target.fileData);
        }
      };

      extractUrls(fullUpdated.teamLogo, newMediaUrls);
      if (fullUpdated.documents) {
        Object.values(fullUpdated.documents).forEach(doc => extractUrls(doc, newMediaUrls));
      }

      extractUrls(oldItem.teamLogo, oldMediaUrls, true);
      if (oldItem.documents) {
        Object.values(oldItem.documents).forEach(doc => extractUrls(doc, oldMediaUrls, true));
      }

      for (const u of oldMediaUrls) {
        deleteMediaFromStorage(u).catch(err =>
          console.warn('[updateRegistration] Could not delete replaced media:', err)
        );
      }
    }

    setRegistrations(prev =>
      prev.map(item => (item.id === updatedItem.id ? fullUpdated : item))
    );

    idbSaveRegistration(fullUpdated).catch(() => {});

    const apiPayload = prepareRegistrationForApi(fullUpdated);
    ApiService.updateRegistration(apiPayload).catch(err =>
      console.warn('Could not sync registration update to backend:', err)
    );
  };

  const updateRegistrationStatus = (
    id: string,
    status: RegistrationStatus,
    reason?: string,
    notes?: string
  ) => {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    setRegistrations(prev =>
      prev.map(item => {
        if (item.id === id) {
          const updated: RegistrationItem = {
            ...item,
            status,
            rejectionReason: reason !== undefined ? reason : item.rejectionReason,
            adminNotes: notes !== undefined ? notes : item.adminNotes,
            lastUpdated: formattedDate,
          };
          idbSaveRegistration(updated).catch(() => {});
          return updated;
        }
        return item;
      })
    );

    ApiService.updateRegistrationStatus(id, status, reason, notes).catch(err =>
      console.warn('Could not sync status update to backend:', err)
    );
  };

  const updatePaymentStatus = (id: string, paymentStatus: PaymentStatus) => {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    setRegistrations(prev =>
      prev.map(item => {
        if (item.id === id) {
          const newStatus: RegistrationStatus =
            paymentStatus === 'PAID' && item.status === 'PENDING_PAYMENT'
              ? 'APPROVED'
              : item.status;
          const updated: RegistrationItem = {
            ...item,
            paymentStatus,
            status: newStatus,
            lastUpdated: formattedDate,
          };
          idbSaveRegistration(updated).catch(() => {});
          return updated;
        }
        return item;
      })
    );

    ApiService.updatePaymentStatus(id, paymentStatus).catch(err =>
      console.warn('Could not sync payment update to backend:', err)
    );
  };

  const deleteRegistration = (id: string) => {
    const target = registrations.find(r => r.id === id || r.regCode === id);

    setRegistrations(prev => prev.filter(item => item.id !== id && item.regCode !== id));
    idbDeleteRegistration(id).catch(() => {});
    if (target?.id && target.id !== id) {
      idbDeleteRegistration(target.id).catch(() => {});
    }

    if (target) {
      const mediaUrls: string[] = [];
      if (target.teamLogo && target.teamLogo.includes('/api/media/view/')) {
        mediaUrls.push(target.teamLogo);
      }
      if (target.documents && typeof target.documents === 'object') {
        for (const doc of Object.values(target.documents)) {
          if (!doc) continue;
          const d = doc as any;
          if (d.url && typeof d.url === 'string' && d.url.includes('/api/media/view/')) {
            mediaUrls.push(d.url);
          }
          if (d.fileData && typeof d.fileData === 'string' && d.fileData.includes('/api/media/view/')) {
            mediaUrls.push(d.fileData);
          }
        }
      }
      for (const u of mediaUrls) {
        deleteMediaFromStorage(u).catch(() => {});
      }
    }

    ApiService.deleteRegistration(id).catch(err =>
      console.warn('Could not delete registration on backend:', err)
    );
  };

  // Matches
  const addMatch = (newMatch: Omit<MatchItem, 'id'>) => {
    const item: MatchItem = {
      ...newMatch,
      id: `match-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    };
    setMatches(prev => {
      const combined = [item, ...prev];
      safeLocalStorageSet('wabupcup_matches', JSON.stringify(combined));
      return combined;
    });
    ApiService.saveMatch(item).catch(err =>
      console.warn('Could not save match to backend:', err)
    );
  };

  const updateMatch = (updated: MatchItem) => {
    let determinedWinner: 'A' | 'B' | 'DRAW' | undefined = updated.winnerId;
    const scoreA = updated.teamA.score;
    const scoreB = updated.teamB.score;
    const penA = updated.teamA.penalties;
    const penB = updated.teamB.penalties;

    if (scoreA !== undefined && scoreB !== undefined) {
      if (scoreA > scoreB) {
        determinedWinner = 'A';
      } else if (scoreB > scoreA) {
        determinedWinner = 'B';
      } else {
        if (penA !== undefined && penB !== undefined && penA !== penB) {
          determinedWinner = penA > penB ? 'A' : 'B';
        } else {
          determinedWinner = 'DRAW';
        }
      }
    }

    const matchWithWinner: MatchItem = {
      ...updated,
      winnerId: determinedWinner,
    };

    setMatches(prevMatches => {
      let newMatchesList = prevMatches.map(m => (m.id === updated.id ? matchWithWinner : m));

      if (matchWithWinner.status === 'FINISHED' && (determinedWinner === 'A' || determinedWinner === 'B')) {
        const winningTeam = determinedWinner === 'A' ? matchWithWinner.teamA : matchWithWinner.teamB;

        if (matchWithWinner.nextMatchId) {
          newMatchesList = newMatchesList.map(m => {
            if (m.id === matchWithWinner.nextMatchId) {
              const updatedNextMatch = matchWithWinner.nextMatchSlot === 'B'
                ? {
                    ...m,
                    teamB: {
                      ...m.teamB,
                      name: winningTeam.name,
                      institution: winningTeam.institution,
                      logo: winningTeam.logo,
                    },
                  }
                : {
                    ...m,
                    teamA: {
                      ...m.teamA,
                      name: winningTeam.name,
                      institution: winningTeam.institution,
                      logo: winningTeam.logo,
                    },
                  };
              ApiService.saveMatch(updatedNextMatch).catch(() => {});
              return updatedNextMatch;
            }
            return m;
          });
        }
      } else if (matchWithWinner.status !== 'FINISHED' && matchWithWinner.nextMatchId) {
        const placeholderName = `Pemenang Match ${matchWithWinner.matchNumber}`;
        newMatchesList = newMatchesList.map(m => {
          if (m.id === matchWithWinner.nextMatchId) {
            const updatedNextMatch = matchWithWinner.nextMatchSlot === 'B'
              ? {
                  ...m,
                  teamB: {
                    ...m.teamB,
                    name: placeholderName,
                    institution: 'TBD',
                    logo: undefined,
                    score: undefined,
                    penalties: undefined,
                  },
                }
              : {
                  ...m,
                  teamA: {
                    ...m.teamA,
                    name: placeholderName,
                    institution: 'TBD',
                    logo: undefined,
                    score: undefined,
                    penalties: undefined,
                  },
                };
            ApiService.saveMatch(updatedNextMatch).catch(() => {});
            return updatedNextMatch;
          }
          return m;
        });
      }

      safeLocalStorageSet('wabupcup_matches', JSON.stringify(newMatchesList));
      return newMatchesList;
    });

    ApiService.saveMatch(matchWithWinner).catch(err =>
      console.warn('Could not sync match update to backend:', err)
    );
  };

  const deleteMatch = (matchId: string) => {
    setMatches(prev => {
      const next = prev.filter(m => m.id !== matchId);
      safeLocalStorageSet('wabupcup_matches', JSON.stringify(next));
      return next;
    });
    ApiService.deleteMatch(matchId).catch(err =>
      console.warn('Could not delete match on backend:', err)
    );
  };

  const checkCanDrawNextRound = (category: TournamentCategory) => {
    const catMatches = matches.filter(m => m.category === category);
    if (catMatches.length === 0) {
      return {
        canDraw: true,
        pendingMatchesCount: 0,
        completedMatchesCount: 0,
        totalMatchesCount: 0,
        currentRoundName: 'Belum Ada Pertandingan',
      };
    }

    const pendingMatches = catMatches.filter(m => m.status !== 'FINISHED');
    const completedMatches = catMatches.filter(m => m.status === 'FINISHED');

    return {
      canDraw: pendingMatches.length === 0,
      pendingMatchesCount: pendingMatches.length,
      completedMatchesCount: completedMatches.length,
      totalMatchesCount: catMatches.length,
      currentRoundName: pendingMatches[0]?.round || 'Seluruh Babak Selesai',
    };
  };

  const randomizeMatchesForCategory = (
    category: TournamentCategory,
    stageOption?: 'AUTO' | 'PENYISIHAN' | '16_BESAR' | '8_BESAR' | 'SEMIFINAL'
  ): { success: boolean; message: string; matches?: MatchItem[] } => {
    const approvedTeams = registrations
      .filter(r => r.category === category && r.status === 'APPROVED')
      .map(r => ({
        name: r.teamName,
        institution: r.institutionName,
        logo: r.teamLogo,
      }));

    if (approvedTeams.length === 0) {
      return {
        success: false,
        message: `Kategori "${category}" belum memiliki tim pendaftar yang berstatus APPROVED. Verifikasi tim terlebih dahulu di menu Pendaftaran.`,
      };
    }

    if (approvedTeams.length < 2) {
      return {
        success: false,
        message: `Kategori "${category}" baru memiliki ${approvedTeams.length} tim yang disetujui. Minimal diperlukan 2 tim untuk melakukan pengacakan jadwal.`,
      };
    }

    const teamsToDraw = [...approvedTeams];
    for (let i = teamsToDraw.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [teamsToDraw[i], teamsToDraw[j]] = [teamsToDraw[j], teamsToDraw[i]];
    }

    let chosenStructure: '16_BESAR' | '8_BESAR' | 'SEMIFINAL' | 'FINAL_ONLY' = '8_BESAR';

    if (stageOption === '16_BESAR' || stageOption === 'PENYISIHAN') {
      chosenStructure = '16_BESAR';
    } else if (stageOption === '8_BESAR') {
      chosenStructure = '8_BESAR';
    } else if (stageOption === 'SEMIFINAL') {
      chosenStructure = 'SEMIFINAL';
    } else {
      if (teamsToDraw.length >= 9) {
        chosenStructure = '16_BESAR';
      } else if (teamsToDraw.length >= 5) {
        chosenStructure = '8_BESAR';
      } else if (teamsToDraw.length >= 3) {
        chosenStructure = 'SEMIFINAL';
      } else {
        chosenStructure = 'FINAL_ONLY';
      }
    }

    const kickoffTimes = ['08:00', '09:15', '10:30', '13:30', '15:00', '16:15', '19:00', '20:15'];
    const pitches = ['Lapangan 1 - Utama', 'Lapangan 2 - Futsal A', 'Lapangan 3 - Futsal B'];
    let matchCounter = 1;
    const newGeneratedMatches: MatchItem[] = [];

    const grandFinalId = `match-${category.toLowerCase()}-final-${Date.now()}`;
    const semi1Id = `match-${category.toLowerCase()}-sf1-${Date.now()}`;
    const semi2Id = `match-${category.toLowerCase()}-sf2-${Date.now()}`;

    const qfIds = [
      `match-${category.toLowerCase()}-qf1-${Date.now()}`,
      `match-${category.toLowerCase()}-qf2-${Date.now()}`,
      `match-${category.toLowerCase()}-qf3-${Date.now()}`,
      `match-${category.toLowerCase()}-qf4-${Date.now()}`,
    ];

    const r16Ids = [
      `match-${category.toLowerCase()}-r16-1-${Date.now()}`,
      `match-${category.toLowerCase()}-r16-2-${Date.now()}`,
      `match-${category.toLowerCase()}-r16-3-${Date.now()}`,
      `match-${category.toLowerCase()}-r16-4-${Date.now()}`,
      `match-${category.toLowerCase()}-r16-5-${Date.now()}`,
      `match-${category.toLowerCase()}-r16-6-${Date.now()}`,
      `match-${category.toLowerCase()}-r16-7-${Date.now()}`,
      `match-${category.toLowerCase()}-r16-8-${Date.now()}`,
    ];

    if (chosenStructure === 'FINAL_ONLY') {
      const teamA = teamsToDraw[0];
      const teamB = teamsToDraw[1];
      newGeneratedMatches.push({
        id: grandFinalId,
        matchNumber: matchCounter++,
        category: category,
        round: 'GRAND FINAL WABUP CUP 2026',
        roundIndex: 5,
        teamA: { name: teamA.name, institution: teamA.institution, logo: teamA.logo },
        teamB: { name: teamB.name, institution: teamB.institution, logo: teamB.logo },
        date: '2026-10-31',
        time: '19:00',
        pitch: 'Stadion Utama Gelora Wijaya',
        status: 'UPCOMING',
      });
    } else if (chosenStructure === '16_BESAR') {
      const targetTeams = [...teamsToDraw];
      while (targetTeams.length < 16) {
        targetTeams.push({ name: 'BYE (Lolos Otomatis)', institution: '-', logo: '' });
      }

      for (let i = 0; i < 8; i++) {
        const teamA = targetTeams[i * 2];
        const teamB = targetTeams[i * 2 + 1];
        const assignedQfId = qfIds[Math.floor(i / 2)];
        const assignedQfSlot: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';

        newGeneratedMatches.push({
          id: r16Ids[i],
          matchNumber: matchCounter++,
          category: category,
          round: `Babak 16 Besar - Match ${i + 1}`,
          roundIndex: 2,
          teamA: { name: teamA.name, institution: teamA.institution, logo: teamA.logo },
          teamB: { name: teamB.name, institution: teamB.institution, logo: teamB.logo },
          date: '2026-10-25',
          time: kickoffTimes[i % kickoffTimes.length],
          pitch: pitches[i % pitches.length],
          status: 'UPCOMING',
          nextMatchId: assignedQfId,
          nextMatchSlot: assignedQfSlot,
        });
      }

      for (let i = 0; i < 4; i++) {
        const assignedNextId = i < 2 ? semi1Id : semi2Id;
        const assignedNextSlot: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';

        newGeneratedMatches.push({
          id: qfIds[i],
          matchNumber: matchCounter++,
          category: category,
          round: `Perempat Final ${i + 1} (8 Besar)`,
          roundIndex: 3,
          teamA: { name: `Pemenang Match ${i * 2 + 1}`, institution: 'TBD' },
          teamB: { name: `Pemenang Match ${i * 2 + 2}`, institution: 'TBD' },
          date: '2026-10-27',
          time: kickoffTimes[i % kickoffTimes.length],
          pitch: pitches[i % pitches.length],
          status: 'UPCOMING',
          nextMatchId: assignedNextId,
          nextMatchSlot: assignedNextSlot,
        });
      }

      newGeneratedMatches.push({
        id: semi1Id,
        matchNumber: matchCounter++,
        category: category,
        round: 'Semifinal 1',
        roundIndex: 4,
        teamA: { name: 'Pemenang Perempat Final 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Perempat Final 2', institution: 'TBD' },
        date: '2026-10-29',
        time: '16:00',
        pitch: 'Lapangan 1 - Utama',
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'A',
      });

      newGeneratedMatches.push({
        id: semi2Id,
        matchNumber: matchCounter++,
        category: category,
        round: 'Semifinal 2',
        roundIndex: 4,
        teamA: { name: 'Pemenang Perempat Final 3', institution: 'TBD' },
        teamB: { name: 'Pemenang Perempat Final 4', institution: 'TBD' },
        date: '2026-10-29',
        time: '19:30',
        pitch: 'Lapangan 1 - Utama',
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'B',
      });

      newGeneratedMatches.push({
        id: grandFinalId,
        matchNumber: matchCounter++,
        category: category,
        round: 'GRAND FINAL WABUP CUP 2026',
        roundIndex: 5,
        teamA: { name: 'Pemenang Semifinal 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Semifinal 2', institution: 'TBD' },
        date: '2026-10-31',
        time: '19:00',
        pitch: 'Stadion Utama Gelora Wijaya',
        status: 'UPCOMING',
      });
    } else if (chosenStructure === '8_BESAR') {
      const targetTeams = [...teamsToDraw];
      while (targetTeams.length < 8) {
        targetTeams.push({ name: 'BYE (Lolos Otomatis)', institution: '-', logo: '' });
      }

      for (let i = 0; i < 4; i++) {
        const teamA = targetTeams[i * 2];
        const teamB = targetTeams[i * 2 + 1];
        const assignedNextId = i < 2 ? semi1Id : semi2Id;
        const assignedNextSlot: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';

        newGeneratedMatches.push({
          id: qfIds[i],
          matchNumber: matchCounter++,
          category: category,
          round: `Perempat Final ${i + 1} (8 Besar)`,
          roundIndex: 3,
          teamA: { name: teamA.name, institution: teamA.institution, logo: teamA.logo },
          teamB: { name: teamB.name, institution: teamB.institution, logo: teamB.logo },
          date: '2026-10-26',
          time: kickoffTimes[i % kickoffTimes.length],
          pitch: pitches[i % pitches.length],
          status: 'UPCOMING',
          nextMatchId: assignedNextId,
          nextMatchSlot: assignedNextSlot,
        });
      }

      newGeneratedMatches.push({
        id: semi1Id,
        matchNumber: matchCounter++,
        category: category,
        round: 'Semifinal 1',
        roundIndex: 4,
        teamA: { name: 'Pemenang Perempat Final 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Perempat Final 2', institution: 'TBD' },
        date: '2026-10-28',
        time: '16:00',
        pitch: 'Lapangan 1 - Utama',
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'A',
      });

      newGeneratedMatches.push({
        id: semi2Id,
        matchNumber: matchCounter++,
        category: category,
        round: 'Semifinal 2',
        roundIndex: 4,
        teamA: { name: 'Pemenang Perempat Final 3', institution: 'TBD' },
        teamB: { name: 'Pemenang Perempat Final 4', institution: 'TBD' },
        date: '2026-10-28',
        time: '19:30',
        pitch: 'Lapangan 1 - Utama',
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'B',
      });

      newGeneratedMatches.push({
        id: grandFinalId,
        matchNumber: matchCounter++,
        category: category,
        round: 'GRAND FINAL WABUP CUP 2026',
        roundIndex: 5,
        teamA: { name: 'Pemenang Semifinal 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Semifinal 2', institution: 'TBD' },
        date: '2026-10-31',
        time: '19:00',
        pitch: 'Stadion Utama Gelora Wijaya',
        status: 'UPCOMING',
      });
    } else {
      const targetTeams = [...teamsToDraw];
      while (targetTeams.length < 4) {
        targetTeams.push({ name: 'BYE (Lolos Otomatis)', institution: '-', logo: '' });
      }

      const teamA1 = targetTeams[0];
      const teamB1 = targetTeams[1];
      const teamA2 = targetTeams[2];
      const teamB2 = targetTeams[3];

      newGeneratedMatches.push({
        id: semi1Id,
        matchNumber: matchCounter++,
        category: category,
        round: 'Semifinal 1',
        roundIndex: 4,
        teamA: { name: teamA1.name, institution: teamA1.institution, logo: teamA1.logo },
        teamB: { name: teamB1.name, institution: teamB1.institution, logo: teamB1.logo },
        date: '2026-10-28',
        time: '16:00',
        pitch: 'Lapangan 1 - Utama',
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'A',
      });

      newGeneratedMatches.push({
        id: semi2Id,
        matchNumber: matchCounter++,
        category: category,
        round: 'Semifinal 2',
        roundIndex: 4,
        teamA: { name: teamA2.name, institution: teamA2.institution, logo: teamA2.logo },
        teamB: { name: teamB2.name, institution: teamB2.institution, logo: teamB2.logo },
        date: '2026-10-28',
        time: '19:30',
        pitch: 'Lapangan 1 - Utama',
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'B',
      });

      newGeneratedMatches.push({
        id: grandFinalId,
        matchNumber: matchCounter++,
        category: category,
        round: 'GRAND FINAL WABUP CUP 2026',
        roundIndex: 5,
        teamA: { name: 'Pemenang Semifinal 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Semifinal 2', institution: 'TBD' },
        date: '2026-10-31',
        time: '19:00',
        pitch: 'Stadion Utama Gelora Wijaya',
        status: 'UPCOMING',
      });
    }

    setMatches(prev => {
      const otherCategoryMatches = prev.filter(m => m.category !== category);
      const combined = [...otherCategoryMatches, ...newGeneratedMatches];
      safeLocalStorageSet('wabupcup_matches', JSON.stringify(combined));
      return combined;
    });

    ApiService.replaceCategoryMatches(category, newGeneratedMatches).catch(err => {
      console.warn('Could not sync randomized matches to backend:', err);
    });

    return {
      success: true,
      message: `Bagan resmi kategori ${category} berhasil diacak (${approvedTeams.length} Tim Disetujui).`,
      matches: newGeneratedMatches,
    };
  };

  // Sponsors
  const addSponsor = (sponsor: Omit<SponsorItem, 'id'>) => {
    const item: SponsorItem = {
      ...sponsor,
      id: `sp-${Date.now()}`,
    };
    setSponsors(prev => {
      const next = [...prev, item];
      safeLocalStorageSet('wabupcup_sponsors', JSON.stringify(next));
      return next;
    });
    ApiService.saveSponsor(item).catch(err =>
      console.warn('Could not save sponsor to backend:', err)
    );
  };

  const updateSponsor = (updated: SponsorItem) => {
    setSponsors(prev => {
      const next = prev.map(s => (s.id === updated.id ? updated : s));
      safeLocalStorageSet('wabupcup_sponsors', JSON.stringify(next));
      return next;
    });
    ApiService.saveSponsor(updated).catch(err =>
      console.warn('Could not update sponsor on backend:', err)
    );
  };

  const deleteSponsor = (id: string) => {
    setSponsors(prev => {
      const next = prev.filter(s => s.id !== id);
      safeLocalStorageSet('wabupcup_sponsors', JSON.stringify(next));
      return next;
    });
    ApiService.deleteSponsor(id).catch(err =>
      console.warn('Could not delete sponsor on backend:', err)
    );
  };

  // Admin Users & Auth yang aman (100% diproses di backend)
  const loginAdmin = async (username: string, pass: string): Promise<{ success: boolean; message?: string; admin?: AdminUser }> => {
    const cleanUser = username.trim();
    if (!cleanUser || !pass) {
      return { success: false, message: 'Username dan kata sandi wajib diisi.' };
    }

    try {
      const res = await ApiService.loginAdmin(cleanUser, pass);
      if (res && res.success && res.user) {
        // Buang password sebelum disimpan ke storage lokal browser
        const { password, ...safeUser } = res.user as any;
        setCurrentAdmin(safeUser);
        safeLocalStorageSet('wabupcup_current_admin', JSON.stringify(safeUser));
        
        // Segera ambil data administrasi lengkap setelah login berhasil
        refreshDataFromServer();
        return { success: true, admin: safeUser };
      }
      return { success: false, message: res?.message || 'Kredensial tidak valid' };
    } catch (err: any) {
      console.error('Login error:', err);
      return { success: false, message: 'Gagal terhubung ke server autentikasi.' };
    }
  };

  const logoutAdmin = () => {
    setCurrentAdmin(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('wabupcup_current_admin');
    }
  };

  const addAdminUser = async (user: Omit<AdminUser, 'id' | 'createdAt'> & { password?: string }): Promise<{ success: boolean; savedToDatabase?: boolean; error?: string }> => {
    try {
      const res = await ApiService.createAdmin(user);
      if (!res.success) {
        throw new Error(res.error || 'Gagal menyimpan admin ke database.');
      }
      await refreshDataFromServer();
      await checkDbStatus();
      return { success: true, savedToDatabase: res.savedToDatabase };
    } catch (err: any) {
      console.warn('Could not sync created admin to backend:', err);
      return { success: false, error: err?.message || 'Gagal membuat admin' };
    }
  };

  const updateAdminUser = async (updatedUser: AdminUser & { password?: string }): Promise<{ success: boolean; savedToDatabase?: boolean; error?: string }> => {
    try {
      const res = await ApiService.updateAdmin(updatedUser.id, updatedUser);
      if (!res.success) {
        throw new Error(res.error || 'Gagal menyimpan perubahan admin ke database.');
      }
      if (currentAdmin && currentAdmin.id === updatedUser.id) {
        const { password, ...safeSelf } = updatedUser;
        setCurrentAdmin(safeSelf);
        safeLocalStorageSet('wabupcup_current_admin', JSON.stringify(safeSelf));
      }
      await refreshDataFromServer();
      await checkDbStatus();
      return { success: true, savedToDatabase: res.savedToDatabase };
    } catch (err: any) {
      console.warn('Could not sync updated admin to backend:', err);
      return { success: false, error: err?.message || 'Gagal mengupdate admin' };
    }
  };

  const deleteAdminUser = async (id: string): Promise<{ success: boolean; savedToDatabase?: boolean; error?: string }> => {
    try {
      const res = await ApiService.deleteAdmin(id);
      if (!res.success) {
        throw new Error(res.error || 'Gagal menghapus admin dari database.');
      }
      await refreshDataFromServer();
      await checkDbStatus();
      return { success: true, savedToDatabase: res.savedToDatabase };
    } catch (err: any) {
      console.warn('Could not delete admin from backend:', err);
      return { success: false, error: err?.message || 'Gagal menghapus admin' };
    }
  };

  const resetAllDataToDefaults = () => {
    setConfig(DEFAULT_TOURNAMENT_CONFIG);
    setCategories(DEFAULT_CATEGORIES);
    setRegistrations([]);
    setMatches([]);
    setSponsors([]);
    setAdminUsers([]);
    if (typeof window !== 'undefined') {
      localStorage.clear();
    }
  };

  // WhatsApp formatted notification generator
  const getWhatsAppNotificationUrl = (
    item: RegistrationItem,
    type: 'CONFIRMATION' | 'APPROVED' | 'REJECTED' | 'PAYMENT_REMINDER' | 'INVOICE'
  ): string => {
    const cleanPhone = (item.coachPhone || '').replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.startsWith('0')
      ? `62${cleanPhone.slice(1)}`
      : cleanPhone;

    const primaryBank = bankAccounts.find(b => b.isPrimary) || bankAccounts[0] || config.bankAccount;
    const tourneyName = config.name || 'WabupCup 2026';

    let message = '';
    if (type === 'CONFIRMATION') {
      message = `Halo *${item.coachName}*, terima kasih telah mendaftarkan tim *${item.teamName}* pada Turnamen *${tourneyName}* (Kategori: *${item.category}*).\n\n📌 *Kode Registrasi:* ${item.regCode}\n💰 *Biaya Pendaftaran:* Rp ${item.paymentAmount.toLocaleString('id-ID')}\n🏦 *Transfer ke:* ${primaryBank?.bankName || 'Bank'} No. Rek: ${primaryBank?.accountNumber || '-'} a/n ${primaryBank?.accountHolder || 'Panitia'}\n\nSilakan kirimkan bukti transfer ke nomor ini untuk diverifikasi oleh panitia. Salam olahraga!`;
    } else if (type === 'APPROVED') {
      message = `🎉 *SELAMAT! PENDAFTARAN DISETUJUI*\n\nTim *${item.teamName}* (${item.regCode}) telah resmi TERVERIFIKASI & DISETUJUI untuk bertanding di *${tourneyName}* Kategori *${item.category}*.\n\n📅 *PENGUMUMAN:* Pantau IG @infinity.organizer_.\n🏟️ *Lokasi:* ${config.venueName || 'Stadion'}, ${config.venueCity || 'Banyuwangi'}\n\nSampai jumpa di lapangan dan junjung tinggi sportivitas!`;
    } else if (type === 'REJECTED') {
      message = `⚠️ *PEMBERITAHUAN VERIFIKASI BERKAS ${tourneyName.toUpperCase()}*\n\nTim *${item.teamName}* (${item.regCode}), berkas pendaftaran Anda memerlukan perbaikan dengan catatan:\n\n❌ *Alasan:* ${item.rejectionReason || 'Berkas dokumen belum sesuai ketentuan regulasi'}\n\nSilakan lakukan upload ulang atau hubungi sekretariat panitia untuk bantuan perbaikan berkas.`;
    } else if (type === 'PAYMENT_REMINDER') {
      message = `🔔 *PENGINGAT PEMBAYARAN REGISTRASI ${tourneyName.toUpperCase()}*\n\nYth. *${item.coachName}* (${item.teamName}), berkas tim Anda sudah lengkap dan valid. Mohon segera menyelesaikan pembayaran biaya pendaftaran sebesar *Rp ${item.paymentAmount.toLocaleString('id-ID')}* sebelum batas akhir agar slot tim Anda terkunci aman.\n\nRekening: ${primaryBank?.bankName || 'Bank'} ${primaryBank?.accountNumber || '-'} a/n ${primaryBank?.accountHolder || 'Panitia'}. Terima kasih!`;
    } else if (type === 'INVOICE') {
      const invNumber = `INV/WBC26/${item.category}/${item.regCode}`;
      message = `🧾 *INVOICE & KUITANSI RESMI PEMBAYARAN ${tourneyName.toUpperCase()}*\n--------------------------------------------------\nKepada Yth. *${item.coachName}*\nPelatih / Official Tim *${item.teamName}*\n\nTerima kasih, pembayaran pendaftaran tim Anda telah berstatus *LUNAS (PAID)* & terverifikasi oleh Panitia Pelaksana.\n\n📋 *RINCIAN KEPESERTAAN:* \n• Nomor Invoice: *${invNumber}*\n• Kode Registrasi: *${item.regCode}*\n• Kategori: *${item.category}*\n• Asal Instansi: *${item.institutionName || '-'}*\n• Total Biaya: *Rp ${item.paymentAmount.toLocaleString('id-ID')} (LUNAS)*.\n\nSampai jumpa di sesi Technical Meeting & Screening Pemain! Salam olahraga! ⚽🏆`;
    }

    return `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`;
  };

  return (
    <TournamentContext.Provider
      value={{
        theme,
        toggleTheme,
        config,
        updateConfig,
        refreshDataFromServer,
        isSyncingWithServer,
        downloadableDocs,
        addDownloadableDoc,
        updateDownloadableDoc,
        deleteDownloadableDoc,
        committeeContacts,
        addCommitteeContact,
        updateCommitteeContact,
        deleteCommitteeContact,
        setPrimaryCommitteeContact,
        committeeEmails,
        addCommitteeEmail,
        updateCommitteeEmail,
        deleteCommitteeEmail,
        bankAccounts,
        addBankAccount,
        updateBankAccount,
        deleteBankAccount,
        setPrimaryBankAccount,
        categories,
        addCategory,
        updateCategory,
        deleteCategory,
        reorderCategories,
        syncCategoryQuotas,
        registrations,
        submitNewRegistration,
        updateRegistration,
        updateRegistrationStatus,
        updatePaymentStatus,
        deleteRegistration,
        matches,
        addMatch,
        updateMatch,
        deleteMatch,
        randomizeMatchesForCategory,
        checkCanDrawNextRound,
        sponsors,
        addSponsor,
        updateSponsor,
        deleteSponsor,
        adminUsers,
        currentAdmin,
        loginAdmin,
        logoutAdmin,
        addAdminUser,
        updateAdminUser,
        deleteAdminUser,
        resetAllDataToDefaults,
        getWhatsAppNotificationUrl,
        dbStatus,
        checkDbStatus,
        isInitialLoading,
        isLoadingCategories: isInitialLoading && categories.length === 0,
      }}
    >
      {children}
    </TournamentContext.Provider>
  );
};

export const useTournament = (): TournamentContextType => {
  const context = useContext(TournamentContext);
  if (!context) {
    throw new Error('useTournament must be used within a TournamentProvider');
  }
  return context;
};