import React, { useState } from 'react';
import { useTournament } from '../context/TournamentContext';
import { RegistrationItem } from '../types';
import {
  Search,
  X,
  CheckCircle2,
  Clock,
  XCircle,
  Phone,
  FileText,
  Shield,
  ExternalLink,
  Copy,
  Download,
  Loader2,
} from 'lucide-react';
import { InvoiceModal } from './InvoiceModal';
import { getWhatsAppInvoiceShareUrl } from '../utils/invoicePdf';
import { ApiService } from '../services/api';

interface CheckStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CheckStatusModal: React.FC<CheckStatusModalProps> = ({ isOpen, onClose }) => {
  const { registrations, config, committeeContacts } = useTournament();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedResults, setSearchedResults] = useState<RegistrationItem[] | null | 'NOT_FOUND'>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [activeInvoiceItem, setActiveInvoiceItem] = useState<RegistrationItem | null>(null);

  if (!isOpen) return null;

  const primaryContact = committeeContacts?.find(c => c.isPrimary) || committeeContacts?.[0] || {
    name: 'Sekretariat Panitia WABUPCUP',
    phone: config.adminContactPhone || '085232924449',
  };
  const cleanAdminPhone = primaryContact.phone.replace(/\D/g, '');
  const formattedAdminPhone = cleanAdminPhone.startsWith('0')
    ? `62${cleanAdminPhone.slice(1)}`
    : cleanAdminPhone;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setIsSearching(true);
    setSearchedResults(null);

    try {
      // 1. Prioritas: Query langsung ke Server Database secara Real-Time
      const serverResults = await ApiService.checkRegistrationStatus(query);
      if (Array.isArray(serverResults) && serverResults.length > 0) {
        setSearchedResults(serverResults);
        return;
      }

      // 2. Cadangan: Cek data lokal / state context (jika ada data offline atau login admin)
      const lowerQuery = query.toLowerCase();
      const digitsOnly = query.replace(/\D/g, '');
      const localMatches = (registrations || []).filter(r => {
        if (!r) return false;
        const lowerCode = (r.regCode || '').toLowerCase().trim();
        const lowerName = (r.teamName || '').toLowerCase().trim();
        const rawPhone = (r.coachPhone || '').trim();
        const cleanPhoneDigits = rawPhone.replace(/\D/g, '');

        const codeMatch = lowerCode === lowerQuery || lowerCode.includes(lowerQuery);
        const nameMatch = lowerName.includes(lowerQuery);
        let phoneMatch = rawPhone.includes(query);
        if (digitsOnly && cleanPhoneDigits.includes(digitsOnly)) phoneMatch = true;
        if (digitsOnly.length >= 6 && cleanPhoneDigits.endsWith(digitsOnly)) phoneMatch = true;

        return codeMatch || nameMatch || phoneMatch;
      });

      if (localMatches.length > 0) {
        setSearchedResults(localMatches);
      } else {
        setSearchedResults('NOT_FOUND');
      }
    } catch (err) {
      console.warn('[CheckStatusModal] Gagal mencari data pendaftaran:', err);
      setSearchedResults('NOT_FOUND');
    } finally {
      setIsSearching(false);
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setSearchedResults(null);
    onClose();
  };

  return (
    <div
      id="check-status-modal-overlay"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
    >
      <div
        id="check-status-modal-container"
        className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-6 text-slate-900 dark:text-white"
      >
        {/* HEADER */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Search className="w-5 h-5 text-red-500" />
            <h3 className="text-lg font-bold uppercase tracking-wider">
              Cek Status Berkas Pendaftaran
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 space-y-6">
          
          {/* SEARCH FORM */}
          <form onSubmit={handleSearch} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
              Masukkan Kode Registrasi (Contoh: <strong className="text-red-500 font-mono">WBC-SD-001</strong>) atau No. WhatsApp / Nama Tim:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                placeholder="WBC-SD-001 atau 0812..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                disabled={isSearching}
                className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-red-500 focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white font-bold text-xs uppercase tracking-wider transition shadow-md flex items-center justify-center min-w-[90px]"
              >
                {isSearching ? (
                  <span className="flex items-center space-x-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Cari...</span>
                  </span>
                ) : (
                  <span>Cari</span>
                )}
              </button>
            </div>
          </form>

          {/* RESULT: NOT FOUND */}
          {searchedResults === 'NOT_FOUND' && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs text-center space-y-1 animate-fadeIn">
              <p className="font-bold">❌ Data tim tidak ditemukan</p>
              <p className="text-[11px] text-red-600 dark:text-red-400">
                Pastikan Kode Registrasi (Contoh: WBC-SD-001) atau Nomor WhatsApp yang Anda masukkan sesuai saat mengisi formulir pendaftaran.
              </p>
            </div>
          )}

          {/* RESULT: LIST OF FOUND TEAMS */}
          {Array.isArray(searchedResults) && searchedResults.length > 0 && (
            <div className="space-y-4 animate-fadeIn">
              {searchedResults.length > 1 && (
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Ditemukan <strong className="text-red-500">{searchedResults.length}</strong> data tim terdaftar:
                </p>
              )}

              {searchedResults.map(item => (
                <div
                  key={item.id || item.regCode}
                  className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-red-600 dark:text-red-400 uppercase block">
                        {item.regCode}
                      </span>
                      <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                        {item.teamName}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {item.institutionName} • Kategori {item.category}
                      </p>
                    </div>

                    {/* STATUS BADGE */}
                    <div>
                      {item.status === 'APPROVED' && (
                        <span className="px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center space-x-1 border border-emerald-300 dark:border-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>DISETUJUI</span>
                        </span>
                      )}
                      {item.status === 'PENDING_PAYMENT' && (
                        <span className="px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center space-x-1 border border-amber-300 dark:border-amber-800">
                          <Clock className="w-3.5 h-3.5" />
                          <span>MENUNGGU PEMBAYARAN</span>
                        </span>
                      )}
                      {item.status === 'REJECTED' && (
                        <span className="px-3 py-1.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center space-x-1 border border-rose-300 dark:border-rose-800">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>PERLU PERBAIKAN</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* REJECTION REASON IF ANY */}
                  {item.status === 'REJECTED' && item.rejectionReason && (
                    <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-xs text-rose-900 dark:text-rose-200">
                      <strong>Catatan Panitia:</strong>
                      <p className="mt-1">{item.rejectionReason}</p>
                    </div>
                  )}

                  {/* ADMIN NOTES */}
                  {item.adminNotes && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                      ℹ️ {item.adminNotes}
                    </p>
                  )}

                  {/* INFO NOTICE FOR PENDING PAYMENT */}
                  {item.status === 'PENDING_PAYMENT' && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                      <p className="font-bold">Menunggu Validasi Berkas & Konfirmasi Pembayaran</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        Berkas tim Anda sedang dalam proses peninjauan oleh sekretariat panitia. Silakan hubungi admin panitia via WhatsApp di bawah untuk mempercepat validasi dan mendapatkan nomor rekening pembayaran resmi.
                      </p>
                    </div>
                  )}

                  {/* WHATSAPP ACTION BUTTON */}
                  <div className="pt-2">
                    <a
                      href={`https://wa.me/${formattedAdminPhone}?text=${encodeURIComponent(
                        `Halo Panitia *${config.name + '2026' || 'WABUPCUP 2026'}*, saya *${item.coachName}* dari tim *${item.teamName}* (Kategori: *${item.category}*).\n\n📌 *Kode Registrasi:* ${item.regCode}\n📊 *Status Berkas:* ${
                          item.status === 'APPROVED'
                            ? 'Telah Disetujui'
                            : item.status === 'PENDING_PAYMENT'
                            ? 'Menunggu Validasi & Pembayaran'
                            : 'Perlu Perbaikan'
                        }\n\nSaya ingin menanyakan perihal validasi persyaratan berkas dan konfirmasi pembayaran tim kami. Terima kasih!`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs flex items-center justify-center space-x-2 transition border border-slate-700"
                    >
                      <Phone className="w-4 h-4 text-emerald-400" />
                      <span>Hubungi Sekretariat Panitia di WhatsApp</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* INVOICE MODAL POPUP */}
      {activeInvoiceItem && (
        <InvoiceModal
          isOpen={isInvoiceOpen}
          onClose={() => {
            setIsInvoiceOpen(false);
            setActiveInvoiceItem(null);
          }}
          item={activeInvoiceItem}
          config={config}
        />
      )}
    </div>
  );
};
