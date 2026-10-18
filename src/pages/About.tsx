import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { doc, getDoc, collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  MessageCircle,
  Youtube,
  Instagram,
  Music2,
  Tv2,
  Film,
  Cast,
  Award,
  Smartphone,
  Headphones,
  Phone,
  Mail,
} from 'lucide-react';

interface Settings {
  whatsapp_url?: string;
  whatsapp_channel_url?: string;
  youtube_url?: string;
  instagram_url?: string;
  tiktok_url?: string;
  support_number?: string;
  support_email?: string;
}

const FEATURES = [
  {
    Icon: Tv2,
    title: 'Vituo vya Live TV',
    description: 'Vituo vyote vya ndani na kimataifa moja kwa moja kwenye kifaa chako.',
  },
  {
    Icon: Film,
    title: 'Movies',
    description: 'Filamu zilizotafsiriwa Kiswahili na zilizosasishwa kila siku.',
  },
  {
    Icon: Cast,
    title: 'Cast kwa TV',
    description: 'Angalia kwenye Smart TV yako kupitia Chromecast — ubora wa juu.',
  },
  {
    Icon: Award,
    title: 'HD Quality',
    description: 'Chagua ubora unaotaka: Auto, 720p, 1080p — bila kikwazo.',
  },
  {
    Icon: Smartphone,
    title: 'Multi-Device',
    description: 'Fungua kwenye simu, kompyuta, au tablet — akaunti moja.',
  },
  {
    Icon: Headphones,
    title: 'Support 24/7',
    description: 'Tuko tayari kukusaidia muda wowote kupitia WhatsApp.',
  },
];

export default function About() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const single = await getDoc(doc(db, 'settings', 'general_settings'));
        if (single.exists()) {
          setSettings(single.data() as Settings);
          return;
        }
        const q = query(collection(db, 'settings'), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) setSettings(snap.docs[0].data() as Settings);
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };
    fetchSettings();
  }, []);

  const socials: Array<{
    href: string;
    label: string;
    Icon: typeof Youtube;
    text: string;
    bg: string;
    border: string;
  }> = [];
  if (settings?.whatsapp_channel_url) {
    socials.push({
      href: settings.whatsapp_channel_url,
      label: 'WhatsApp Channel',
      Icon: MessageCircle,
      text: 'text-green-500',
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
    });
  }
  if (settings?.instagram_url) {
    socials.push({
      href: settings.instagram_url,
      label: 'Instagram',
      Icon: Instagram,
      text: 'text-pink-400',
      bg: 'bg-gradient-to-br from-pink-500/10 to-orange-400/10',
      border: 'border-pink-500/30',
    });
  }
  if (settings?.tiktok_url) {
    socials.push({
      href: settings.tiktok_url,
      label: 'TikTok',
      Icon: Music2,
      text: 'text-white',
      bg: 'bg-black/40',
      border: 'border-white/20',
    });
  }
  if (settings?.youtube_url) {
    socials.push({
      href: settings.youtube_url,
      label: 'YouTube',
      Icon: Youtube,
      text: 'text-red-500',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
    });
  }

  return (
    <div className="min-h-screen pb-20">
      <Header />

      {/* Hero */}
      <section className="px-6 pt-10 pb-8 text-center max-w-3xl mx-auto">
        <div className="w-24 h-24 mx-auto rounded-3xl bg-primary flex items-center justify-center glow-primary overflow-hidden mb-6 shadow-2xl">
          <img src="/logo.jpg" alt="RT Logo" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-display text-primary text-glow-primary mb-2 uppercase tracking-widest">
          REVONTECH TV
        </h1>
        <p className="text-body text-muted-foreground uppercase tracking-[0.3em] font-bold">
          Premium Entertainment Hub
        </p>
      </section>

      <div className="max-w-3xl mx-auto px-4 space-y-6 pb-10">
        {/* Mission */}
        <section className="glass rounded-3xl p-6 md:p-8 animate-slide-up">
          <h2 className="text-h1 text-foreground mb-3">Nia Yetu</h2>
          <p className="text-body text-muted-foreground leading-relaxed">
            REVONTECH TV imejikita katika kutoa burudani ya moja kwa moja yenye ubora wa juu bila
            kukatika. Tunakuletea vituo bora vya ndani na kimataifa moja kwa moja kwenye skrini
            yako, kuhakikisha huoni kikwazo cha kufuatilia vipindi vyako pendwa, michezo, na
            habari.
          </p>
        </section>

        {/* Features */}
        <section className="animate-slide-up">
          <h2 className="text-h1 text-foreground mb-4 px-2">Tunachotoa</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="glass rounded-2xl p-5 hover-lift press flex flex-col gap-3"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                  <f.Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-sm font-black text-foreground">{f.title}</h3>
                <p className="text-caption leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section className="glass rounded-3xl p-6 md:p-8 animate-slide-up">
          <h2 className="text-h1 text-foreground mb-3">Wasiliana Nasi</h2>
          <p className="text-body text-muted-foreground leading-relaxed mb-5">
            Kwa msaada wowote au maswali, wasiliana nasi kupitia WhatsApp, simu au barua pepe.
            Tuko available 24/7 kuhakikisha burudani yako haisimami.
          </p>

          <div className="space-y-3">
            {settings?.support_number && (
              <a
                href={`tel:${settings.support_number.replace(/\D/g, '')}`}
                className="flex items-center gap-3 w-full py-3.5 px-5 rounded-2xl glass border border-primary/30 hover:bg-primary/10 press tap-safe"
              >
                <Phone className="w-5 h-5 text-primary" />
                <span className="flex-1 text-sm font-bold text-foreground">
                  Piga simu &middot; {settings.support_number}
                </span>
                <span className="text-caption">&rarr;</span>
              </a>
            )}
            {settings?.whatsapp_url && (
              <a
                href={settings.whatsapp_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 w-full py-3.5 px-5 rounded-2xl bg-green-500/10 border border-green-500/30 hover:bg-green-500/20 press tap-safe"
              >
                <MessageCircle className="w-5 h-5 text-green-500" />
                <span className="flex-1 text-sm font-bold text-green-500 text-left">
                  Ongea nasi kupitia WhatsApp
                </span>
                <span className="text-caption text-green-500">&rarr;</span>
              </a>
            )}
            {settings?.support_email && (
              <a
                href={`mailto:${settings.support_email}`}
                className="flex items-center gap-3 w-full py-3.5 px-5 rounded-2xl glass border border-info/30 hover:bg-info/10 press tap-safe"
              >
                <Mail className="w-5 h-5 text-info" />
                <span className="flex-1 text-sm font-bold text-foreground text-left">
                  {settings.support_email}
                </span>
                <span className="text-caption">&rarr;</span>
              </a>
            )}
          </div>

          {socials.length > 0 && (
            <>
              <div className="h-px bg-border/40 my-5" />
              <p className="text-caption font-black uppercase tracking-widest mb-3">
                Fuata Sisi
              </p>
              <div className="grid grid-cols-2 gap-3">
                {socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${s.border} ${s.bg} ${s.text} font-bold text-sm press tap-safe hover:brightness-110`}
                  >
                    <s.Icon className="w-4 h-4" />
                    <span className="truncate">{s.label}</span>
                  </a>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Footer */}
        <div className="text-center text-caption pt-4">
          <p>© {new Date().getFullYear()} REVONTECH TV. Haki zote zimehifadhiwa.</p>
        </div>
      </div>
    </div>
  );
}
