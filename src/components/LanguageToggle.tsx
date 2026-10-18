import { useTranslation } from '@/lib/i18n';
import { Globe } from 'lucide-react';

interface LanguageToggleProps {
  variant?: 'icon' | 'pill' | 'menu';
  className?: string;
}

/**
 * Compact language switcher. Cycles between Swahili (SW) and English (EN).
 * Persists the choice via localStorage in the i18n provider.
 *
 * Variants:
 * - "icon": circle icon button with a small SW/EN glyph (fits header)
 * - "pill": longer pill button showing "SW | EN" — better inside the menu
 * - "menu": stacked pair of buttons — for future menu contexts
 */
export default function LanguageToggle({ variant = 'icon', className = '' }: LanguageToggleProps) {
  const { lang, toggleLang, setLang, t } = useTranslation();

  if (variant === 'pill') {
    return (
      <button
        onClick={toggleLang}
        aria-label={t('language')}
        title={t('language')}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs font-black uppercase tracking-widest text-foreground press tap-safe ${className}`}
      >
        <Globe className="w-3.5 h-3.5 text-primary" />
        <span className={lang === 'sw' ? 'text-primary' : 'text-muted-foreground'}>SW</span>
        <span className="text-muted-foreground">|</span>
        <span className={lang === 'en' ? 'text-primary' : 'text-muted-foreground'}>EN</span>
      </button>
    );
  }

  if (variant === 'menu') {
    return (
      <div className={`flex gap-2 ${className}`}>
        {(['sw', 'en'] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest press tap-safe transition-colors ${
              lang === l
                ? 'bg-primary/20 text-primary border border-primary/40'
                : 'glass text-muted-foreground hover:text-foreground'
            }`}
          >
            {l === 'sw' ? 'Swahili' : 'English'}
          </button>
        ))}
      </div>
    );
  }

  // icon variant (default)
  return (
    <button
      onClick={toggleLang}
      aria-label={t('language')}
      title={t('language')}
      className={`relative p-2 rounded-full hover:bg-white/5 transition-colors text-foreground press tap-safe ${className}`}
    >
      <Globe className="w-5 h-5" />
      <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-black bg-primary text-primary-foreground px-1 py-px rounded-full leading-none uppercase">
        {lang === 'sw' ? 'SW' : 'EN'}
      </span>
    </button>
  );
}
