import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

export type Lang = 'sw' | 'en';

/**
 * Central translation dictionary. Add new keys here as you internationalize
 * more UI. Swahili is the primary language; English is the fallback/toggle.
 * If a key is missing in a language, it falls back to Swahili, then to the key.
 */
const dict: Record<string, Record<Lang, string>> = {
  // Nav & menu
  home: { sw: 'Nyumbani', en: 'Home' },
  live_matches: { sw: 'Mechi za Live', en: 'Live Matches' },
  view_packages: { sw: 'Angalia Vifurushi', en: 'View Packages' },
  movies: { sw: 'Movies', en: 'Movies' },
  notifications: { sw: 'Arifa', en: 'Notifications' },
  pay: { sw: 'Lipia', en: 'Subscribe' },
  profile: { sw: 'Profile', en: 'Profile' },
  about: { sw: 'Kuhusu Sisi', en: 'About Us' },
  download_app: { sw: 'Pakua App Yetu', en: 'Download Our App' },
  follow_us: { sw: 'Fuata Sisi', en: 'Follow Us' },
  login: { sw: 'Ingia', en: 'Login' },
  logout: { sw: 'Toka', en: 'Logout' },

  // Header actions
  search: { sw: 'Tafuta', en: 'Search' },
  search_channels: { sw: 'Tafuta kituo...', en: 'Search channels...' },
  close_search: { sw: 'Funga tafuta', en: 'Close search' },
  open_menu: { sw: 'Fungua menu', en: 'Open menu' },
  close_menu: { sw: 'Funga menu', en: 'Close menu' },
  language: { sw: 'Lugha', en: 'Language' },

  // Homepage
  all_channels: { sw: 'All Channels', en: 'All Channels' },
  search_results: { sw: 'Matokeo ya Utafutaji', en: 'Search Results' },
  results_for: { sw: 'Matokeo', en: 'Results' },
  clear: { sw: 'Futa', en: 'Clear' },
  no_channels: { sw: 'Hakuna vituo bado', en: 'No channels yet' },
  watch_now: { sw: 'Tazama Sasa', en: 'Watch Now' },
  new_movies: { sw: 'Movies Mpya', en: 'New Movies' },
  new_movies_desc: {
    sw: 'Filamu zilizotafsiriwa Kiswahili · Bonyeza kuangalia',
    en: 'Fresh movies · Tap to watch',
  },
  open: { sw: 'FUNGUA', en: 'OPEN' },

  // Player
  back: { sw: 'Rudi Nyuma', en: 'Back' },
  live: { sw: 'LIVE', en: 'LIVE' },
  free: { sw: 'FREE', en: 'FREE' },
  pair_tv: { sw: 'Unganisha na TV', en: 'Pair with TV' },
  pair_tv_desc: {
    sw: 'Onesha kwenye TV yako kupitia Chromecast',
    en: 'Show on your TV via Chromecast',
  },
  pair_tv_fail: {
    sw: 'Kituo hiki hakiwezi kuonekana kwenye TV kwa sasa. Jaribu kituo kingine.',
    en: 'This channel cannot be shown on TV right now. Try another channel.',
  },
  player_settings: { sw: 'Mipangilio ya Player', en: 'Player Settings' },
  video_quality: { sw: 'Ubora wa Video', en: 'Video Quality' },
  audio_language: { sw: 'Lugha ya Sauti', en: 'Audio Language' },
  subtitles: { sw: 'Manukuu', en: 'Subtitles' },
  off: { sw: 'OFF', en: 'OFF' },
  default_audio: { sw: 'Default', en: 'Default' },
  auto: { sw: 'Auto', en: 'Auto' },
  fullscreen: { sw: 'Fullscreen', en: 'Fullscreen' },
  exit_fullscreen: { sw: 'Toka fullscreen', en: 'Exit fullscreen' },
  mute: { sw: 'Zima sauti', en: 'Mute' },
  unmute: { sw: 'Fungua sauti', en: 'Unmute' },
  play: { sw: 'Cheza', en: 'Play' },
  pause: { sw: 'Simamisha', en: 'Pause' },
  volume: { sw: 'Sauti', en: 'Volume' },
  paused: { sw: 'Imesimamishwa', en: 'Paused' },
  tap_to_play: { sw: 'Bonyeza kuanza', en: 'Tap to play' },
  trial_ended_title: { sw: 'Muda wa Majaribio Umeisha', en: 'Trial Time Ended' },
  trial_ended_desc: {
    sw: 'Kituo hiki ni cha kulipia. Jiunge sasa ili upate access ya vipindi vyote bila kikomo.',
    en: 'This channel is premium. Subscribe now for unlimited access to all channels.',
  },
  signup_first: { sw: 'Jisajili / Ingia Kwanza', en: 'Sign up / Login First' },
  pay_now: { sw: 'LIPIA SASA', en: 'PAY NOW' },
  other_channels: { sw: 'Vituo Vingine', en: 'Other Channels' },
  schedule: { sw: 'Ratiba', en: 'Schedule' },

  // Notifications page
  your_notifications: { sw: 'Arifa Zako', en: 'Your Notifications' },
  read_all: { sw: 'Soma Zote', en: 'Mark All Read' },
  delete_all: { sw: 'Futa Zote', en: 'Delete All' },
  no_notifications: { sw: 'Hakuna Arifa', en: 'No Notifications' },
  no_notifications_desc: {
    sw: 'Hujapokea arifa yoyote kwa sasa.',
    en: "You haven't received any notifications yet.",
  },
  unread: { sw: 'Haija-somwa', en: 'Unread' },

  // Payment
  choose_plan: { sw: 'Chagua Kifurushi', en: 'Choose a Plan' },
  choose_plan_desc: {
    sw: 'Furahia burudani bila kikwazo — chagua kifurushi kinachokufaa.',
    en: 'Enjoy uninterrupted entertainment — pick a plan that fits.',
  },
  continue_to_pay: { sw: 'ENDELEA KULIPIA', en: 'CONTINUE TO PAY' },
  signup_first_btn: { sw: 'JISAJILI KWANZA', en: 'REGISTER FIRST' },
  popular: { sw: 'POPULAR', en: 'POPULAR' },
  payment_successful: { sw: 'Malipo Yamefanikiwa!', en: 'Payment Successful!' },
  start_watching: { sw: 'ANZA KUANGALIA', en: 'START WATCHING' },
  payment_failed: { sw: 'Malipo Yameshindwa', en: 'Payment Failed' },
  payment_failed_desc: {
    sw: 'Kuna tatizo la kupokea malipo yako. Tafadhali jaribu tena au wasiliana na support.',
    en: 'There was a problem processing your payment. Please try again or contact support.',
  },
  try_again: { sw: 'JARIBU TENA', en: 'TRY AGAIN' },
  complete_payment: { sw: 'Kamilisha Malipo', en: 'Complete Payment' },
  complete_payment_desc: {
    sw: 'Tafadhali angalia simu yako na uweke PIN kuthibitisha malipo.',
    en: 'Check your phone and enter your PIN to confirm the payment.',
  },
  package: { sw: 'Kifurushi', en: 'Package' },
  amount: { sw: 'Kiasi', en: 'Amount' },
  phone_number: { sw: 'Namba ya Simu', en: 'Phone Number' },
  enter_phone: { sw: 'Ingiza Namba ya Malipo', en: 'Enter Payment Phone' },
  processing: { sw: 'Inaprocess...', en: 'Processing...' },

  // Common
  loading: { sw: 'Inapakia...', en: 'Loading...' },
  save: { sw: 'Hifadhi', en: 'Save' },
  cancel: { sw: 'Ghairi', en: 'Cancel' },
  yes: { sw: 'Ndiyo', en: 'Yes' },
  no: { sw: 'Hapana', en: 'No' },
  chat_support: { sw: 'Ongea na Support', en: 'Chat with Support' },
};

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<I18nCtx | null>(null);

const STORAGE_KEY = 'revontech.lang';

/**
 * Resolves the initial language: localStorage → browser locale → 'sw' default.
 */
function detectInitialLang(): Lang {
  if (typeof window === 'undefined') return 'sw';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'sw') return stored;
  } catch {
    // ignore storage errors
  }
  const nav = window.navigator.language?.toLowerCase() || '';
  if (nav.startsWith('en')) return 'en';
  return 'sw';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
    // Also reflect on <html lang="..."> for a11y & SEO
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const value = useMemo<I18nCtx>(
    () => ({
      lang,
      setLang: setLangState,
      toggleLang: () => setLangState((prev) => (prev === 'sw' ? 'en' : 'sw')),
      t: (key: string, fallback?: string) => {
        const entry = dict[key];
        if (!entry) return fallback ?? key;
        return entry[lang] || entry.sw || fallback || key;
      },
    }),
    [lang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation(): I18nCtx {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Safe fallback when used outside provider — returns Swahili
    return {
      lang: 'sw',
      setLang: () => {},
      toggleLang: () => {},
      t: (key: string, fallback?: string) => dict[key]?.sw || fallback || key,
    };
  }
  return ctx;
}
