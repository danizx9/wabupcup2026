import React, { useState, useEffect } from 'react';
import { useTournament } from '../context/TournamentContext';
import { MatchItem, TournamentCategory } from '../types';
import { SectionBackground, getSectionTextClass } from './SectionBackground';
import {
  Trophy,
  Calendar,
  Layers,
  Flame,
  Clock,
  MapPin,
  CheckCircle,
  Activity,
  ArrowRight,
  Shield,
  Users,
  Search,
  UserCheck,
  Building,
  CheckCircle2,
  AlertCircle,
  Lock
} from 'lucide-react';

interface ScheduleBracketSectionProps {
  onOpenRegister?: (category: TournamentCategory) => void;
}

export const ScheduleBracketSection: React.FC<ScheduleBracketSectionProps> = ({
  onOpenRegister,
}) => {
  const { matches, categories, registrations, config, isInitialLoading } = useTournament();
  const [selectedCat, setSelectedCat] = useState<TournamentCategory>(() => categories[0]?.id || 'SMA');
  const [viewMode, setViewMode] = useState<'BRACKET' | 'TABLE' | 'TEAMS'>('BRACKET');
  const [teamSearchQuery, setTeamSearchQuery] = useState('');

  // Keep selected category synced if categories list changes from DB
  useEffect(() => {
    if (categories.length > 0 && !categories.some(c => c.id === selectedCat)) {
      setSelectedCat(categories[0].id);
    }
  }, [categories, selectedCat]);

  const catMatches = matches.filter(m => m.category === selectedCat);
  const catRegistrations = registrations.filter(r => r.category === selectedCat);

  const filteredTeams = catRegistrations.filter(t => {
    const q = teamSearchQuery.toLowerCase();
    return (
      t.teamName.toLowerCase().includes(q) ||
      t.institutionName.toLowerCase().includes(q) ||
      t.coachName.toLowerCase().includes(q) ||
      t.regCode.toLowerCase().includes(q)
    );
  });

  // Group matches by round for bracket representation strictly from database
  const round16Matches = catMatches.filter(m => m.round.includes('16 Besar'));
  const quarterMatches = catMatches.filter(m => m.round.includes('Perempat') || m.round.includes('8 Besar'));
  const semiMatches = catMatches.filter(m => m.round.includes('Semifinal'));
  const finalMatches = catMatches.filter(m => m.round.includes('Final') && !m.round.includes('Perempat') && !m.round.includes('Semi'));

  const displayQuarters = quarterMatches;
  const displaySemis = semiMatches;
  const displayFinals = finalMatches;

  const currentCatDetail = categories.find(c => c.id === selectedCat);
  const selectedCatCount = catRegistrations.length;
  const isSelectedCatFull = currentCatDetail ? selectedCatCount >= currentCatDetail.maxTeams : false;

  const bgConfig = config.sectionsBackgrounds?.bracket;
  const isCustomImage = bgConfig?.mode === 'IMAGE';
  const isCustomColor = bgConfig?.mode === 'COLOR';

  return (
    <section
      id="bagan"
      className={`py-16 relative overflow-hidden transition-colors duration-300 border-b border-slate-200 dark:border-slate-800 ${
        isCustomColor || isCustomImage ? '' : 'bg-slate-100/60 dark:bg-slate-900/40 text-slate-900 dark:text-white'
      }`}
      style={isCustomColor && bgConfig.bgColor ? { backgroundColor: bgConfig.bgColor } : undefined}
    >
      {/* Hidden Anchor for #tim */}
      <div id="tim" className="relative -top-24"></div>

      {/* CUSTOM SECTION BACKGROUND */}
      <SectionBackground config={bgConfig} />

      <div className={`relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${getSectionTextClass(bgConfig)}`}>
        
        {/* HEADER & CONTROLS */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-8 gap-6">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider mb-2">
              <Layers className="w-3.5 h-3.5" />
              <span>Sistem Bagan Knockout, Jadwal & Daftar Tim</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-heading font-bold uppercase tracking-tight text-slate-900 dark:text-white">
              BAGAN BRACKET & DAFTAR TIM
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              Bagan gugur otomatis diperbarui secara real-time dari database hasil pertandingan resmi.
            </p>
          </div>

          {/* VIEW SWITCHER TABS */}
          <div className="flex items-center space-x-2 overflow-x-auto">
            <div className="p-1 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex shadow-sm">
              <button
                onClick={() => setViewMode('BRACKET')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
                  viewMode === 'BRACKET'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Bagan Visual</span>
              </button>
              <button
                onClick={() => setViewMode('TABLE')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
                  viewMode === 'TABLE'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Tabel Jadwal ({catMatches.length})</span>
              </button>
              <button
                onClick={() => setViewMode('TEAMS')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
                  viewMode === 'TEAMS'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Daftar Tim Peserta ({catRegistrations.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* CATEGORY TABS */}
        {categories.length === 0 ? (
          <div className="flex items-center space-x-3 overflow-x-auto pb-4 mb-8 animate-pulse">
            <div className="h-10 w-32 bg-slate-200 dark:bg-slate-800 rounded-xl" />
            <div className="h-10 w-36 bg-slate-200 dark:bg-slate-800 rounded-xl" />
            <div className="h-10 w-32 bg-slate-200 dark:bg-slate-800 rounded-xl" />
          </div>
        ) : (
          <div className="flex items-center space-x-2 overflow-x-auto pb-4 mb-8 scrollbar-none border-b border-slate-200 dark:border-slate-800">
            {categories.map(cat => {
              const catKey = cat.id;
              const isSel = selectedCat === catKey;
              return (
                <button
                  key={catKey}
                  onClick={() => setSelectedCat(catKey)}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase transition shrink-0 flex items-center space-x-2 cursor-pointer ${
                    isSel
                      ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span>⚽ {cat.name || catKey}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* VIEW 1: INTERACTIVE TOURNAMENT BRACKET */}
        {viewMode === 'BRACKET' && (
          isInitialLoading && catMatches.length === 0 ? (
            <div className="bg-slate-950 rounded-2xl border border-slate-800 p-8 shadow-2xl text-white space-y-6">
              <div className="flex items-center justify-center space-x-2 text-xs text-slate-400">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
                </span>
                <span>Menyinkronkan bagan gugur & jadwal pertandingan dari database...</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
                {[1, 2, 3].map(col => (
                  <div key={col} className="space-y-4">
                    <div className="h-9 bg-slate-900 border border-slate-800 rounded-xl" />
                    {[1, 2].map(row => (
                      <div key={row} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                        <div className="h-3 w-16 bg-slate-800 rounded" />
                        <div className="h-5 bg-slate-800 rounded" />
                        <div className="h-5 bg-slate-800 rounded" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : catMatches.length === 0 ? (
            <div className="bg-slate-950 rounded-2xl border border-slate-800 p-10 sm:p-14 text-center shadow-2xl text-white space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-red-950/60 border border-red-800/60 text-red-400 flex items-center justify-center mx-auto text-2xl shadow-lg">
                <Layers className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-heading font-bold uppercase tracking-wider text-white">
                Bagan Pertandingan Kategori {selectedCat} Belum Dirilis
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
                Jadwal dan bagan pertandingan resmi untuk kategori <strong className="text-white">{selectedCat}</strong> akan ditampilkan secara otomatis setelah panitia melakukan proses undian (Drawing) di sistem CMS.
              </p>
              {onOpenRegister && (
                <div className="pt-2">
                  {isSelectedCatFull ? (
                    <button
                      disabled
                      className="px-6 py-2.5 rounded-xl bg-slate-800 text-slate-500 font-bold text-xs uppercase tracking-wider border border-slate-700 cursor-not-allowed flex items-center justify-center space-x-2 mx-auto"
                    >
                      <Lock className="w-4 h-4 text-amber-500" />
                      <span>Kuota Tim {selectedCat} Penuh (Ditutup)</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => onOpenRegister(selectedCat)}
                      className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-950/50 transition cursor-pointer"
                    >
                      Daftarkan Tim {selectedCat} Sekarang
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
          <div className="bg-slate-950 rounded-2xl border border-slate-800 p-6 lg:p-8 overflow-x-auto shadow-2xl text-white">
            <div className={`min-w-[${round16Matches.length > 0 ? '1200px' : '900px'}]`}>
              
              {/* ROUND HEADERS */}
              <div className={`grid ${round16Matches.length > 0 ? 'grid-cols-4' : 'grid-cols-3'} gap-6 mb-6 text-center`}>
                {round16Matches.length > 0 && (
                  <div className="py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 uppercase tracking-wider">
                    ⚡ Babak 16 Besar ({round16Matches.length} Match)
                  </div>
                )}
                <div className="py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  🏟️ Perempat Final ({displayQuarters.length} Match)
                </div>
                <div className="py-2 rounded-xl bg-blue-950/80 border border-blue-800/80 text-xs font-bold text-blue-300 uppercase tracking-wider">
                  🔥 Semifinal ({displaySemis.length} Match)
                </div>
                <div className="py-2 rounded-xl bg-red-950/80 border border-red-800/80 text-xs font-bold text-red-300 uppercase tracking-wider">
                  🏆 Grand Final ({displayFinals.length} Match)
                </div>
              </div>

              {/* BRACKET COLUMNS GRID */}
              <div className={`grid ${round16Matches.length > 0 ? 'grid-cols-4' : 'grid-cols-3'} gap-6 items-center`}>
                
                {/* COLUMN 0: 16 BESAR (IF APPLICABLE) */}
                {round16Matches.length > 0 && (
                  <div className="space-y-4">
                    {round16Matches.map((r16, i) => {
                      const isFinished = r16.status === 'FINISHED';
                      const isLive = r16.status === 'LIVE';
                      const winA = isFinished && r16.winnerId === 'A';
                      const winB = isFinished && r16.winnerId === 'B';

                      return (
                        <div
                          key={r16.id || i}
                          className={`bg-slate-900/90 border rounded-xl p-2.5 shadow-md transition ${
                            isLive ? 'border-red-500 shadow-red-950/50' : 'border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-slate-400 pb-1 border-b border-slate-800 mb-1.5">
                            <span className="font-semibold">{r16.round}</span>
                            {isLive ? (
                              <span className="text-red-400 font-bold animate-pulse">🔴 LIVE</span>
                            ) : isFinished ? (
                              <span className="text-emerald-400 font-bold">FT</span>
                            ) : (
                              <span>{r16.time || '08:00'} WIB</span>
                            )}
                          </div>

                          {/* Team A */}
                          <div className={`flex items-center justify-between py-1 px-2 rounded-lg mb-1 ${winA ? 'bg-emerald-950/60 border border-emerald-500/40 text-white font-bold' : 'bg-slate-950/60 text-slate-200'}`}>
                            <div className="flex items-center space-x-1.5 min-w-0 pr-1">
                              {r16.teamA.logo ? (
                                <img src={r16.teamA.logo} alt="" width="16" height="16" loading="lazy" decoding="async" className="w-4 h-4 object-contain shrink-0" />
                              ) : (
                                <span className="text-[10px]">🛡️</span>
                              )}
                              <span className="text-xs truncate max-w-[130px]">{r16.teamA.name}</span>
                            </div>
                            <div className="flex items-center space-x-1 shrink-0">
                              <span className="text-xs font-bold font-mono">{r16.teamA.score ?? '-'}</span>
                              {r16.teamA.penalties !== undefined && (
                                <span className="text-[9px] text-amber-400 font-mono">({r16.teamA.penalties})</span>
                              )}
                            </div>
                          </div>

                          {/* Team B */}
                          <div className={`flex items-center justify-between py-1 px-2 rounded-lg ${winB ? 'bg-emerald-950/60 border border-emerald-500/40 text-white font-bold' : 'bg-slate-950/60 text-slate-200'}`}>
                            <div className="flex items-center space-x-1.5 min-w-0 pr-1">
                              {r16.teamB.logo ? (
                                <img src={r16.teamB.logo} alt="" width="16" height="16" loading="lazy" decoding="async" className="w-4 h-4 object-contain shrink-0" />
                              ) : (
                                <span className="text-[10px]">⚽</span>
                              )}
                              <span className="text-xs truncate max-w-[130px]">{r16.teamB.name}</span>
                            </div>
                            <div className="flex items-center space-x-1 shrink-0">
                              <span className="text-xs font-bold font-mono">{r16.teamB.score ?? '-'}</span>
                              {r16.teamB.penalties !== undefined && (
                                <span className="text-[9px] text-amber-400 font-mono">({r16.teamB.penalties})</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* COLUMN 1: QUARTER FINALS */}
                <div className={round16Matches.length > 0 ? 'space-y-10' : 'space-y-6'}>
                  {displayQuarters.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-500">
                      Belum ada match perempat final
                    </div>
                  ) : (
                    displayQuarters.slice(0, 4).map((qf, i) => {
                      const isFinished = qf.status === 'FINISHED';
                      const isLive = qf.status === 'LIVE';
                      const winA = isFinished && qf.winnerId === 'A';
                      const winB = isFinished && qf.winnerId === 'B';

                      return (
                        <div
                          key={qf.id || i}
                          className={`bg-slate-900/90 border rounded-xl p-3 shadow-md transition ${
                            isLive ? 'border-red-500 shadow-red-950/50' : 'border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-slate-400 pb-1.5 border-b border-slate-800 mb-2">
                            <span className="font-semibold">{qf.round || `Perempat Final ${i + 1}`}</span>
                            {isLive ? (
                              <span className="text-red-400 font-bold animate-pulse">🔴 LIVE</span>
                            ) : isFinished ? (
                              <span className="text-emerald-400 font-bold">FT</span>
                            ) : (
                              <span>{qf.time || '09:00'} WIB</span>
                            )}
                          </div>

                          {/* Team A */}
                          <div className={`flex items-center justify-between py-1 px-2 rounded-lg mb-1 ${winA ? 'bg-emerald-950/60 border border-emerald-500/40 text-white font-bold' : 'bg-slate-950/60 text-slate-200'}`}>
                            <div className="flex items-center space-x-1.5 min-w-0 pr-1">
                              {qf.teamA.logo ? (
                                <img src={qf.teamA.logo} alt="" width="16" height="16" loading="lazy" decoding="async" className="w-4 h-4 object-contain shrink-0" />
                              ) : (
                                <span className="text-[10px]">🛡️</span>
                              )}
                              <span className="text-xs truncate max-w-[150px]">{qf.teamA.name}</span>
                            </div>
                            <div className="flex items-center space-x-1 shrink-0">
                              <span className="text-xs font-bold font-mono">{qf.teamA.score ?? '-'}</span>
                              {qf.teamA.penalties !== undefined && (
                                <span className="text-[9px] text-amber-400 font-mono">({qf.teamA.penalties})</span>
                              )}
                            </div>
                          </div>

                          {/* Team B */}
                          <div className={`flex items-center justify-between py-1 px-2 rounded-lg ${winB ? 'bg-emerald-950/60 border border-emerald-500/40 text-white font-bold' : 'bg-slate-950/60 text-slate-200'}`}>
                            <div className="flex items-center space-x-1.5 min-w-0 pr-1">
                              {qf.teamB.logo ? (
                                <img src={qf.teamB.logo} alt="" width="16" height="16" loading="lazy" decoding="async" className="w-4 h-4 object-contain shrink-0" />
                              ) : (
                                <span className="text-[10px]">⚽</span>
                              )}
                              <span className="text-xs truncate max-w-[150px]">{qf.teamB.name}</span>
                            </div>
                            <div className="flex items-center space-x-1 shrink-0">
                              <span className="text-xs font-bold font-mono">{qf.teamB.score ?? '-'}</span>
                              {qf.teamB.penalties !== undefined && (
                                <span className="text-[9px] text-amber-400 font-mono">({qf.teamB.penalties})</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* COLUMN 2: SEMIFINALS */}
                <div className={round16Matches.length > 0 ? 'space-y-24' : 'space-y-16'}>
                  {displaySemis.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-500">
                      Belum ada match semifinal
                    </div>
                  ) : (
                    displaySemis.slice(0, 2).map((sf, i) => {
                      const isLive = sf.status === 'LIVE';
                      const isFinished = sf.status === 'FINISHED';
                      const winA = isFinished && sf.winnerId === 'A';
                      const winB = isFinished && sf.winnerId === 'B';

                      return (
                        <div
                          key={sf.id || i}
                          className={`rounded-xl p-4 shadow-xl transition ${
                            isLive
                              ? 'bg-gradient-to-br from-slate-900 to-red-950 border-2 border-red-500'
                              : 'bg-slate-900/90 border border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] text-slate-400 pb-2 border-b border-slate-800 mb-2.5">
                            <span className="font-bold text-blue-400">{sf.round}</span>
                            {isLive ? (
                              <span className="text-red-400 font-bold animate-pulse">🔴 LIVE {sf.liveMinute}</span>
                            ) : isFinished ? (
                              <span className="text-emerald-400 font-bold">FT (Selesai)</span>
                            ) : (
                              <span>{sf.date}</span>
                            )}
                          </div>

                          {/* Team A */}
                          <div className={`flex items-center justify-between py-1.5 px-2.5 rounded-lg mb-1.5 ${winA ? 'bg-emerald-950/80 border border-emerald-500/50 text-white font-bold' : 'bg-slate-950/80 text-slate-200'}`}>
                            <div className="flex items-center space-x-2 min-w-0 pr-1">
                              {sf.teamA.logo ? (
                                <img src={sf.teamA.logo} alt="" width="20" height="20" loading="lazy" decoding="async" className="w-5 h-5 object-contain shrink-0" />
                              ) : (
                                <span>🛡️</span>
                              )}
                              <span className="text-xs font-bold truncate max-w-[150px]">
                                {sf.teamA.name}
                              </span>
                            </div>
                            <div className="flex items-center space-x-1.5 shrink-0">
                              <span className="text-sm font-bold font-mono text-red-400">
                                {sf.teamA.score ?? '-'}
                              </span>
                              {sf.teamA.penalties !== undefined && (
                                <span className="text-[10px] text-amber-400 font-mono">({sf.teamA.penalties})</span>
                              )}
                            </div>
                          </div>

                          {/* Team B */}
                          <div className={`flex items-center justify-between py-1.5 px-2.5 rounded-lg ${winB ? 'bg-emerald-950/80 border border-emerald-500/50 text-white font-bold' : 'bg-slate-950/80 text-slate-200'}`}>
                            <div className="flex items-center space-x-2 min-w-0 pr-1">
                              {sf.teamB.logo ? (
                                <img src={sf.teamB.logo} alt="" width="20" height="20" loading="lazy" decoding="async" className="w-5 h-5 object-contain shrink-0" />
                              ) : (
                                <span>⚽</span>
                              )}
                              <span className="text-xs font-bold truncate max-w-[150px]">
                                {sf.teamB.name}
                              </span>
                            </div>
                            <div className="flex items-center space-x-1.5 shrink-0">
                              <span className="text-sm font-bold font-mono text-blue-400">
                                {sf.teamB.score ?? '-'}
                              </span>
                              {sf.teamB.penalties !== undefined && (
                                <span className="text-[10px] text-amber-400 font-mono">({sf.teamB.penalties})</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* COLUMN 3: GRAND FINAL */}
                <div className="space-y-6">
                  {displayFinals.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-500">
                      Belum ada match final
                    </div>
                  ) : (
                    displayFinals.slice(0, 1).map((fn, i) => {
                      const isFinished = fn.status === 'FINISHED';
                      const winA = isFinished && fn.winnerId === 'A';
                      const winB = isFinished && fn.winnerId === 'B';

                      return (
                        <div
                          key={fn.id || i}
                          className="bg-gradient-to-b from-slate-900 via-red-950/50 to-slate-900 border-2 border-red-500/80 rounded-2xl p-5 shadow-2xl text-center relative overflow-hidden"
                        >
                          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-600 mx-auto flex items-center justify-center text-2xl shadow-lg shadow-amber-500/30 mb-3 animate-bounce">
                            🏆
                          </div>

                          <span className="text-xs font-extrabold uppercase tracking-widest text-amber-400 block mb-1">
                            PARTAI PUNCAK FINAL
                          </span>
                          <h4 className="text-base font-bold text-white mb-4">
                            Kategori {selectedCat} 2026
                          </h4>

                          <div className="space-y-2 text-left mb-4">
                            {/* Final Team A */}
                            <div className={`flex items-center justify-between p-2.5 rounded-xl border ${winA ? 'bg-amber-950/80 border-amber-400 text-amber-200 font-bold' : 'bg-slate-950/90 border-slate-800'}`}>
                              <div className="flex items-center space-x-2 min-w-0 pr-1">
                                {fn.teamA.logo ? (
                                  <img src={fn.teamA.logo} alt="" width="20" height="20" loading="lazy" decoding="async" className="w-5 h-5 object-contain shrink-0" />
                                ) : (
                                  <span>🛡️</span>
                                )}
                                <span className="text-xs font-bold truncate max-w-[140px]">{fn.teamA.name}</span>
                              </div>
                              <div className="flex items-center space-x-1.5 shrink-0">
                                <span className="text-sm font-bold text-amber-400">{fn.teamA.score ?? '-'}</span>
                                {fn.teamA.penalties !== undefined && (
                                  <span className="text-[10px] text-amber-300 font-mono">({fn.teamA.penalties})</span>
                                )}
                                {winA && <span className="text-xs">👑 Juara 1</span>}
                              </div>
                            </div>

                            {/* Final Team B */}
                            <div className={`flex items-center justify-between p-2.5 rounded-xl border ${winB ? 'bg-amber-950/80 border-amber-400 text-amber-200 font-bold' : 'bg-slate-950/90 border-slate-800'}`}>
                              <div className="flex items-center space-x-2 min-w-0 pr-1">
                                {fn.teamB.logo ? (
                                  <img src={fn.teamB.logo} alt="" width="20" height="20" loading="lazy" decoding="async" className="w-5 h-5 object-contain shrink-0" />
                                ) : (
                                  <span>⚽</span>
                                )}
                                <span className="text-xs font-bold truncate max-w-[140px]">{fn.teamB.name}</span>
                              </div>
                              <div className="flex items-center space-x-1.5 shrink-0">
                                <span className="text-sm font-bold text-amber-400">{fn.teamB.score ?? '-'}</span>
                                {fn.teamB.penalties !== undefined && (
                                  <span className="text-[10px] text-amber-300 font-mono">({fn.teamB.penalties})</span>
                                )}
                                {winB && <span className="text-xs">👑 Juara 1</span>}
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-center space-x-1">
                            <MapPin className="w-3.5 h-3.5 text-red-500" />
                            <span>{fn.pitch || config.venueName}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

              </div>

            </div>
          </div>
        ))}

        {/* VIEW 2: FULL SCHEDULE TABLE */}
        {viewMode === 'TABLE' && (
          <div className="bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3.5 px-4">No.</th>
                    <th className="py-3.5 px-4">Babak</th>
                    <th className="py-3.5 px-4">Pertandingan (Tim A vs Tim B)</th>
                    <th className="py-3.5 px-4">Tanggal & Waktu</th>
                    <th className="py-3.5 px-4">Venue Lapangan</th>
                    <th className="py-3.5 px-4">Skor / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {catMatches.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        Belum ada jadwal tersimpan untuk kategori {selectedCat}. Anda dapat menggunakan fitur Drawing Acak Otomatis di CMS Admin.
                      </td>
                    </tr>
                  ) : (
                    catMatches.map((m, idx) => (
                      <tr
                        key={m.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-900/60 transition"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-slate-500">
                          #{idx + 1}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                          {m.round}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {m.teamA.name} <span className="text-red-500 font-normal">vs</span> {m.teamB.name}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {m.teamA.institution || '-'} vs {m.teamB.institution || '-'}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-700 dark:text-slate-300">
                          {m.date} • <strong className="text-red-600 dark:text-red-400">{m.time} WIB</strong>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {m.pitch}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {m.status === 'LIVE' && (
                            <span className="px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 font-bold border border-red-300 dark:border-red-800 animate-pulse">
                              LIVE {m.teamA.score ?? 0} - {m.teamB.score ?? 0} ({m.liveMinute})
                            </span>
                          )}
                          {m.status === 'FINISHED' && (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-800">
                              FT {m.teamA.score ?? 0} - {m.teamB.score ?? 0}
                            </span>
                          )}
                          {m.status === 'UPCOMING' && (
                            <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-800">
                              Akan Datang
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW 3: DAFTAR TIM PESERTA DIRECTORY */}
        {viewMode === 'TEAMS' && (
          <div className="space-y-6">
            {/* SEARCH & SUMMARY BAR */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={teamSearchQuery}
                  onChange={e => setTeamSearchQuery(e.target.value)}
                  placeholder={`Cari tim ${selectedCat}, sekolah, atau pelatih...`}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex items-center space-x-3 text-xs w-full sm:w-auto justify-between sm:justify-end">
                <span className="text-slate-500 dark:text-slate-400">
                  Total Terdaftar: <strong className="text-slate-900 dark:text-white">{selectedCatCount} Tim</strong> ({currentCatDetail?.maxTeams || 16} Maksimal)
                </span>
                {onOpenRegister && (
                  isSelectedCatFull ? (
                    <span className="px-3 py-1.5 rounded-lg bg-red-950/80 text-red-300 border border-red-500/30 text-[11px] font-bold tracking-wider uppercase flex items-center space-x-1.5 shrink-0">
                      <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Kuota Penuh</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => onOpenRegister(selectedCat)}
                      className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-wider transition flex items-center space-x-1.5 shadow-sm cursor-pointer shrink-0"
                    >
                      <span>+ Daftarkan Tim {selectedCat}</span>
                    </button>
                  )
                )}
              </div>
            </div>

            {/* TEAMS GRID */}
            {filteredTeams.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-8">
                <Users className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-60" />
                <h4 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                  Belum Ada Tim Ditemukan
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
                  {teamSearchQuery
                    ? `Tidak ada tim yang cocok dengan pencarian "${teamSearchQuery}".`
                    : `Belum ada tim yang mendaftar pada kategori ${selectedCat}.`}
                </p>
                {onOpenRegister && (
                  isSelectedCatFull ? (
                    <span className="px-4 py-2 rounded-xl bg-red-950/80 text-red-300 border border-red-500/30 text-xs font-bold uppercase inline-flex items-center space-x-2">
                      <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Kuota Kategori {selectedCat} Telah Penuh</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => onOpenRegister(selectedCat)}
                      className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition cursor-pointer"
                    >
                      Jadilah Tim Pertama yang Mendaftar
                    </button>
                  )
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTeams.map(team => {
                  const isApproved = team.status === 'APPROVED';
                  const isPending = team.status === 'PENDING_PAYMENT';
                  const isRejected = team.status === 'REJECTED';

                  return (
                    <div
                      key={team.id}
                      className="p-5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        {/* TOP BADGE */}
                        <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
                          <span className="font-mono font-bold text-[10px] text-slate-500 dark:text-slate-400">
                            {team.regCode}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[10px] border ${
                              isApproved
                                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                : isPending
                                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                                : 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800'
                            }`}
                          >
                            {isApproved ? '✓ Disetujui (Approved)' : isPending ? 'Menunggu Pembayaran' : 'Perlu Revisi / Ditolak'}
                          </span>
                        </div>

                        {/* TEAM DETAILS */}
                        <div className="flex items-start space-x-3 mb-3">
                          <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center overflow-hidden shrink-0 p-1">
                            {team.teamLogo ? (
                              <img
                                src={team.teamLogo}
                                alt={`Logo ${team.teamName}`}
                                width="44"
                                height="44"
                                loading="lazy"
                                decoding="async"
                                className="max-h-full max-w-full object-contain"
                              />
                            ) : (
                              <span className="text-xl">🛡️</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-base text-slate-900 dark:text-white leading-tight truncate">
                              {team.teamName}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-1 mt-0.5 truncate">
                              <Building className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{team.institutionName}</span>
                            </p>
                          </div>
                        </div>

                        <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Official / Pelatih:</span>
                            <span className="font-semibold text-slate-900 dark:text-white">{team.coachName}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Jumlah Skuad:</span>
                            <span className="font-semibold text-slate-900 dark:text-white">{team.playerCount} Pemain ({team.officialCount} Official)</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Tgl Registrasi:</span>
                            <span className="font-mono text-[11px]">{team.registrationDate}</span>
                          </div>
                        </div>
                      </div>

                      {/* BOTTOM STATUS INDICATOR */}
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">Status Pembayaran:</span>
                        <span
                          className={`font-bold ${
                            team.paymentStatus === 'PAID'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {team.paymentStatus === 'PAID' ? 'LUNAS (Verified)' : 'BELUM BAYAR'}
                        </span>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}

      </div>
    </section>
  );
};
