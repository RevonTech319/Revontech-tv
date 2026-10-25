/**
 * Single source of truth for the Token API documentation.
 * The Admin → API → Docs tab renders from this, and "Download .md"
 * (also docs/TOKEN_API.md in the repo) is generated from it, so they never drift.
 *
 * Keep in sync with functions/tokenApi.js.
 */

export const BASES = [
  {
    id: 'domain',
    label: 'Domain yako (Vercel)',
    url: 'https://www.revontechtv.online/api',
  },
] as const;

/** Two separate API systems. A key works for exactly one of them. */
export type ApiType = 'token' | 'channels';

export const API_TYPES: Record<ApiType, { label: string; short: string; version: string; summary: string }> = {
  token: {
    label: 'Type 1 · Token API',
    short: 'Token API',
    version: 'v1',
    summary: 'Unashiriki TOKEN tu (au unaweka token kwenye links zako). Website nyingine ina channels zake mwenyewe.',
  },
  channels: {
    label: 'Type 2 · Channels API',
    short: 'Channels API',
    version: 'v2',
    summary: 'Unashiriki CHANNELS ulizopakia kwenye RevonTech TV, zikiwa tayari kucheza: link yenye token, funguo za DRM, playlist ya IPTV na kiungo kisichokwisha.',
  },
};

/** Versioned base, e.g. https://…/tokenApi/v2 */
export const apiBase = (root: string, type: ApiType) => `${root}/${API_TYPES[type].version}`;

export interface ScopeDef { id: string; label: string; desc: string; sensitive?: boolean }

export const SCOPES: ScopeDef[] = [
  { id: 'token', label: 'token', desc: 'Kusoma token ya sasa (GET /token).' },
  { id: 'resolve', label: 'resolve', desc: 'Kuweka token kwenye link ya Azam (GET/POST /resolve).' },
  { id: 'channels', label: 'channels', desc: 'Orodha ya channels BURE zenye link tayari za kucheza (GET /channels).' },
  { id: 'premium', label: 'premium', desc: 'Pamoja na channels za malipo kwenye /channels. Mtu mwenye key hii anaweza kuzicheza bila kulipia kwako.', sensitive: true },
  { id: 'drm', label: 'drm', desc: 'Pamoja na funguo za DRM (kid/key) kwenye /channels.', sensitive: true },
];

export type LangId = 'curl' | 'js' | 'node' | 'php' | 'python';
export const LANGS: { id: LangId; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'js', label: 'JavaScript (browser)' },
  { id: 'node', label: 'Node.js' },
  { id: 'php', label: 'PHP' },
  { id: 'python', label: 'Python' },
];

export interface Param { name: string; in: 'query' | 'body' | 'header'; required: boolean; desc: string }

export interface Endpoint {
  id: string;
  method: 'GET' | 'POST';
  path: string;
  scope: string | null; // null = public, no key
  title: string;
  summary: string;
  params: Param[];
  query?: Record<string, string>;
  body?: unknown;
  response: unknown;
  notes?: string[];
  /** How the response is delivered. Default 'json'. */
  responseType?: 'json' | 'text' | 'redirect';
  /** Players can't send headers → the key goes in ?api_key= for this endpoint. */
  keyInQuery?: boolean;
}

const AZAM_CLEAN = 'https://cdnedgch2.azamtvltd.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd';
const EXAMPLE_TOKEN = 'eyJhbGciOiJIUzUxMiJ9.eyJleHAiOjE3OTIyNDc4Njl9.xxxxxxxxxxxxxxxxxxxx';
const AZAM_WITH_TOKEN = `https://cdnedgch2.azamtvltd.co.tz/tok_${EXAMPLE_TOKEN}/live/eds/AzamSport1/DASH/AzamSport1.mpd`;

export const ENDPOINTS_TOKEN: Endpoint[] = [
  {
    id: 'status',
    method: 'GET',
    path: '/status',
    scope: null,
    title: 'Status (afya ya API)',
    summary: 'Hakuna key inayohitajika. Tumia kwa uptime monitor au kuhakikisha API iko hewani.',
    params: [],
    response: { ok: true, service: 'revontech-token-api', version: '1', time: '2026-10-22T10:00:00.000Z' },
  },
  {
    id: 'token',
    method: 'GET',
    path: '/token',
    scope: 'token',
    title: 'Pata token ya sasa',
    summary: 'Inarudisha CDN token ya sasa ile ile inayotumika kwenye app yako, pamoja na muda wa kuisha.',
    params: [],
    response: {
      success: true,
      data: {
        token: EXAMPLE_TOKEN,
        expires_at: '2026-10-22T14:37:49.000Z',
        expires_in: 3600,
        expired: false,
        updated_at: '2026-10-22T10:00:00.000Z',
        source: 'auto',
      },
    },
    notes: [
      'expires_in ni sekunde zilizobaki. expired=true inamaanisha token ya dashboard imekwisha muda (hali ya hatari — angalia ukurasa wa Token).',
      'Usiite API kwa kila mtazamaji. Hifadhi (cache) token hadi expires_in - 60s, au angalau dakika 1.',
    ],
  },
  {
    id: 'resolve',
    method: 'GET',
    path: '/resolve',
    scope: 'resolve',
    title: 'Weka token kwenye link moja',
    summary: 'Unatuma link ya Azam (safi au yenye token ya zamani) na unarudishiwa link tayari kucheza. Link za seva nyingine zinarudi kama zilivyo (tokenized=false).',
    params: [{ name: 'url', in: 'query', required: true, desc: 'Link kamili ya http(s) ya stream.' }],
    query: { url: AZAM_CLEAN },
    response: {
      success: true,
      data: { url: AZAM_WITH_TOKEN, tokenized: true, expires_at: '2026-10-22T14:37:49.000Z', expires_in: 3600, expired: false },
    },
  },
  {
    id: 'resolve-bulk',
    method: 'POST',
    path: '/resolve',
    scope: 'resolve',
    title: 'Weka token kwenye links nyingi',
    summary: 'Hadi links 50 kwa ombi moja. Jibu huwa na items kila wakati, kwa mpangilio uleule.',
    params: [
      { name: 'urls', in: 'body', required: true, desc: 'Array ya links (max 50), kila moja ianze na http:// au https://.' },
      { name: 'Content-Type', in: 'header', required: true, desc: 'application/json' },
    ],
    body: { urls: [AZAM_CLEAN, 'https://other.example.com/live/index.m3u8'] },
    response: {
      success: true,
      data: {
        items: [
          { input: AZAM_CLEAN, url: AZAM_WITH_TOKEN, tokenized: true },
          { input: 'https://other.example.com/live/index.m3u8', url: 'https://other.example.com/live/index.m3u8', tokenized: false },
        ],
        expires_at: '2026-10-22T14:37:49.000Z',
        expires_in: 3600,
        expired: false,
      },
    },
  },
  {
    id: 'channels',
    method: 'GET',
    path: '/channels',
    scope: 'channels',
    title: 'Orodha ya channels',
    summary: 'Channels zinazotumika, kila moja ikiwa na stream_url tayari yenye token. Channels za malipo zinahitaji scope "premium"; funguo za DRM zinahitaji scope "drm".',
    params: [
      { name: 'category', in: 'query', required: false, desc: 'Chuja kwa category (hailengi herufi kubwa/ndogo).' },
      { name: 'type', in: 'query', required: false, desc: '"dash" au "hls".' },
    ],
    query: { category: 'Sports' },
    response: {
      success: true,
      data: {
        count: 1,
        token_expires_at: '2026-10-22T14:37:49.000Z',
        token_expired: false,
        channels: [
          {
            id: 'abc123',
            name: 'Azam Sport 1',
            logo: 'https://example.com/azam-sport-1.png',
            category: 'Sports',
            type: 'dash',
            is_free: true,
            stream_url: AZAM_WITH_TOKEN,
            tokenized: true,
            drm: { kid: '00112233445566778899aabbccddeeff', key: 'ffeeddccbbaa99887766554433221100' },
          },
        ],
      },
    },
    notes: ['Sehemu ya "drm" inaonekana tu kama key ina scope "drm" na channel ina funguo.', 'Orodha huhifadhiwa (cache) kwa takriban sekunde 30.'],
  },
];

export const ERRORS_TOKEN: { status: number; code: string; meaning: string }[] = [
  { status: 400, code: 'bad_request', meaning: 'Ombi lina kasoro (url haipo, si http(s), au zaidi ya 50).' },
  { status: 401, code: 'missing_key', meaning: 'Hukutuma key. Tumia header X-API-Key.' },
  { status: 401, code: 'invalid_key', meaning: 'Key si sahihi au imefutwa.' },
  { status: 403, code: 'key_disabled', meaning: 'Key imezimwa kwenye admin.' },
  { status: 403, code: 'scope_missing', meaning: 'Key haina ruhusa (scope) ya endpoint hii.' },
  { status: 403, code: 'origin_not_allowed', meaning: 'Website uliyoitumia haipo kwenye orodha ya origins za key hii.' },
  { status: 403, code: 'wrong_key_type', meaning: 'Hii ni key ya Channels API (type 2). Tumia endpoints za /v2.' },
  { status: 404, code: 'not_found', meaning: 'Endpoint haipo.' },
  { status: 405, code: 'method_not_allowed', meaning: 'Method si sahihi kwa endpoint hii.' },
  { status: 429, code: 'rate_limited', meaning: 'Maombi mengi mno. Subiri sekunde za header Retry-After.' },
  { status: 500, code: 'server_error', meaning: 'Hitilafu upande wetu. Jaribu tena.' },
  { status: 503, code: 'token_unavailable', meaning: 'Hakuna token kwa sasa (angalia ukurasa wa Token kwenye admin).' },
];

export const LIMITS_TOKEN: string[] = [
  'Kila key ina kikomo cha maombi kwa dakika (chaguo-msingi 60). Likizidi unapata 429 na header Retry-After.',
  'Kikomo kinahesabiwa kwa kila server instance, kwa hiyo ni ulinzi wa jumla, si hesabu kamili.',
  'Key ikizimwa au ikifutwa, athari huonekana ndani ya takriban sekunde 30.',
  'Token inahifadhiwa sekunde 5 upande wa API; orodha ya channels sekunde 30.',
  'Key inaonyeshwa MARA MOJA tu wakati wa kuunda. Hifadhiwa kama hash, hivyo haiwezi kurejeshwa — kama umeipoteza, tengeneza mpya na ufute ya zamani.',
];

export const SECURITY_TOKEN: string[] = [
  'Njia salama zaidi: piga API kutoka SERVER yako (PHP/Node/Python) na umpe browser matokeo tu — key haionekani kwa mtu yeyote.',
  'Ukilazimika kuiita moja kwa moja kutoka browser, key itaonekana kwenye page source. Weka "Allowed origins" ya key hiyo iwe website yako tu, na upe scope ndogo (token/resolve) tu.',
  'Epuka scope "premium" na "drm" kwa key itakayotumika kwenye browser.',
  'Tuma key kwenye header (X-API-Key au Authorization: Bearer). Njia ya ?api_key= ipo lakini inaonekana kwenye logs za server — usiitumie isipokuwa lazima.',
  'Tengeneza key tofauti kwa kila website/mteja ili uweze kuzima moja bila kuathiri nyingine.',
];

// ── sample generators ──────────────────────────────────────────────────────

const q = (s: string) => JSON.stringify(s);
const pyStr = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const phpStr = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
/** JSON value -> PHP array literal */
function phpValue(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(phpValue).join(', ')}]`;
  if (v && typeof v === 'object') return `[${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${phpStr(k)} => ${phpValue(x)}`).join(', ')}]`;
  if (typeof v === 'string') return phpStr(v);
  return String(v);
}

export function sample(lang: LangId, base: string, ep: Endpoint, key = 'YOUR_API_KEY'): string {
  const url = base + ep.path;
  const needKey = ep.scope !== null;
  const rt = ep.responseType || 'json';
  const keyInQuery = needKey && !!ep.keyInQuery;
  const hdrKey = needKey && !keyInQuery;
  const query: Record<string, string> = { ...(ep.query || {}), ...(keyInQuery ? { api_key: key } : {}) };
  const hasQuery = Object.keys(query).length > 0;
  const isPost = ep.method === 'POST';

  if (lang === 'curl') {
    const parts = ['curl'];
    if (rt === 'redirect') parts.push('-i');
    if (hasQuery && !isPost) parts.push('-G');
    if (isPost) parts.push('-X POST');
    parts.push(q(url));
    if (hdrKey) parts.push(`-H ${q('X-API-Key: ' + key)}`);
    if (isPost) parts.push(`-H "Content-Type: application/json"`, `-d '${JSON.stringify(ep.body)}'`);
    if (hasQuery && !isPost) Object.entries(query).forEach(([k, v]) => parts.push(`--data-urlencode ${q(`${k}=${v}`)}`));
    return parts.join(' \\\n  ');
  }

  if (lang === 'js' || lang === 'node') {
    const keyExpr = lang === 'node' ? 'process.env.REVON_API_KEY' : q(key);
    const L: string[] = [];
    L.push(`const url = new URL(${q(url)});`);
    if (hasQuery && !isPost) {
      Object.entries(query).forEach(([k, v]) => L.push(`url.searchParams.set(${q(k)}, ${k === 'api_key' && lang === 'node' ? keyExpr : q(v)});`));
    }
    if (rt === 'redirect') {
      if (lang === 'js') {
        L.push('', '// Tumia URL hii moja kwa moja kama chanzo cha player — server inakupeleka kwenye stream ya sasa.', 'const video = document.querySelector("video");', 'video.src = url.toString();   // HLS: Safari moja kwa moja; vinginevyo hls.loadSource(url.toString())');
      } else {
        L.push('', 'const res = await fetch(url, { redirect: "manual" });', 'console.log(res.status, res.headers.get("location"));');
      }
      return L.join('\n');
    }
    L.push('', 'const res = await fetch(url, {');
    if (isPost) L.push(`  method: "POST",`);
    L.push('  headers: {');
    if (hdrKey) L.push(`    "X-API-Key": ${keyExpr},`);
    if (isPost) L.push(`    "Content-Type": "application/json",`);
    L.push('  },');
    if (isPost) L.push(`  body: JSON.stringify(${JSON.stringify(ep.body, null, 2).replace(/\n/g, '\n  ')}),`);
    L.push('});');
    if (rt === 'text') {
      L.push('if (!res.ok) throw new Error("HTTP " + res.status);', 'console.log((await res.text()).slice(0, 500));');
    } else {
      L.push('const json = await res.json();');
      if (needKey) L.push('if (!json.success) throw new Error(json.error.code + ": " + json.error.message);', 'console.log(json.data);');
      else L.push('console.log(json);');
    }
    return L.join('\n');
  }

  if (lang === 'php') {
    const L: string[] = ['<?php'];
    const full = hasQuery && !isPost ? `${phpStr(url + '?')} . http_build_query([${Object.entries(query).map(([k, v]) => `${phpStr(k)} => ${phpStr(v)}`).join(', ')}])` : phpStr(url);
    L.push(`$ch = curl_init(${full});`);
    const headers: string[] = [];
    if (hdrKey) headers.push(phpStr('X-API-Key: ' + key));
    if (isPost) headers.push(phpStr('Content-Type: application/json'));
    L.push('curl_setopt_array($ch, [', '    CURLOPT_RETURNTRANSFER => true,', '    CURLOPT_TIMEOUT => 10,');
    if (rt === 'redirect') L.push('    CURLOPT_FOLLOWLOCATION => false,', '    CURLOPT_HEADER => true,');
    if (headers.length) L.push(`    CURLOPT_HTTPHEADER => [${headers.join(', ')}],`);
    if (isPost) L.push('    CURLOPT_POST => true,', `    CURLOPT_POSTFIELDS => json_encode(${phpValue(ep.body)}),`);
    L.push(']);', '$body = curl_exec($ch);', '$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);', 'curl_close($ch);', '');
    if (rt === 'redirect') L.push('echo $body;   // HTTP 302 + Location: <link ya sasa>');
    else if (rt === 'text') L.push('if ($code !== 200) { die("API error: HTTP " . $code); }', 'echo $body;');
    else {
      L.push('$json = json_decode($body, true);');
      if (needKey) L.push('if ($code !== 200 || empty($json[\'success\'])) {', '    die(\'API error: \' . ($json[\'error\'][\'code\'] ?? $code));', '}', 'print_r($json[\'data\']);');
      else L.push('print_r($json);');
    }
    return L.join('\n');
  }

  // python
  const L: string[] = ['import requests', ''];
  const args: string[] = [pyStr(url)];
  if (hasQuery && !isPost) args.push(`params={${Object.entries(query).map(([k, v]) => `${pyStr(k)}: ${pyStr(v)}`).join(', ')}}`);
  if (isPost) args.push(`json=${JSON.stringify(ep.body)}`);
  if (hdrKey) args.push(`headers={${pyStr('X-API-Key')}: ${pyStr(key)}}`);
  if (rt === 'redirect') args.push('allow_redirects=False');
  args.push('timeout=10');
  L.push(`res = requests.${isPost ? 'post' : 'get'}(${args.join(', ')})`);
  if (rt === 'redirect') L.push('print(res.status_code, res.headers["Location"])');
  else if (rt === 'text') L.push('res.raise_for_status()', 'print(res.text[:500])');
  else {
    L.push('json = res.json()');
    if (needKey) L.push('if not json.get("success"):', '    raise RuntimeError(json["error"]["code"])', 'print(json["data"])');
    else L.push('print(json)');
  }
  return L.join('\n');
}

export interface Guide { id: string; title: string; text: string; lang: string; code: (base: string) => string }

export const GUIDES_TOKEN: Guide[] = [
  {
    id: 'php-proxy',
    title: '1. Njia salama (inapendekezwa): proxy ya PHP kwenye server yako',
    text: 'Browser ya wageni inaita token.php kwenye website YAKO; key inabaki kwenye server na haionekani popote. Faili hii pia ina cache ya sekunde 30, hivyo hata wageni 10,000 hawazidishi kikomo.',
    lang: 'php',
    code: (base) => `<?php
// token.php – kwenye server yako (key haitoki hapa)
header('Content-Type: application/json');
header('Cache-Control: public, max-age=30');

$API_KEY = getenv('REVON_API_KEY');            // weka key kwenye environment, si kwenye code
$cache   = sys_get_temp_dir() . '/revon_token.json';

if (is_file($cache) && time() - filemtime($cache) < 30) {
    readfile($cache);
    exit;
}

$ch = curl_init('${base}/token');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_HTTPHEADER     => ['X-API-Key: ' . $API_KEY],
]);
$body = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($code === 200) {
    file_put_contents($cache, $body);
    echo $body;
} else {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => ['code' => 'upstream_failed']]);
}`,
  },
  {
    id: 'js-cache',
    title: '2. Pata token na uihifadhi (JavaScript)',
    text: 'Msaidizi mdogo anayeuliza API mara moja kwa dakika bila kujali watazamaji wangapi, na kuomba token mpya kabla haijaisha. Ikiwa unatumia proxy ya hatua 1, badilisha URL iwe /token.php na uondoe header ya key.',
    lang: 'javascript',
    code: (base) => `// tokenClient.js
let cached = null;

export async function getToken() {
  const now = Date.now();
  if (cached && now < cached.refreshAt) return cached.token;

  const res = await fetch("${base}/token", {
    headers: { "X-API-Key": "YOUR_API_KEY" },   // au piga proxy yako ya PHP badala yake
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error.code);

  const d = json.data;
  // omba mpya sekunde 60 kabla ya kuisha, lakini si mara nyingi kuliko kila dakika 1
  const ttl = d.expires_in != null ? Math.max(60, d.expires_in - 60) : 120;
  cached = { token: d.token, refreshAt: now + ttl * 1000 };
  return d.token;
}`,
  },
  {
    id: 'play',
    title: '3. Cheza channel ya Azam kwenye website nyingine',
    text: 'Njia rahisi ni /resolve: unaipa link safi na inarudisha link tayari kucheza. Weka kwenye Shaka Player, dash.js au hls.js. Token inapoisha (au mchezo ukitoa 403), omba link mpya na ucheze tena.',
    lang: 'javascript',
    code: (base) => `const CLEAN = "https://cdnedgch2.azamtvltd.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd";

async function getPlayableUrl() {
  const res = await fetch("${base}/resolve?url=" + encodeURIComponent(CLEAN), {
    headers: { "X-API-Key": "YOUR_API_KEY" },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error.code);
  return json.data.url;               // https://…/tok_<token>/live/eds/…
}

// Shaka Player
const player = new shaka.Player(document.getElementById("video"));
await player.load(await getPlayableUrl());

// token ikiisha / 403 → omba link mpya
player.addEventListener("error", async () => {
  await player.load(await getPlayableUrl());
});`,
  },
];


// ════════════════════════════════════════════════════════════════════════════
//  Type 2 · Channels API  (/v2)
// ════════════════════════════════════════════════════════════════════════════

const CH_KID = '00112233445566778899aabbccddeeff';
const CH_KEY = 'ffeeddccbbaa99887766554433221100';

const CH_ITEM = {
  id: 'abc123',
  name: 'Azam Sport 1',
  logo: 'https://example.com/azam-sport-1.png',
  category: 'Sports',
  type: 'dash',
  is_free: false,
  drm_protected: true,
  play: {
    url: AZAM_WITH_TOKEN,
    tokenized: true,
    expires_at: '2026-10-22T14:37:49.000Z',
    expires_in: 3600,
    drm: { type: 'clearkey', kid: CH_KID, key: CH_KEY, keys: [{ kid: CH_KID, key: CH_KEY }] },
  },
};

const FILTER_PARAMS: Param[] = [
  { name: 'category', in: 'query', required: false, desc: 'Chuja kwa category (hailengi herufi kubwa/ndogo).' },
  { name: 'type', in: 'query', required: false, desc: '"dash" au "hls".' },
  { name: 'q', in: 'query', required: false, desc: 'Tafuta kwa jina la channel.' },
];

export const ENDPOINTS_CHANNELS: Endpoint[] = [
  {
    id: 'channels',
    method: 'GET',
    path: '/channels',
    scope: 'key',
    title: 'Orodha ya channels zilizoshirikiwa',
    summary: 'Channels zote ulizoruhusu kwa key hii. Kila moja ina play.url (tayari kucheza, ina token ya sasa) na play.drm (funguo za ClearKey, kama umeruhusu).',
    params: FILTER_PARAMS,
    query: { category: 'Sports' },
    response: { success: true, data: { count: 1, token_expires_at: '2026-10-22T14:37:49.000Z', token_expired: false, channels: [CH_ITEM] } },
    notes: [
      'play.drm inaonekana tu kama key ina "Funguo za DRM" imewashwa. drm_protected=true inaonyesha channel imesimbwa hata kama funguo zimefichwa.',
      'play.url ina token ya sasa na itakwisha muda. Soma play.expires_in na uombe tena, au tumia /play/:id (inatoa link ya sasa kila mara).',
      'Orodha huhifadhiwa (cache) kwa takriban sekunde 30.',
    ],
  },
  {
    id: 'channel',
    method: 'GET',
    path: '/channels/CHANNEL_ID',
    scope: 'key',
    title: 'Channel moja',
    summary: 'Taarifa kamili za channel moja, pamoja na link mpya ya kucheza. Channel isiyo kwenye mgao wa key hii inarudi 404.',
    params: [{ name: 'CHANNEL_ID', in: 'query', required: true, desc: 'id kutoka kwenye /channels (sehemu ya njia, si query).' }],
    response: { success: true, data: CH_ITEM },
  },
  {
    id: 'categories',
    method: 'GET',
    path: '/categories',
    scope: 'key',
    title: 'Categories',
    summary: 'Categories za channels zilizoshirikiwa na idadi ya channels kila moja.',
    params: [],
    response: { success: true, data: { count: 2, categories: [{ name: 'News', count: 4 }, { name: 'Sports', count: 6 }] } },
  },
  {
    id: 'play',
    method: 'GET',
    path: '/play/CHANNEL_ID.m3u8',
    scope: 'key',
    title: 'Kiungo cha kucheza kisichokwisha (redirect)',
    summary: 'URL ya kudumu ya channel. Kila unapoiomba, inakupeleka (302) kwenye link ya sasa yenye token mpya — hivyo hutawahi kuhifadhi link iliyokwisha. Weka moja kwa moja kwenye player yako.',
    params: [
      { name: 'CHANNEL_ID', in: 'query', required: true, desc: 'id ya channel (sehemu ya njia). Kiendelezi .m3u8 / .mpd ni hiari — kwa players zinazotegemea jina la faili.' },
      { name: 'api_key', in: 'query', required: true, desc: 'Key yako. Players hawawezi kutuma header, kwa hiyo hapa key inaenda kwenye URL.' },
    ],
    keyInQuery: true,
    responseType: 'redirect',
    response: `HTTP/1.1 302 Found\nLocation: ${AZAM_WITH_TOKEN}`,
    notes: [
      'Channel ya DASH yenye DRM bado inahitaji kid/key kutoka /channels (player ya DASH inazihitaji).',
      'Azam ikikosa token kwa sasa, unapata 503 token_unavailable badala ya link isiyofanya kazi.',
    ],
  },
  {
    id: 'playlist',
    method: 'GET',
    path: '/playlist.m3u',
    scope: 'key',
    title: 'Playlist ya IPTV (M3U)',
    summary: 'Orodha kamili ya channels kwa app za IPTV (Kodi, TiviMate, OTT Navigator). DASH yenye DRM inajumuisha mistari ya KODIPROP ya clearkey. Weka URL hii kwenye app kama "M3U URL".',
    params: [
      ...FILTER_PARAMS,
      { name: 'mode', in: 'query', required: false, desc: '"direct" (chaguo-msingi: link yenye token ya sasa) au "redirect" (kila channel inatumia /play/:id — haikwisha).' },
      { name: 'api_key', in: 'query', required: true, desc: 'Key yako (apps za IPTV haziwezi kutuma header).' },
    ],
    query: { category: 'Sports' },
    keyInQuery: true,
    responseType: 'text',
    response: `#EXTM3U
#EXTINF:-1 tvg-id="abc123" tvg-name="Azam Sport 1" tvg-logo="https://example.com/azam-sport-1.png" group-title="Sports",Azam Sport 1
#KODIPROP:inputstream.adaptive.manifest_type=mpd
#KODIPROP:inputstream.adaptive.license_type=clearkey
#KODIPROP:inputstream.adaptive.license_key=${CH_KID}:${CH_KEY}
${AZAM_WITH_TOKEN}`,
    notes: [
      'Tumia mode=redirect ili app ya IPTV isihitaji kupakia playlist upya token ikikwisha.',
      'VLC inacheza HLS tu; haiwezi DASH yenye ClearKey. Kodi / TiviMate / OTT Navigator zinaweza.',
    ],
  },
];

export const ERRORS_CHANNELS: { status: number; code: string; meaning: string }[] = [
  { status: 401, code: 'missing_key', meaning: 'Hukutuma key. Tumia header X-API-Key (au ?api_key= kwa players).' },
  { status: 401, code: 'invalid_key', meaning: 'Key si sahihi au imefutwa.' },
  { status: 403, code: 'key_disabled', meaning: 'Key imezimwa kwenye admin.' },
  { status: 403, code: 'wrong_key_type', meaning: 'Hii ni key ya Token API (type 1). Tumia endpoints za /v1.' },
  { status: 403, code: 'origin_not_allowed', meaning: 'Website uliyoitumia haipo kwenye orodha ya origins za key hii.' },
  { status: 404, code: 'channel_not_found', meaning: 'Channel haipo, au haimo kwenye mgao wa key hii.' },
  { status: 404, code: 'not_found', meaning: 'Endpoint haipo.' },
  { status: 405, code: 'method_not_allowed', meaning: 'Tumia GET.' },
  { status: 429, code: 'rate_limited', meaning: 'Maombi mengi mno. Subiri sekunde za header Retry-After.' },
  { status: 500, code: 'server_error', meaning: 'Hitilafu upande wetu. Jaribu tena.' },
  { status: 503, code: 'token_unavailable', meaning: 'Hakuna token kwa sasa, na channel ya Azam inaihitaji (hutokea kwenye /play).' },
];

export const LIMITS_CHANNELS: string[] = [
  'Kila key ina kikomo cha maombi kwa dakika. Kila mtazamaji anayeanza kucheza kupitia /play ni ombi moja, kwa hiyo weka kikomo kikubwa ukitumia /play kwa watazamaji wengi.',
  'Kikomo kinahesabiwa kwa kila server instance, kwa hiyo ni ulinzi wa jumla, si hesabu kamili.',
  'Mabadiliko ya key (kuzima, kufuta, kubadilisha channels zilizoshirikiwa) yanaonekana ndani ya takriban sekunde 30.',
  'Orodha ya channels huhifadhiwa sekunde ~30 na token sekunde 5, kwa hiyo channel mpya au iliyozimwa inaonekana ndani ya nusu dakika.',
  'Links za "direct" zina token ya sasa na zitakwisha muda. Tumia /play/:id au playlist ya mode=redirect kama unahitaji links za kudumu.',
  'Key inaonyeshwa MARA MOJA tu wakati wa kuunda. Hifadhiwa kama hash, hivyo haiwezi kurejeshwa — kama umeipoteza, tengeneza mpya na ufute ya zamani.',
];

export const SECURITY_CHANNELS: string[] = [
  'Mwenye key hii anapata kila kitu kinachohitajika kucheza channels ulizomshirikisha — pamoja na funguo za DRM (ukizirusu). Mpe key mtu/website unayemwamini tu, na tengeneza key tofauti kwa kila mteja.',
  '"Channels za malipo" zikiwashwa, website hiyo inaweza kuzionyesha kwa watumiaji wake bila kulipia kwako. Washa tu kama ni makubaliano yenu.',
  'URL ya playlist (?api_key=…) ina key ndani yake — itendee kama nywila. Ukiivujisha, zima key hiyo kwenye admin.',
  'Funguo za DRM zinapaswa kufika kwenye player ili ichezeshe, kwa hiyo zinaonekana kwa mtu anayeangalia network ya browser. Hii ni ya kawaida kwa mfumo wowote wa ClearKey — usitegemee kuzificha dhidi ya mtumiaji mwenye ujuzi.',
  'Ukitumia key kwenye browser, weka "Allowed origins" iwe website hiyo tu. Njia salama zaidi ni kupiga API kutoka server yako.',
  'Tuma key kwenye header (X-API-Key) kila inapowezekana; ?api_key= ni kwa players zisizoweza kutuma header.',
];

export const GUIDES_CHANNELS: Guide[] = [
  {
    id: 'iptv',
    title: '1. App ya IPTV (Kodi, TiviMate, OTT Navigator)',
    text: 'Njia ya haraka kuliko zote: weka URL ya playlist kwenye app. Kwa links zisizokwisha tumia mode=redirect. Unaweza kuchuja: &category=Sports au &type=hls.',
    lang: 'text',
    code: (base) => `# Playlist ya kawaida (links zenye token ya sasa)
${base}/playlist.m3u?api_key=YOUR_API_KEY

# Playlist yenye links zisizokwisha (kila channel inapitia /play)
${base}/playlist.m3u?api_key=YOUR_API_KEY&mode=redirect

# Sports tu
${base}/playlist.m3u?api_key=YOUR_API_KEY&mode=redirect&category=Sports`,
  },
  {
    id: 'page',
    title: '2. Ukurasa mmoja wa kucheza (HTML + Shaka + hls.js)',
    text: 'Faili moja unayoweza kuweka kwenye website yoyote: inaorodhesha channels na kuzicheza (DASH kwa Shaka pamoja na ClearKey, HLS kwa hls.js). Kwa production, piga API kutoka server yako badala ya kuweka key hapa.',
    lang: 'html',
    code: (base) => `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Channels</title>
<style>
  body { font-family: sans-serif; margin: 0; display: flex; height: 100vh; }
  #list { width: 260px; overflow: auto; border-right: 1px solid #ddd; }
  #list button { display: block; width: 100%; padding: 10px; text-align: left; border: 0; border-bottom: 1px solid #eee; background: #fff; cursor: pointer; }
  #list button:hover { background: #f3f3f3; }
  #main { flex: 1; background: #000; }
  video { width: 100%; height: 100%; }
</style>
<div id="list"></div>
<div id="main"><video id="v" controls autoplay playsinline></video></div>

<script src="https://cdn.jsdelivr.net/npm/shaka-player@4.7.11/dist/shaka-player.compiled.js"></script>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js"></script>
<script>
const API = "${base}";
const KEY = "YOUR_API_KEY";            // kwa production: piga API kutoka server yako
const video = document.getElementById("v");
let shakaPlayer = null, hls = null;
shaka.polyfill.installAll();

async function api(path) {
  const r = await fetch(API + path, { headers: { "X-API-Key": KEY } });
  const j = await r.json();
  if (!j.success) throw new Error(j.error.code);
  return j.data;
}

async function play(id) {
  const ch = await api("/channels/" + id);          // link mpya yenye token ya sasa
  if (hls) { hls.destroy(); hls = null; }
  if (shakaPlayer) { await shakaPlayer.destroy(); shakaPlayer = null; }

  if (ch.type === "dash") {
    shakaPlayer = new shaka.Player();
    await shakaPlayer.attach(video);
    if (ch.play.drm) {
      const clearKeys = {};
      ch.play.drm.keys.forEach((k) => { clearKeys[k.kid] = k.key; });
      shakaPlayer.configure({ drm: { clearKeys } });
    }
    await shakaPlayer.load(ch.play.url);
  } else if (window.Hls && Hls.isSupported()) {
    hls = new Hls();
    hls.loadSource(ch.play.url);
    hls.attachMedia(video);
  } else {
    video.src = ch.play.url;                         // Safari: HLS moja kwa moja
  }
}

(async () => {
  const data = await api("/channels");
  const list = document.getElementById("list");
  data.channels.forEach((ch) => {
    const b = document.createElement("button");
    b.textContent = ch.name;
    b.onclick = () => play(ch.id).catch((e) => alert(e.message));
    list.appendChild(b);
  });
})().catch((e) => document.body.append("Error: " + e.message));
</script>`,
  },
  {
    id: 'stable',
    title: '3. Kiungo kisichokwisha kwenye player yako mwenyewe',
    text: 'Kwa channels za HLS, URL ya /play inatosha. Kwa DASH yenye DRM, chukua kid/key kutoka /channels mara moja, kisha cheza URL ya /play kila wakati — token ikikwisha, player inapata link mpya yenyewe unapoanzisha upya.',
    lang: 'javascript',
    code: (base) => `// HLS – URL ya kudumu, hakuna kuhifadhi token
const hlsUrl = "${base}/play/CHANNEL_ID.m3u8?api_key=YOUR_API_KEY";
const hls = new Hls();
hls.loadSource(hlsUrl);
hls.attachMedia(document.querySelector("video"));

// DASH + ClearKey (Shaka) – funguo mara moja, URL ya /play kila mara
const res  = await fetch("${base}/channels/CHANNEL_ID", { headers: { "X-API-Key": "YOUR_API_KEY" } });
const { data } = await res.json();
const clearKeys = {};
data.play.drm.keys.forEach((k) => { clearKeys[k.kid] = k.key; });

const player = new shaka.Player();
await player.attach(document.querySelector("video"));
player.configure({ drm: { clearKeys } });
await player.load("${base}/play/CHANNEL_ID.mpd?api_key=YOUR_API_KEY");

// kosa la 403 / token imekwisha → pakia tena URL ile ile
player.addEventListener("error", () => player.load("${base}/play/CHANNEL_ID.mpd?api_key=YOUR_API_KEY"));`,
  },
];

// ── per-type selectors ──────────────────────────────────────────────────────

export const endpointsFor = (t: ApiType) => (t === 'token' ? ENDPOINTS_TOKEN : ENDPOINTS_CHANNELS);
export const errorsFor = (t: ApiType) => (t === 'token' ? ERRORS_TOKEN : ERRORS_CHANNELS);
export const limitsFor = (t: ApiType) => (t === 'token' ? LIMITS_TOKEN : LIMITS_CHANNELS);
export const securityFor = (t: ApiType) => (t === 'token' ? SECURITY_TOKEN : SECURITY_CHANNELS);
export const guidesFor = (t: ApiType) => (t === 'token' ? GUIDES_TOKEN : GUIDES_CHANNELS);

// ── markdown export ────────────────────────────────────────────────────────

const asText = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
const fenceFor = (ep: Endpoint) => (typeof ep.response === 'string' ? (ep.responseType === 'text' ? '' : 'http') : 'json');

export function buildMarkdown(type: ApiType = 'token', root: string = BASES[0].url): string {
  const base = apiBase(root, type);
  const t = API_TYPES[type];
  const L: string[] = [];
  L.push(`# RevonTech ${t.short} (${type === 'token' ? 'Type 1' : 'Type 2'})`, '');
  L.push(t.summary, '');
  L.push('## Haraka (dakika 2)', '');
  L.push('1. Fungua **Admin → API → Keys**, bonyeza **Tengeneza key mpya** na uchague **' + t.label + '**.');
  L.push('2. **Nakili key mara moja** — haionyeshwi tena.');
  L.push(type === 'token'
    ? `3. Jaribu: \`curl -H "X-API-Key: YOUR_API_KEY" ${base}/token\``
    : `3. Jaribu: \`curl -H "X-API-Key: YOUR_API_KEY" ${base}/channels\``, '');
  L.push('## Base URL', '');
  BASES.forEach((b) => L.push(`- ${b.label}: \`${apiBase(b.url, type)}\``));
  L.push('', '## Uthibitisho (Authentication)', '');
  L.push('Tuma key kwenye header:', '', '```', 'X-API-Key: rtk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', '```', '');
  L.push('Pia inakubalika `Authorization: Bearer <key>`. Njia ya `?api_key=` ' + (type === 'channels' ? 'ipo kwa ajili ya players na apps za IPTV zisizoweza kutuma header (`/play`, `/playlist.m3u`).' : 'ipo lakini haipendekezwi — inaonekana kwenye logs.'), '');
  L.push('Majibu ya JSON: mafanikio `{ "success": true, "data": … }`; kosa `{ "success": false, "error": { "code": "…", "message": "…" } }`.', '');
  if (type === 'token') {
    L.push('## Ruhusa (Scopes)', '', '| Scope | Maelezo |', '|---|---|');
    SCOPES.forEach((s) => L.push(`| \`${s.id}\` | ${s.desc}${s.sensitive ? ' **(nyeti)**' : ''} |`));
    L.push('');
  } else {
    L.push('## Unachoshiriki', '');
    L.push('Kila key ya Channels API ina mipangilio yake kwenye admin:', '');
    L.push('- **Channels zote**, **categories maalum**, au **channels ulizochagua**.');
    L.push('- **Channels za malipo**: zikiwa zimezimwa, key inaona channels BURE tu.');
    L.push('- **Funguo za DRM**: zikiwa zimezimwa, `play.drm` ni `null` (channels zilizosimbwa hazitacheza).');
    L.push('', 'Key ya type 1 haifanyi kazi hapa na key ya type 2 haifanyi kazi kwenye `/v1` — ni mifumo miwili tofauti.', '');
  }
  L.push('## Endpoints', '');
  endpointsFor(type).forEach((ep) => {
    L.push(`### ${ep.method} ${ep.path} — ${ep.title}`, '');
    L.push(ep.summary, '');
    L.push(`Ruhusa: ${ep.scope === null ? 'hakuna (public)' : ep.scope === 'key' ? 'key halali ya Channels API' : `\`${ep.scope}\``}`, '');
    if (ep.params.length) {
      L.push('| Parameter | Wapi | Lazima | Maelezo |', '|---|---|---|---|');
      ep.params.forEach((p) => L.push(`| \`${p.name}\` | ${p.in} | ${p.required ? 'ndiyo' : 'hapana'} | ${p.desc} |`));
      L.push('');
    }
    L.push('**Mfano wa ombi (cURL)**', '', '```bash', sample('curl', base, ep), '```', '');
    L.push('**Mfano wa jibu**', '', '```' + fenceFor(ep), asText(ep.response), '```', '');
    if (ep.notes?.length) { ep.notes.forEach((n) => L.push(`- ${n}`)); L.push(''); }
    L.push('<details><summary>Mifano kwa lugha nyingine</summary>', '');
    (['js', 'node', 'php', 'python'] as LangId[]).forEach((l) => {
      const label = LANGS.find((x) => x.id === l)!.label;
      const fence = l === 'js' || l === 'node' ? 'javascript' : l;
      L.push(`**${label}**`, '', '```' + fence, sample(l, base, ep), '```', '');
    });
    L.push('</details>', '');
  });
  L.push('## Mwongozo wa kuunganisha', '');
  guidesFor(type).forEach((g) => { L.push(`### ${g.title}`, '', g.text, '', '```' + g.lang, g.code(base), '```', ''); });
  L.push('## Makosa (Errors)', '', '| HTTP | code | Maana |', '|---|---|---|');
  errorsFor(type).forEach((e) => L.push(`| ${e.status} | \`${e.code}\` | ${e.meaning} |`));
  L.push('', '## Vikomo na tabia', '');
  limitsFor(type).forEach((x) => L.push(`- ${x}`));
  L.push('', '## Usalama', '');
  securityFor(type).forEach((x) => L.push(`- ${x}`));
  L.push('');
  return L.join('\n');
}
