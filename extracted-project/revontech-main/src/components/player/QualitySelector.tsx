import { Check } from 'lucide-react';

export interface QualityOption {
  label: string;   // e.g. "Auto", "1080p", "720p"
  value: number;   // -1 for auto, else the level/track height
  isAuto?: boolean;
}

interface QualitySelectorProps {
  options: QualityOption[];
  current: number;
  onSelect: (opt: QualityOption) => void;
}

/**
 * Renders a list of video quality options (Auto + specific resolutions).
 * The parent player wires selection back into Shaka/Hls.js.
 *
 * If only "Auto" is available (or the list is empty), we still render it
 * so users know their stream is adaptive.
 */
export default function QualitySelector({ options, current, onSelect }: QualitySelectorProps) {
  if (options.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] text-muted-foreground font-bold mb-2 uppercase">
        Ubora wa Video
      </p>
      <div className="space-y-1">
        {options.map((opt) => {
          const selected = current === opt.value;
          return (
            <button
              key={`${opt.value}-${opt.label}`}
              type="button"
              onClick={() => onSelect(opt)}
              className={`flex items-center justify-between w-full p-2 rounded-lg text-xs font-bold press tap-safe transition-colors ${
                selected ? 'bg-primary/20 text-primary' : 'hover:bg-white/5 text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                {opt.label}
                {opt.isAuto && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-primary/20 text-primary uppercase tracking-wider">
                    ABR
                  </span>
                )}
              </span>
              {selected && <Check className="w-3.5 h-3.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
