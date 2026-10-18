import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/use-toast";
import { Save, AlertCircle, RefreshCw, Upload, Copy, Check, Film } from "lucide-react";
import { uploadToImgBB } from "@/lib/imgbb";

export default function Settings() {
  const [whatsapp, setWhatsapp] = useState("");
  const [whatsappChannel, setWhatsappChannel] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [youtube, setYoutube] = useState("");
  const [supportNumber, setSupportNumber] = useState("");
  const [fastlipaToken, setFastlipaToken] = useState("");
  const [palmpesaToken, setPalmpesaToken] = useState("");
  const [palmpesaUserId, setPalmpesaUserId] = useState("");
  const [sonicpesaApiKey, setSonicpesaApiKey] = useState("");
  const [sonicpesaSecretKey, setSonicpesaSecretKey] = useState("");
  const [snippeApiKey, setSnippeApiKey] = useState("");
  const [activeGateway, setActiveGateway] = useState("fastlipa");
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  
  // App Version Control States
  const [versionCode, setVersionCode] = useState<string | number>("");
  const [versionName, setVersionName] = useState("");
  const [updateUrl, setUpdateUrl] = useState("");
  const [forceUpdate, setForceUpdate] = useState(false);
  const [updateNotes, setUpdateNotes] = useState("");

  // OneSignal Push Notification States
  const [onesignalAppId, setOnesignalAppId] = useState("");
  const [onesignalRestApiKey, setOnesignalRestApiKey] = useState("");

  // App Download Page States
  const [appDescription, setAppDescription] = useState("");
  const [appSize, setAppSize] = useState("15 MB");
  const [appDownloadsCount, setAppDownloadsCount] = useState("50K+");
  const [appRating, setAppRating] = useState("4.9");
  const [appReviewsCount, setAppReviewsCount] = useState("1,250");
  const [appDownloadUrl, setAppDownloadUrl] = useState("");
  const [appPreviews, setAppPreviews] = useState<string[]>([]);

  // Referral Commission Settings
  const [referralCommissionPercentage, setReferralCommissionPercentage] = useState<string | number>("10");

  // Movies Global Feature Toggle (Requirement #5)
  const [moviesEnabled, setMoviesEnabled] = useState(true);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const docRef = doc(db, 'settings', 'general_settings');
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        setWhatsapp(data.whatsapp_url || "");
        setWhatsappChannel(data.whatsapp_channel_url || "");
        setInstagram(data.instagram_url || "");
        setTiktok(data.tiktok_url || "");
        setYoutube(data.youtube_url || "");
        setSupportNumber(data.support_number || "");
        setFastlipaToken(data.fastlipa_token || "");
        setPalmpesaToken(data.palmpesa_token || "");
        setPalmpesaUserId(data.palmpesa_user_id || "");
        setSonicpesaApiKey(data.sonicpesa_api_key || "");
        setSonicpesaSecretKey(data.sonicpesa_secret_key || "");
        setSnippeApiKey(data.snippe_api_key || "");
        setActiveGateway(data.active_gateway || "fastlipa");
        setVersionCode(data.latest_version_code !== undefined ? data.latest_version_code : "");
        setVersionName(data.latest_version_name || "");
        setUpdateUrl(data.update_url || "");
        setForceUpdate(!!data.force_update);
        setUpdateNotes(data.update_notes || "");
        setOnesignalAppId(data.onesignal_app_id || "");
        setOnesignalRestApiKey(data.onesignal_rest_api_key || "");
        setAppDescription(data.app_description || "");
        setAppSize(data.app_size || "15 MB");
        setAppDownloadsCount(data.app_downloads_count || "50K+");
        setAppRating(data.app_rating || "4.9");
        setAppReviewsCount(data.app_reviews_count || "1,250");
        setAppDownloadUrl(data.app_download_url || "");
        setAppPreviews(data.app_previews || []);
        setReferralCommissionPercentage(data.referral_commission_percentage !== undefined ? data.referral_commission_percentage : "10");
        setMoviesEnabled(data.movies_enabled !== false);
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to load settings', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const docRef = doc(db, 'settings', 'general_settings');
      const docSnap = await getDoc(docRef);
      
      const payload = {
        whatsapp_url: whatsapp,
        whatsapp_channel_url: whatsappChannel,
        instagram_url: instagram,
        tiktok_url: tiktok,
        youtube_url: youtube,
        support_number: supportNumber,
        fastlipa_token: fastlipaToken,
        palmpesa_token: palmpesaToken,
        palmpesa_user_id: palmpesaUserId,
        sonicpesa_api_key: sonicpesaApiKey,
        sonicpesa_secret_key: sonicpesaSecretKey,
        snippe_api_key: snippeApiKey,
        active_gateway: activeGateway,
        latest_version_code: versionCode !== "" ? Number(versionCode) : 0,
        latest_version_name: versionName,
        update_url: updateUrl,
        force_update: forceUpdate,
        update_notes: updateNotes,
        onesignal_app_id: onesignalAppId,
        onesignal_rest_api_key: onesignalRestApiKey,
        app_description: appDescription,
        app_size: appSize,
        app_downloads_count: appDownloadsCount,
        app_rating: appRating,
        app_reviews_count: appReviewsCount,
        app_download_url: appDownloadUrl,
        app_previews: appPreviews,
        referral_commission_percentage: referralCommissionPercentage !== "" ? Number(referralCommissionPercentage) : 10,
        movies_enabled: moviesEnabled !== false,
        updated_at: new Date().toISOString()
      };

      if (docSnap.exists()) {
        await updateDoc(docRef, payload);
      } else {
        await setDoc(docRef, payload);
      }
      
      toast({ title: 'Success', description: 'Settings updated successfully.', className: 'bg-green-500 text-white' });
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 flex items-center justify-center text-muted-foreground"><RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading...</div>;

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-foreground mb-2">Social & Payment Settings</h1>
        <p className="text-muted-foreground text-sm">Update social media links and configure your active payment gateway.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-card w-full p-6 rounded-2xl border border-border shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
            <div>
              <h2 className="text-lg font-black text-foreground">Active Payment Gateway</h2>
              <p className="text-xs text-muted-foreground">Select the payment gateway for processing USSD Push payments.</p>
            </div>
            <select
              value={activeGateway}
              onChange={(e) => setActiveGateway(e.target.value)}
              className="bg-background border border-border rounded-xl px-3 py-2 text-sm font-bold text-foreground focus:border-primary outline-none min-w-[150px]"
            >
              <option value="snippe">Snippe</option>
              <option value="fastlipa">FastLipa</option>
              <option value="palmpesa">PalmPesa</option>
              <option value="sonicpesa">SonicPesa</option>
            </select>
          </div>

          {activeGateway === 'snippe' && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-primary uppercase tracking-wider">Snippe API Configuration</h3>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Snippe API Key (Bearer Token)</label>
                <input
                  type="text"
                  value={snippeApiKey}
                  onChange={(e) => setSnippeApiKey(e.target.value)}
                  placeholder="snp_..."
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1.5">Weka API Key yako ya Snippe kutoka Dashboard (<a href="https://snippe.sh" target="_blank" rel="noreferrer" className="text-primary underline">https://snippe.sh</a> &rarr; Settings &rarr; API Keys) kuruhusu malipo ya USSD Push ya M-Pesa, Airtel Money, Mixx/Tigo, na Halotel.</p>
              </div>

              <div className="bg-background/80 border border-primary/20 rounded-xl p-4 space-y-2">
                <label className="text-xs font-bold text-primary uppercase tracking-wider block">Snippe Webhook URL (Kwa Ajili ya Auto-Grant ya Vifurushi)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value="https://us-central1-revontech-6c62d.cloudfunctions.net/snippeWebhook"
                    className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText("https://us-central1-revontech-6c62d.cloudfunctions.net/snippeWebhook");
                      setCopiedWebhook(true);
                      setTimeout(() => setCopiedWebhook(false), 2000);
                    }}
                    className="flex items-center gap-1 bg-primary text-primary-foreground text-xs font-bold px-3 py-2 rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
                  >
                    {copiedWebhook ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedWebhook ? "Imenakiliwa!" : "Nakili"}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Nakili link hii kisha nenda kwenye <strong>Snippe Dashboard</strong> &rarr; <strong>Settings</strong> &rarr; <strong>Webhooks</strong> &rarr; <strong>Add Webhook</strong>, weka link hii na uchague tukio la <code>payment.completed</code> ili mtumiaji akishalipa, kifurushi chake kiwezeshwe moja kwa moja mara moja (Auto-Grant).
                </p>
              </div>
            </div>
          )}

          {activeGateway === 'fastlipa' && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-primary uppercase tracking-wider">FastLipa API Configuration</h3>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">FastLipa API Token</label>
                <input
                  type="text"
                  value={fastlipaToken}
                  onChange={(e) => setFastlipaToken(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1.5">Weka API Token yako ya FastLipa kuruhusu malipo ya moja kwa moja (USSD Push).</p>
              </div>
            </div>
          )}

          {activeGateway === 'palmpesa' && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-primary uppercase tracking-wider">PalmPesa API Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block font-bold">PalmPesa API Token</label>
                  <input
                    type="text"
                    value={palmpesaToken}
                    onChange={(e) => setPalmpesaToken(e.target.value)}
                    placeholder="Weka Bearer token hapa..."
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block font-bold">PalmPesa User ID</label>
                  <input
                    type="text"
                    value={palmpesaUserId}
                    onChange={(e) => setPalmpesaUserId(e.target.value)}
                    placeholder="Mfano: 25"
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors font-mono"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">Sanidi Token na User ID kutoka kwenye akaunti yako ya PalmPesa (https://palmpesa.drmlelwa.co.tz/).</p>
            </div>
          )}

          {activeGateway === 'sonicpesa' && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-primary uppercase tracking-wider">SonicPesa API Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block font-bold">SonicPesa API Key (X-API-KEY)</label>
                  <input
                    type="text"
                    value={sonicpesaApiKey}
                    onChange={(e) => setSonicpesaApiKey(e.target.value)}
                    placeholder="Weka API Key..."
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block font-bold">SonicPesa Secret Key</label>
                  <input
                    type="text"
                    value={sonicpesaSecretKey}
                    onChange={(e) => setSonicpesaSecretKey(e.target.value)}
                    placeholder="Weka Secret Key..."
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors font-mono"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">Sanidi API Key na Secret Key kutoka kwenye Dashboard ya SonicPesa (https://sonicpesa.com/).</p>
            </div>
          )}
        </div>

        <div className="bg-card w-full p-6 rounded-2xl border border-border shadow-sm">
          <h2 className="text-lg font-black text-foreground mb-4">Social Links</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-bold text-foreground mb-1 block">WhatsApp Chat Link</label>
              <input
                type="url"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="https://wa.me/message/..."
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1.5">Private chat link shown as "Ongea nasi kupitia WhatsApp" on the About page (e.g. https://wa.me/255...). The channel link is set below.</p>
            </div>

            <div>
              <label className="text-sm font-bold text-foreground mb-1 block">WhatsApp Support Number</label>
              <input
                type="tel"
                value={supportNumber}
                onChange={(e) => setSupportNumber(e.target.value)}
                placeholder="255..."
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1.5">Enter the WhatsApp number for customer support (include country code without +, e.g., 255...).</p>
            </div>

            <div>
              <label className="text-sm font-bold text-foreground mb-1 block">WhatsApp Channel URL</label>
              <input
                type="url"
                value={whatsappChannel}
                onChange={(e) => setWhatsappChannel(e.target.value)}
                placeholder="https://whatsapp.com/channel/..."
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1.5">Public WhatsApp Channel that appears in the user side menu & About page.</p>
            </div>

            <div>
              <label className="text-sm font-bold text-foreground mb-1 block">Instagram URL</label>
              <input
                type="url"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="https://instagram.com/..."
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1.5">Optional. Shown in the "Fuata Sisi" section if set.</p>
            </div>

            <div>
              <label className="text-sm font-bold text-foreground mb-1 block">TikTok URL</label>
              <input
                type="url"
                value={tiktok}
                onChange={(e) => setTiktok(e.target.value)}
                placeholder="https://tiktok.com/@..."
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1.5">Optional. Shown in the "Fuata Sisi" section if set.</p>
            </div>

            <div>
              <label className="text-sm font-bold text-foreground mb-1 block">YouTube Channel URL</label>
              <input
                type="url"
                value={youtube}
                onChange={(e) => setYoutube(e.target.value)}
                placeholder="https://www.youtube.com/@..."
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1.5">Direct link to your YouTube channel.</p>
            </div>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 text-blue-500 p-4 rounded-xl flex items-start gap-3 mt-6">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold uppercase tracking-wider">Note</p>
              <p className="opacity-80">These URLs appear instantly in the user's slide menu. Only full URLs starting with https:// are accepted.</p>
            </div>
          </div>
        </div>

        <div className="bg-card w-full p-6 rounded-2xl border border-border shadow-sm space-y-6">
          <div className="border-b border-border pb-4">
            <h2 className="text-lg font-black text-foreground">App Version Control</h2>
            <p className="text-xs text-muted-foreground">Manage Android app updates, mandatory checks, and change logs.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-bold text-foreground mb-1 block">Latest Version Code</label>
              <input
                type="number"
                value={versionCode}
                onChange={(e) => setVersionCode(e.target.value)}
                placeholder="e.g., 2"
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1">Must be an integer (e.g., 2) matching the Android versionCode.</p>
            </div>

            <div>
              <label className="text-sm font-bold text-foreground mb-1 block">Latest Version Name</label>
              <input
                type="text"
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                placeholder="e.g., 1.1.0"
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1">User friendly display name of the version (e.g., 1.1.0).</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-bold text-foreground mb-1 block">Update Download URL</label>
            <input
              type="url"
              value={updateUrl}
              onChange={(e) => setUpdateUrl(e.target.value)}
              placeholder="https://revontv.com/RevonTV_debug.apk"
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">URL where the user is redirected to download the new version.</p>
          </div>

          <div>
            <label className="text-sm font-bold text-foreground mb-1 block">Update Description / Changelog</label>
            <textarea
              value={updateNotes}
              onChange={(e) => setUpdateNotes(e.target.value)}
              placeholder="e.g., Maboresho ya kicheza video na kurekebisha malipo ya SonicPesa."
              rows={3}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">Describe the main changes in this update (e.g., in Swahili or English).</p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="force_update"
              checked={forceUpdate}
              onChange={(e) => setForceUpdate(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
            />
            <label htmlFor="force_update" className="text-sm font-bold text-foreground select-none cursor-pointer">
              Force Update (Mandatory)
            </label>
          </div>
        </div>

        <div className="bg-card w-full p-6 rounded-2xl border border-border shadow-sm space-y-6">
          <div className="border-b border-border pb-4">
            <h2 className="text-lg font-black text-foreground">OneSignal Push Notifications</h2>
            <p className="text-xs text-muted-foreground">Configure OneSignal credentials to enable push notifications when sending alerts from the admin panel.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-bold text-foreground mb-1 block">OneSignal App ID</label>
              <input
                type="text"
                value={onesignalAppId}
                onChange={(e) => setOnesignalAppId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">Found in OneSignal Dashboard ΓåÆ Settings ΓåÆ Keys & IDs.</p>
            </div>

            <div>
              <label className="text-sm font-bold text-foreground mb-1 block">OneSignal REST API Key</label>
              <input
                type="password"
                value={onesignalRestApiKey}
                onChange={(e) => setOnesignalRestApiKey(e.target.value)}
                placeholder="Weka REST API Key..."
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">Used to authorize sending push notifications from the admin panel.</p>
            </div>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 text-blue-500 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold uppercase tracking-wider">Note</p>
              <p className="opacity-80">The App ID is also used by the Android app to register devices for push notifications. The REST API Key is used only on the admin panel to send notifications.</p>
            </div>
          </div>
        </div>

        <div className="bg-card w-full p-6 rounded-2xl border border-border shadow-sm space-y-6">
          <div className="border-b border-border pb-4">
            <h2 className="text-lg font-black text-foreground">Referral Commission Settings</h2>
            <p className="text-xs text-muted-foreground">Configure the commission percentage that referrers earn when their invited users purchase a package.</p>
          </div>

          <div>
            <label className="text-sm font-bold text-foreground mb-1 block">Commission Percentage (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={referralCommissionPercentage}
              onChange={(e) => setReferralCommissionPercentage(e.target.value)}
              placeholder="10"
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors"
            />
            <p className="text-xs text-muted-foreground mt-1">Percentage of the package price that the referrer receives as commission when an invited user makes a purchase. Default: 10%</p>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold uppercase tracking-wider">How it Works</p>
              <ul className="opacity-80 space-y-1 list-disc list-inside">
                <li>When users sign up with a referral code, the referrer's count increases but NO rewards are given yet</li>
                <li>When the invited user purchases ANY package, the referrer automatically receives the configured commission percentage</li>
                <li>Commissions are tracked in the referrer's profile as "pending_commissions"</li>
                <li>You can view all referral activity and commissions in the Referrals page</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-card w-full p-6 rounded-2xl border border-border shadow-sm space-y-6">
          <div className="border-b border-border pb-4">
            <h2 className="text-lg font-black text-foreground">App Download Page Settings</h2>
            <p className="text-xs text-muted-foreground">Customize the information shown on the APK download page (/app).</p>
          </div>

          <div>
            <label className="text-sm font-bold text-foreground mb-1 block">App Description</label>
            <textarea
              value={appDescription}
              onChange={(e) => setAppDescription(e.target.value)}
              placeholder="Pata burudani ya vipindi vya TV, Mpira wa miguu LIVE, na filamu kwa Kiswahili na Kiingereza..."
              rows={4}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">Brief summary of the app showcased on the Play Store replica download page.</p>
          </div>

          <div>
            <label className="text-sm font-bold text-foreground mb-1 block">App Download URL</label>
            <input
              type="url"
              value={appDownloadUrl}
              onChange={(e) => setAppDownloadUrl(e.target.value)}
              placeholder="https://revontv.com/RevonTV_debug.apk"
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">Dedicated download link for the APK download page (/app).</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-bold text-foreground mb-1 block">App Size (MB)</label>
              <input
                type="text"
                value={appSize}
                onChange={(e) => setAppSize(e.target.value)}
                placeholder="e.g., 15 MB"
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1">Shown in the details bar (e.g. '15 MB').</p>
            </div>

            <div>
              <label className="text-sm font-bold text-foreground mb-1 block">Downloads Count</label>
              <input
                type="text"
                value={appDownloadsCount}
                onChange={(e) => setAppDownloadsCount(e.target.value)}
                placeholder="e.g., 50K+"
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1">Shown in the details bar (e.g. '50K+').</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-bold text-foreground mb-1 block">Rating Score</label>
              <input
                type="text"
                value={appRating}
                onChange={(e) => setAppRating(e.target.value)}
                placeholder="e.g., 4.9"
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1">Review average score (e.g. '4.9').</p>
            </div>

            <div>
              <label className="text-sm font-bold text-foreground mb-1 block">Total Reviews Count</label>
              <input
                type="text"
                value={appReviewsCount}
                onChange={(e) => setAppReviewsCount(e.target.value)}
                placeholder="e.g., 1,250"
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1">Total reviews count text (e.g. '1,250').</p>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-foreground">App Preview Screenshots (URLs)</label>
              <button
                type="button"
                onClick={() => setAppPreviews([...appPreviews, ""])}
                className="text-xs bg-primary/10 hover:bg-primary/20 text-primary font-bold px-3 py-1.5 rounded-lg transition-colors"
              >
                + Add Preview Image URL
              </button>
            </div>
            
            {appPreviews.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No custom preview images added. Standard mock frames will be displayed on /app page.</p>
            ) : (
              <div className="space-y-2">
                {appPreviews.map((url, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => {
                        const updated = [...appPreviews];
                        updated[index] = e.target.value;
                        setAppPreviews(updated);
                      }}
                      placeholder="https://example.com/screenshot.png"
                      className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-colors font-mono"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      id={`preview-upload-${index}`}
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const uploadedUrl = await uploadToImgBB(file);
                          const updated = [...appPreviews];
                          updated[index] = uploadedUrl;
                          setAppPreviews(updated);
                          toast({ title: 'Success', description: 'Image uploaded successfully!', className: 'bg-green-500 text-white' });
                        } catch (error: any) {
                          toast({ title: 'Upload Failed', description: error.message, variant: 'destructive' });
                        }
                      }}
                    />
                    <label
                      htmlFor={`preview-upload-${index}`}
                      className="bg-primary/10 hover:bg-primary/20 text-primary font-bold px-3 py-3 rounded-xl transition-colors text-xs cursor-pointer flex items-center justify-center"
                      title="Upload Image"
                    >
                      <Upload className="w-4 h-4" />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = appPreviews.filter((_, i) => i !== index);
                        setAppPreviews(updated);
                      }}
                      className="bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold px-3 py-3 rounded-xl transition-colors text-xs"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Provide direct image URLs for screenshots. They will be framed beautifully in smartphone bezels on /app.</p>
          </div>
        </div>

        {/* Movies Feature Switch */}
        <div className="cyber-card rounded-2xl p-6 border border-primary/20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${moviesEnabled ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                <Film className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black text-foreground">Washa / Zima Sehemu ya Filamu (Movies)</h2>
                <p className="text-xs text-muted-foreground">
                  {moviesEnabled
                    ? 'Filamu zipo hewani na zinaonekana kwa watumiaji wote'
                    : 'Filamu zimezimwa kabisa — zimefichwa kwenye website na app'}
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={moviesEnabled}
              onChange={(e) => setMoviesEnabled(e.target.checked)}
              className="w-5 h-5 accent-primary cursor-pointer"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-primary text-primary-foreground font-black py-4 rounded-xl glow-primary disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {saving ? <><RefreshCw className="w-5 h-5 animate-spin" /> SAVING...</> : <><Save className="w-5 h-5" /> SAVE SETTINGS</>}
        </button>
      </form>
    </div>
  );
}
