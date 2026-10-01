import React, { useEffect, useState } from 'react';
import { useTournament } from '../context/TournamentContext';
import { SectionBackground } from './SectionBackground';
import {
  Trophy,
  Calendar,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Download,
  Users,
  MapPin,
  Clock
} from 'lucide-react';

interface HeroProps {
  onOpenRegister?: () => void;
  onOpenRegistration?: () => void;
  onOpenCheckStatus: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onOpenRegister, onOpenRegistration, onOpenCheckStatus }) => {
  const { config, registrations, categories } = useTournament();

  const handleRegisterClick = () => {
    if (onOpenRegister) onOpenRegister();
    else if (onOpenRegistration) onOpenRegistration();
  };

  // Countdown timer calculation to kickoff date
  const calculateTimeLeft = (startDate?: string) => {
    if (!startDate) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    const target = new Date(`${startDate}T08:00:00`).getTime();
    const now = new Date().getTime();
    const difference = target - now;
    if (difference <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    return {
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / 1000 / 60) % 60),
      seconds: Math.floor((difference / 1000) % 60),
    };
  };

  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  }>(() => calculateTimeLeft(config.tournamentStartDate));

  useEffect(() => {
    const updateCountdown = () => {
      setTimeLeft(calculateTimeLeft(config.tournamentStartDate));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [config.tournamentStartDate]);

  const approvedTeamsCount = registrations.filter(r => r.status === 'APPROVED').length;
  const totalTeamsCount = registrations.length;

  const bgConfig = config.sectionsBackgrounds?.hero;
  const hasCustomBg = Boolean(bgConfig?.desktopImage?.trim() || bgConfig?.mobileImage?.trim() || (bgConfig?.mode === 'COLOR' && bgConfig?.bgColor));

  return (
    <div
      id="beranda"
      className="relative overflow-hidden bg-slate-950 text-white -mt-20 pt-28 pb-16 sm:pt-32 sm:pb-20 lg:pt-36 lg:pb-24 border-b border-slate-800 transition-colors duration-300"
      style={bgConfig?.mode === 'COLOR' && bgConfig.bgColor ? { backgroundColor: bgConfig.bgColor } : undefined}
    >
      {/* CUSTOM SECTION BACKGROUND (IMAGE / COLOR / OVERLAY) */}
      <SectionBackground config={bgConfig} />

      {/* BACKGROUND DECORATIVE SPORTS PITCH & GLOW (Only shown if no custom photo/color is set) */}
      {!hasCustomBg && (
        <>
          <div className="absolute inset-0 pointer-events-none opacity-20 pitch-lines"></div>
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-red-600/20 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute top-1/3 -right-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-red-900/15 rounded-full blur-3xl pointer-events-none"></div>
        </>
      )}

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* TOP PILL BADGE */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-red-950/80 via-slate-900/90 to-blue-950/80 border border-red-500/40 text-xs font-semibold text-red-300 shadow-lg shadow-red-950/40">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 [will-change:transform,opacity]"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <span className="tracking-wide uppercase">Pendaftaran Resmi Telah Dibuka</span>
            <span className="text-slate-500">•</span>
            <span className="text-white font-bold">Total Hadiah Rp {config.totalPrizePool.toLocaleString('id-ID')}</span>
          </div>
        </div>

        {/* MAIN HEADLINE */}
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-heading font-extrabold uppercase tracking-tight leading-[0.9] text-white">
            TURNAMEN<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-white to-blue-400">
              {config.name ? config.name.toUpperCase() : 'WABUP CUP'} {config.edition || ''}
            </span>
          </h1>

          <p className="mt-5 text-base sm:text-xl text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed">
            {config.tagline || 'Turnamen Futsal Perebutan Piala Wakil Bupati'}
            {categories.length > 0 && (
              <> dalam {categories.length} kategori: <strong className="text-white">{categories.map(c => c.name || c.id).join(', ')}</strong>.</>
            )}
          </p>

          {/* ACTION BUTTONS */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              id="hero-btn-register"
              onClick={handleRegisterClick}
              className="w-full sm:w-auto px-8 py-4 rounded-xl text-base font-bold text-white bg-gradient-to-r from-red-600 via-red-600 to-red-700 hover:from-red-500 hover:to-red-600 shadow-xl shadow-red-600/35 border border-red-400/40 transform active:scale-95 transition flex items-center justify-center space-x-2 cursor-pointer"
            >
              <span>Daftar Tim Sekarang</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            <a
              id="hero-btn-bracket"
              href="#bagan"
              className="w-full sm:w-auto px-8 py-4 rounded-xl text-base font-bold text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 transition flex items-center justify-center space-x-2"
            >
              <Trophy className="w-5 h-5 text-amber-400" />
              <span>Lihat Bagan & Jadwal</span>
            </a>

            <button
              id="hero-btn-check-status"
              onClick={onOpenCheckStatus}
              className="w-full sm:w-auto px-6 py-4 rounded-xl text-sm font-semibold text-slate-300 hover:text-white bg-slate-950/60 hover:bg-slate-900 border border-slate-800 transition flex items-center justify-center space-x-2"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Cek Status Berkas</span>
            </button>
          </div>
        </div>

        {/* COUNTDOWN TIMER BOX */}
        <div className="mt-12 max-w-2xl mx-auto bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/90 rounded-2xl p-5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-3 px-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Clock className="w-4 h-4 text-red-500" />
              <span>Hitung Mundur Menuju Kick-Off Perdana:</span>
            </span>
            <span className="text-xs font-bold text-red-400">
              {config.tournamentStartDate}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 sm:gap-4 text-center">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 sm:p-3">
              <span className="block text-2xl sm:text-4xl font-heading font-bold text-white">
                {String(timeLeft.days).padStart(2, '0')}
              </span>
              <span className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase">Hari</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 sm:p-3">
              <span className="block text-2xl sm:text-4xl font-heading font-bold text-red-500">
                {String(timeLeft.hours).padStart(2, '0')}
              </span>
              <span className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase">Jam</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 sm:p-3">
              <span className="block text-2xl sm:text-4xl font-heading font-bold text-white">
                {String(timeLeft.minutes).padStart(2, '0')}
              </span>
              <span className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase">Menit</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 sm:p-3">
              <span className="block text-2xl sm:text-4xl font-heading font-bold text-red-400">
                {String(timeLeft.seconds).padStart(2, '0')}
              </span>
              <span className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase">Detik</span>
            </div>
          </div>
        </div>

        {/* 4 STATS CARDS */}
        <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-5 flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-red-950/80 border border-red-700/50 flex items-center justify-center text-red-400 shrink-0">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <span className="block text-2xl sm:text-3xl font-heading font-bold text-white leading-none">
                {config.totalPrizePool >= 1000000
                  ? `Rp ${(config.totalPrizePool / 1000000).toLocaleString('id-ID')} JT`
                  : `Rp ${config.totalPrizePool.toLocaleString('id-ID')}`}
              </span>
              <p className="text-xs text-slate-400 font-medium mt-1">Total Hadiah Tunai</p>
            </div>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-5 flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-blue-950/80 border border-blue-700/50 flex items-center justify-center text-blue-400 shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <span className="block text-2xl sm:text-3xl font-heading font-bold text-white leading-none">
                {categories.length > 0 ? `${categories.length} KATEGORI` : 'KATEGORI'}
              </span>
              <p className="text-xs text-slate-400 font-medium mt-1 truncate" title={categories.map(c => c.id).join(', ')}>
                {categories.length > 0 ? categories.map(c => c.id).join(', ') : 'Sinkronisasi Database...'}
              </p>
            </div>
          </div>

          {/* <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-5 flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-950/80 border border-emerald-700/50 flex items-center justify-center text-emerald-400 shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <span className="block text-2xl sm:text-3xl font-heading font-bold text-white leading-none">
                {totalTeamsCount} TIM
              </span>
              <p className="text-xs text-slate-400 font-medium mt-1">{approvedTeamsCount} Tim Terverifikasi</p>
            </div>
          </div> */}

          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-5 flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-amber-950/80 border border-amber-700/50 flex items-center justify-center text-amber-400 shrink-0">
              <MapPin className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <span className="block text-2xl sm:text-3xl font-heading font-bold text-white leading-none truncate">
                VENUE
              </span>
              <p className="text-xs text-slate-400 font-medium mt-1 truncate" title={config.venueName}>{config.venueName}</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
