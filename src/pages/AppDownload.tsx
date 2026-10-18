import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { 
  Star, 
  Download, 
  ArrowLeft, 
  Tv, 
  Trophy, 
  CreditCard, 
  Shield, 
  CheckCircle2, 
  Share2, 
  Info, 
  ChevronRight, 
  ThumbsUp 
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface SettingsData {
  app_description?: string;
  app_size?: string;
  app_downloads_count?: string;
  app_rating?: string;
  app_reviews_count?: string;
  latest_version_name?: string;
  update_notes?: string;
  update_url?: string;
  app_download_url?: string;
  app_previews?: string[];
}

export default function AppDownload() {
  const [settings, setSettings] = useState<SettingsData>({
    app_description: "Pata burudani ya vipindi vya TV, Mpira wa miguu LIVE, na filamu kwa Kiswahili na Kiingereza popote ulipo na Revontech TV.",
    app_size: "15 MB",
    app_downloads_count: "50K+",
    app_rating: "4.9",
    app_reviews_count: "1,250",
    latest_version_name: "1.1.0",
    update_notes: "Maboresho makubwa ya kicheza video, kuongeza chaneli mpya, na kurekebisha huduma ya push notifications kupitia OneSignal.",
    update_url: "/RevonTV_release.apk",
    app_download_url: "",
    app_previews: []
  });
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'general_settings');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as SettingsData;
          setSettings(prev => ({
            ...prev,
            ...data
          }));
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: "Pakua Revontech TV",
        text: "Pata burudani ya vipindi vya TV na Mpira wa miguu LIVE kwenye simu yako!",
        url: window.location.href,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Kiungo Kimekopwa",
        description: "Kiungo cha kupakua kimekopwa kwenye ubao wako wa kunakili.",
        className: "bg-green-500 text-white font-bold"
      });
    }
  };

  const downloadApk = () => {
    if (downloading) return;
    setDownloading(true);

    const url = settings.app_download_url || settings.update_url || "/RevonTV_release.apk";

    toast({
      title: "Upakuaji Umeanza",
      description: "Faili la APK linaanza kupakuliwa sasa hivi...",
      className: "bg-green-500 text-white font-bold"
    });

    // Use a hidden anchor for a clean, smooth browser download
    const link = document.createElement("a");
    link.href = url;
    link.download = "Revontech_TV.apk";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Reset button state after a short delay
    setTimeout(() => setDownloading(false), 2500);
  };

  // Convert appRating to number for calculations
  const ratingVal = parseFloat(settings.app_rating || "4.9") || 4.9;

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans pb-16 selection:bg-[#00E676]/30 selection:text-white">
      {/* Top Google Play Replica Header */}
      <header className="sticky top-0 z-50 bg-[#0F172A]/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/" className="p-1.5 rounded-full hover:bg-slate-800/60 transition-colors text-slate-400 hover:text-slate-100">
            <ArrowLeft className="w-5 h-5" />
          </a>
          <div className="flex items-center gap-1.5 select-none">
            <img src="/logo.jpg" alt="Revontech" className="w-6 h-6 rounded-md object-cover" />
            <span className="font-semibold text-base tracking-wide text-slate-200">Revontech app</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleShare}
            className="p-2 rounded-full hover:bg-slate-800/60 transition-colors text-slate-400 hover:text-slate-100"
            title="Shiriki"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-2xl mx-auto px-4 pt-6 space-y-8">
        
        {/* App Meta Section */}
        <section className="flex gap-5 items-start">
          {/* App Logo */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-[22%] overflow-hidden shadow-xl border border-slate-800/80 bg-slate-900 flex-shrink-0">
            <img 
              src="/logo.jpg" 
              alt="Revontech TV Logo" 
              className="w-full h-full object-cover select-none"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/placeholder.svg";
              }}
            />
          </div>

          {/* App Branding Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-1">
              Revontech Tv
            </h1>
            <p className="text-[#00E676] font-medium text-sm sm:text-base mb-1 hover:underline cursor-pointer">
              Revontech Devs
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 mb-3">
              <span>Inajumuisha Matangazo</span>
              <span className="w-1 h-1 rounded-full bg-slate-600" />
              <span>Ununuzi wa ndani ya programu</span>
            </div>
            
            {/* Install Button for Desktop / Larger Screens */}
            <div className="hidden sm:block">
              <button 
                onClick={downloadApk}
                disabled={downloading}
                className={`text-white px-8 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-md shadow-[#01875f]/10 flex items-center gap-2 ${
                  downloading 
                    ? "bg-[#01704f] cursor-wait" 
                    : "bg-[#01875f] hover:bg-[#01704f] active:bg-[#015c41]"
                }`}
              >
                {downloading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                    Downloading...
                  </>
                ) : "Download app"}
              </button>
            </div>
          </div>
        </section>

        {/* Mobile Install Button */}
        <section className="block sm:hidden">
          <button 
            onClick={downloadApk}
            disabled={downloading}
            className={`w-full text-white py-3 rounded-lg font-bold text-sm transition-all shadow-md shadow-[#01875f]/10 flex items-center justify-center gap-2 ${
              downloading 
                ? "bg-[#01704f] cursor-wait" 
                : "bg-[#01875f] hover:bg-[#01704f] active:bg-[#015c41]"
            }`}
          >
            {downloading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                Downloading...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download app
              </>
            )}
          </button>
        </section>

        {/* Quick Stats Grid */}
        <section className="grid grid-cols-4 border-y border-slate-800/60 py-4 text-center select-none overflow-x-auto gap-2">
          {/* Rating */}
          <div className="min-w-[70px] flex flex-col items-center">
            <span className="text-sm font-bold text-white flex items-center gap-0.5">
              {settings.app_rating} <Star className="w-3.5 h-3.5 fill-current text-white" />
            </span>
            <span className="text-[10px] text-slate-400 mt-1 truncate max-w-full">
              Ukaguzi {settings.app_reviews_count}
            </span>
          </div>

          {/* Vertical Divider */}
          <div className="w-px bg-slate-800 self-stretch my-1" />

          {/* Size */}
          <div className="min-w-[70px] flex flex-col items-center">
            <span className="text-sm font-bold text-white flex items-center gap-0.5 justify-center">
              <Download className="w-3.5 h-3.5 text-slate-400" /> {settings.app_size}
            </span>
            <span className="text-[10px] text-slate-400 mt-1">Ukubwa wa faili</span>
          </div>

          {/* Vertical Divider */}
          <div className="w-px bg-slate-800 self-stretch my-1" />

          {/* Downloads */}
          <div className="min-w-[70px] flex flex-col items-center">
            <span className="text-sm font-bold text-white">
              {settings.app_downloads_count}
            </span>
            <span className="text-[10px] text-slate-400 mt-1">Vipakuzi</span>
          </div>

          {/* Vertical Divider */}
          <div className="w-px bg-slate-800 self-stretch my-1" />

          {/* Content Rating */}
          <div className="min-w-[70px] flex flex-col items-center">
            <span className="text-xs font-black bg-slate-800 border border-slate-700 w-5 h-5 rounded flex items-center justify-center text-slate-300">
              12+
            </span>
            <span className="text-[10px] text-slate-400 mt-1">Inamfaa Kila Mtu</span>
          </div>
        </section>

        {/* Security / Verified Badge */}
        <section className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-3.5 flex items-center gap-3.5 shadow-sm">
          <Shield className="w-6 h-6 text-[#00E676] flex-shrink-0" />
          <div className="text-xs">
            <p className="font-bold text-slate-200">Imethibitishwa na Play Protect</p>
            <p className="text-slate-400 mt-0.5">Programu hii imekaguliwa kikamilifu. Haina virusi na iko salama kabisa kusakinishwa.</p>
          </div>
        </section>

        {/* Phone Screen Mockups Carousel */}
        {settings.app_previews && settings.app_previews.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white tracking-wide">Picha za Skrini (Screenshots)</h2>
            <div className="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x scrollbar-thin scrollbar-thumb-slate-800">
              {settings.app_previews.map((url, idx) => (
                <div key={idx} className="snap-start flex-shrink-0 w-[200px] h-[360px] bg-slate-950 border-4 border-slate-800 rounded-[28px] overflow-hidden relative shadow-lg flex flex-col">
                  {/* Notch */}
                  <div className="absolute top-1 left-1/2 transform -translate-x-1/2 w-16 h-3 bg-slate-800 rounded-full z-20 flex items-center justify-around px-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                    <div className="w-2.5 h-1 bg-slate-900 rounded-full" />
                  </div>
                  {/* Screen Top Bar */}
                  <div className="h-6 bg-slate-900/80 flex items-center justify-between px-4 pt-1.5 z-10 text-[8px] text-slate-400">
                    <span>12:30</span>
                    <div className="flex items-center gap-1">
                      <div className="w-2.5 h-1.5 border border-slate-400 rounded-sm flex items-center p-px"><div className="w-full h-full bg-slate-400" /></div>
                    </div>
                  </div>
                  {/* Image Content */}
                  <div className="flex-1 w-full h-full relative bg-slate-900">
                    <img 
                      src={url} 
                      alt={`Preview ${idx + 1}`} 
                      className="w-full h-full object-cover" 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/placeholder.svg";
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* About App / Kuhusu Programu Hii */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white tracking-wide">Kuhusu programu hii</h2>
            <button className="text-[#00E676] hover:text-[#00c853] transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            {settings.app_description}
          </p>
          <div className="flex gap-2 flex-wrap pt-2">
            <span className="bg-slate-800/80 border border-slate-700/50 text-slate-300 text-xs px-3.5 py-1.5 rounded-full font-medium">
              Burudani
            </span>
            <span className="bg-slate-800/80 border border-slate-700/50 text-slate-300 text-xs px-3.5 py-1.5 rounded-full font-medium">
              TV na Filamu
            </span>
            <span className="bg-slate-800/80 border border-slate-700/50 text-slate-300 text-xs px-3.5 py-1.5 rounded-full font-medium">
              Michezo ya Moja kwa Moja
            </span>
          </div>
        </section>

        {/* What's New / Yaliyomo Mapya */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white tracking-wide">Yaliyomo mapya</h2>
          <div className="bg-slate-900/35 border border-slate-800/60 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#00E676] bg-[#00E676]/10 px-2 py-0.5 rounded border border-[#00E676]/20">
                Toleo {settings.latest_version_name}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              {settings.update_notes}
            </p>
          </div>
        </section>

        {/* Ratings and Reviews Breakdown */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white tracking-wide">Ukadiriaji na maoni</h2>
          
          <div className="flex gap-6 items-center">
            {/* Average Rating Large Display */}
            <div className="flex flex-col items-center">
              <span className="text-5xl font-extrabold text-white font-sans">{settings.app_rating}</span>
              <div className="flex gap-0.5 mt-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star 
                    key={star} 
                    className={`w-3.5 h-3.5 ${
                      star <= Math.round(ratingVal) 
                        ? "fill-current text-[#00E676]" 
                        : "text-slate-700 fill-slate-800"
                    }`} 
                  />
                ))}
              </div>
              <span className="text-[10px] text-slate-400 mt-2 font-sans">{settings.app_reviews_count} jumla ya kura</span>
            </div>

            {/* Progress Bars Breakdown */}
            <div className="flex-1 space-y-1.5 font-sans">
              {/* Row 5 Star */}
              <div className="flex items-center gap-2.5 text-[10px]">
                <span className="w-1 text-slate-400 font-bold">5</span>
                <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-[#00E676] h-full w-[90%] rounded-full" />
                </div>
              </div>
              {/* Row 4 Star */}
              <div className="flex items-center gap-2.5 text-[10px]">
                <span className="w-1 text-slate-400 font-bold">4</span>
                <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-[#00E676] h-full w-[7%] rounded-full" />
                </div>
              </div>
              {/* Row 3 Star */}
              <div className="flex items-center gap-2.5 text-[10px]">
                <span className="w-1 text-slate-400 font-bold">3</span>
                <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-[#00E676] h-full w-[2%] rounded-full" />
                </div>
              </div>
              {/* Row 2 Star */}
              <div className="flex items-center gap-2.5 text-[10px]">
                <span className="w-1 text-slate-400 font-bold">2</span>
                <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-[#00E676] h-full w-[0.5%] rounded-full" />
                </div>
              </div>
              {/* Row 1 Star */}
              <div className="flex items-center gap-2.5 text-[10px]">
                <span className="w-1 text-slate-400 font-bold">1</span>
                <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-[#00E676] h-full w-[0.5%] rounded-full" />
                </div>
              </div>
            </div>
          </div>

          {/* User Swahili Reviews */}
          <div className="space-y-4 pt-3 border-t border-slate-800/60">
            {/* Review 1 */}
            <div className="bg-slate-900/20 border border-slate-850 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-cyan-600/30 flex items-center justify-center font-bold text-xs text-cyan-400">
                    JR
                  </div>
                  <span className="text-xs font-bold text-slate-200">Juma Ramadhani</span>
                </div>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="w-2.5 h-2.5 fill-current text-[#00E676]" />
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                App nzuri sana! Natazama mpira LIVE bila shida yoyote. Malipo ya vifurushi ni rahisi mno kupitia mitandao yote.
              </p>
              <div className="flex items-center gap-4 text-[10px] text-slate-500 pt-1">
                <span>Mei 18, 2026</span>
                <button className="flex items-center gap-1 hover:text-slate-300 transition-colors">
                  <ThumbsUp className="w-3 h-3" /> 12
                </button>
              </div>
            </div>

            {/* Review 2 */}
            <div className="bg-slate-900/20 border border-slate-850 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-emerald-600/30 flex items-center justify-center font-bold text-xs text-emerald-400">
                    AH
                  </div>
                  <span className="text-xs font-bold text-slate-200">Aisha Hamisi</span>
                </div>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="w-2.5 h-2.5 fill-current text-[#00E676]" />
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                Inafunguka haraka na picha ni angavu sana bila chenga. Hakika hii ndio tv ya ukweli mkononi mwako. Nimeipenda!
              </p>
              <div className="flex items-center gap-4 text-[10px] text-slate-500 pt-1">
                <span>Mei 15, 2026</span>
                <button className="flex items-center gap-1 hover:text-slate-300 transition-colors">
                  <ThumbsUp className="w-3 h-3" /> 8
                </button>
              </div>
            </div>

            {/* Review 3 */}
            <div className="bg-slate-900/20 border border-slate-850 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-amber-600/30 flex items-center justify-center font-bold text-xs text-amber-400">
                    EJ
                  </div>
                  <span className="text-xs font-bold text-slate-200">Emmanuel John</span>
                </div>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="w-2.5 h-2.5 fill-current text-[#00E676]" />
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                Nimeipenda sana huduma yao hasa kwa upande vya vipindi vya Kiswahili na tamthilia. Customer support yao iko tayari kukusaidia haraka ukipata tatizo lolote.
              </p>
              <div className="flex items-center gap-4 text-[10px] text-slate-500 pt-1">
                <span>Mei 10, 2026</span>
                <button className="flex items-center gap-1 hover:text-slate-300 transition-colors">
                  <ThumbsUp className="w-3 h-3" /> 4
                </button>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
