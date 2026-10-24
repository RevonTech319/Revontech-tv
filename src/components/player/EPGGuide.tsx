import { useEffect, useState, useMemo } from 'react';
import { Calendar, Clock, Tv, Play, Radio, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Program,
  fetchChannelEPG,
  formatProgramTime,
  isCurrentlyAiring,
  hasProgramEnded,
  hasEpgSupport,
} from '@/lib/epgService';

interface EPGGuideProps {
  channelId: string;
  channelName: string;
}

export default function EPGGuide({ channelId, channelName }: EPGGuideProps) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isExpanded, setIsExpanded] = useState(true);

  const supported = useMemo(() => hasEpgSupport(channelName), [channelName]);

  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      setLoading(true);
      try {
        const data = await fetchChannelEPG(channelId, channelName);
        if (!isCancelled) {
          setPrograms(data);
        }
      } catch (err) {
        console.warn('Failed loading EPG:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      isCancelled = true;
    };
  }, [channelId, channelName]);

  // Generate 5 days of tabs starting today
  const days = useMemo(() => {
    const list = [];
    const today = new Date();
    for (let i = 0; i < 5; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const label =
        i === 0
          ? 'Leo'
          : i === 1
          ? 'Kesho'
          : d.toLocaleDateString('sw-TZ', { weekday: 'short', day: 'numeric', month: 'short' });
      list.push({ date: iso, label });
    }
    return list;
  }, []);

  // Filter programs for the selected date
  const filteredPrograms = useMemo(() => {
    if (!programs.length) return [];
    const target = selectedDate;
    return programs
      .filter((p) => p.date === target)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [programs, selectedDate]);

  // Current live program
  const currentProgram = useMemo(() => {
    if (!programs.length) return null;
    return programs.find((p) => isCurrentlyAiring(p)) || null;
  }, [programs]);

  if (!supported && programs.length === 0 && !loading) {
    return null;
  }

  return (
    <div className="w-full bg-card/60 backdrop-blur-md rounded-2xl border border-white/10 p-4 sm:p-6 mb-6 shadow-xl transition-all">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-foreground">Ratiba ya Vipindi (EPG)</h3>
              {currentProgram && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  Live Sasa
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Vipindi vya {channelName} kwa siku ya leo na wiki hii</p>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
          title={isExpanded ? 'Funga Ratiba' : 'Fungua Ratiba'}
        >
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {isExpanded && (
        <>
          {/* Sasa Live Highlight Card */}
          {currentProgram && (
            <div className="mb-5 p-4 rounded-xl bg-gradient-to-r from-primary/15 via-purple-500/10 to-transparent border border-primary/30 relative overflow-hidden">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-rose-500/30">
                  <Radio className="w-5 h-5 text-white animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[11px] font-black uppercase tracking-wider text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">
                      Inayorushwa Sasa
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatProgramTime(currentProgram.startTime)} - {formatProgramTime(currentProgram.endTime)}
                    </span>
                    {currentProgram.category && (
                      <span className="text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                        {currentProgram.category}
                      </span>
                    )}
                  </div>
                  <h4 className="text-base font-bold text-foreground truncate">{currentProgram.title}</h4>
                  {currentProgram.description && currentProgram.description !== currentProgram.title && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                      {currentProgram.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Date Selector Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none">
            {days.map((day) => {
              const active = selectedDate === day.date;
              return (
                <button
                  key={day.date}
                  onClick={() => setSelectedDate(day.date)}
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25 scale-[1.02]'
                      : 'bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  {day.label}
                </button>
              );
            })}
          </div>

          {/* Program list */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-2" />
              <p className="text-xs">Inapakia ratiba ya vipindi...</p>
            </div>
          ) : filteredPrograms.length === 0 ? (
            <div className="text-center py-8 px-4 rounded-xl bg-white/5 border border-white/5">
              <Clock className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium text-foreground">Hakuna ratiba iliyopatikana kwa tarehe hii.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ratiba ya stesheni hii inasasishwa kiotomatiki kutoka kwenye mtandao rasmi.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {filteredPrograms.map((prog) => {
                const airing = isCurrentlyAiring(prog);
                const ended = hasProgramEnded(prog);

                return (
                  <div
                    key={prog.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                      airing
                        ? 'bg-primary/10 border-primary/40 shadow-sm'
                        : ended
                        ? 'bg-white/[0.02] border-white/5 opacity-55 hover:opacity-80'
                        : 'bg-white/5 border-white/5 hover:bg-white/[0.08]'
                    }`}
                  >
                    {/* Time block */}
                    <div className="flex-shrink-0 w-16 text-center pt-0.5">
                      <span className={`text-xs font-bold block ${airing ? 'text-primary' : 'text-foreground'}`}>
                        {formatProgramTime(prog.startTime)}
                      </span>
                      {prog.duration ? (
                        <span className="text-[10px] text-muted-foreground">{prog.duration} min</span>
                      ) : null}
                    </div>

                    {/* Middle details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h5
                          className={`text-sm font-semibold truncate ${
                            airing ? 'text-primary font-bold' : 'text-foreground'
                          }`}
                        >
                          {prog.title}
                        </h5>
                        {airing && (
                          <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-500 text-white uppercase animate-pulse">
                            LIVE
                          </span>
                        )}
                      </div>

                      {prog.description && prog.description !== prog.title && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mb-1">{prog.description}</p>
                      )}

                      <div className="flex items-center gap-2">
                        {prog.category && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-muted-foreground">
                            {prog.category}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {formatProgramTime(prog.startTime)} - {formatProgramTime(prog.endTime)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
