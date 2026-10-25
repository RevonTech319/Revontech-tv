# RevonTech Token API (Type 1)

Unashiriki TOKEN tu (au unaweka token kwenye links zako). Website nyingine ina channels zake mwenyewe.

## Haraka (dakika 2)

1. Fungua **Admin → API → Keys**, bonyeza **Tengeneza key mpya** na uchague **Type 1 · Token API**.
2. **Nakili key mara moja** — haionyeshwi tena.
3. Jaribu: `curl -H "X-API-Key: YOUR_API_KEY" https://www.revontechtv.online/api/v1/token`

## Base URL

- Domain yako (Vercel): `https://www.revontechtv.online/api/v1`

## Uthibitisho (Authentication)

Tuma key kwenye header:

```
X-API-Key: rtk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Pia inakubalika `Authorization: Bearer <key>`. Njia ya `?api_key=` ipo lakini haipendekezwi — inaonekana kwenye logs.

Majibu ya JSON: mafanikio `{ "success": true, "data": … }`; kosa `{ "success": false, "error": { "code": "…", "message": "…" } }`.

## Ruhusa (Scopes)

| Scope | Maelezo |
|---|---|
| `token` | Kusoma token ya sasa (GET /token). |
| `resolve` | Kuweka token kwenye link ya Azam (GET/POST /resolve). |
| `channels` | Orodha ya channels BURE zenye link tayari za kucheza (GET /channels). |
| `premium` | Pamoja na channels za malipo kwenye /channels. Mtu mwenye key hii anaweza kuzicheza bila kulipia kwako. **(nyeti)** |
| `drm` | Pamoja na funguo za DRM (kid/key) kwenye /channels. **(nyeti)** |

## Endpoints

### GET /status — Status (afya ya API)

Hakuna key inayohitajika. Tumia kwa uptime monitor au kuhakikisha API iko hewani.

Ruhusa: hakuna (public)

**Mfano wa ombi (cURL)**

```bash
curl \
  "https://www.revontechtv.online/api/v1/status"
```

**Mfano wa jibu**

```json
{
  "ok": true,
  "service": "revontech-token-api",
  "version": "1",
  "time": "2026-10-22T10:00:00.000Z"
}
```

<details><summary>Mifano kwa lugha nyingine</summary>

**JavaScript (browser)**

```javascript
const url = new URL("https://www.revontechtv.online/api/v1/status");

const res = await fetch(url, {
  headers: {
  },
});
const json = await res.json();
console.log(json);
```

**Node.js**

```javascript
const url = new URL("https://www.revontechtv.online/api/v1/status");

const res = await fetch(url, {
  headers: {
  },
});
const json = await res.json();
console.log(json);
```

**PHP**

```php
<?php
$ch = curl_init('https://www.revontechtv.online/api/v1/status');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
]);
$body = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$json = json_decode($body, true);
print_r($json);
```

**Python**

```python
import requests

res = requests.get('https://www.revontechtv.online/api/v1/status', timeout=10)
json = res.json()
print(json)
```

</details>

### GET /token — Pata token ya sasa

Inarudisha CDN token ya sasa ile ile inayotumika kwenye app yako, pamoja na muda wa kuisha.

Ruhusa: `token`

**Mfano wa ombi (cURL)**

```bash
curl \
  "https://www.revontechtv.online/api/v1/token" \
  -H "X-API-Key: YOUR_API_KEY"
```

**Mfano wa jibu**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzUxMiJ9.eyJleHAiOjE3OTIyNDc4Njl9.xxxxxxxxxxxxxxxxxxxx",
    "expires_at": "2026-10-22T14:37:49.000Z",
    "expires_in": 3600,
    "expired": false,
    "updated_at": "2026-10-22T10:00:00.000Z",
    "source": "auto"
  }
}
```

- expires_in ni sekunde zilizobaki. expired=true inamaanisha token ya dashboard imekwisha muda (hali ya hatari — angalia ukurasa wa Token).
- Usiite API kwa kila mtazamaji. Hifadhi (cache) token hadi expires_in - 60s, au angalau dakika 1.

<details><summary>Mifano kwa lugha nyingine</summary>

**JavaScript (browser)**

```javascript
const url = new URL("https://www.revontechtv.online/api/v1/token");

const res = await fetch(url, {
  headers: {
    "X-API-Key": "YOUR_API_KEY",
  },
});
const json = await res.json();
if (!json.success) throw new Error(json.error.code + ": " + json.error.message);
console.log(json.data);
```

**Node.js**

```javascript
const url = new URL("https://www.revontechtv.online/api/v1/token");

const res = await fetch(url, {
  headers: {
    "X-API-Key": process.env.REVON_API_KEY,
  },
});
const json = await res.json();
if (!json.success) throw new Error(json.error.code + ": " + json.error.message);
console.log(json.data);
```

**PHP**

```php
<?php
$ch = curl_init('https://www.revontechtv.online/api/v1/token');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_HTTPHEADER => ['X-API-Key: YOUR_API_KEY'],
]);
$body = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$json = json_decode($body, true);
if ($code !== 200 || empty($json['success'])) {
    die('API error: ' . ($json['error']['code'] ?? $code));
}
print_r($json['data']);
```

**Python**

```python
import requests

res = requests.get('https://www.revontechtv.online/api/v1/token', headers={'X-API-Key': 'YOUR_API_KEY'}, timeout=10)
json = res.json()
if not json.get("success"):
    raise RuntimeError(json["error"]["code"])
print(json["data"])
```

</details>

### GET /resolve — Weka token kwenye link moja

Unatuma link ya Azam (safi au yenye token ya zamani) na unarudishiwa link tayari kucheza. Link za seva nyingine zinarudi kama zilivyo (tokenized=false).

Ruhusa: `resolve`

| Parameter | Wapi | Lazima | Maelezo |
|---|---|---|---|
| `url` | query | ndiyo | Link kamili ya http(s) ya stream. |

**Mfano wa ombi (cURL)**

```bash
curl \
  -G \
  "https://www.revontechtv.online/api/v1/resolve" \
  -H "X-API-Key: YOUR_API_KEY" \
  --data-urlencode "url=https://cdnedgch2.azamtvltd.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd"
```

**Mfano wa jibu**

```json
{
  "success": true,
  "data": {
    "url": "https://cdnedgch2.azamtvltd.co.tz/tok_eyJhbGciOiJIUzUxMiJ9.eyJleHAiOjE3OTIyNDc4Njl9.xxxxxxxxxxxxxxxxxxxx/live/eds/AzamSport1/DASH/AzamSport1.mpd",
    "tokenized": true,
    "expires_at": "2026-10-22T14:37:49.000Z",
    "expires_in": 3600,
    "expired": false
  }
}
```

<details><summary>Mifano kwa lugha nyingine</summary>

**JavaScript (browser)**

```javascript
const url = new URL("https://www.revontechtv.online/api/v1/resolve");
url.searchParams.set("url", "https://cdnedgch2.azamtvltd.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd");

const res = await fetch(url, {
  headers: {
    "X-API-Key": "YOUR_API_KEY",
  },
});
const json = await res.json();
if (!json.success) throw new Error(json.error.code + ": " + json.error.message);
console.log(json.data);
```

**Node.js**

```javascript
const url = new URL("https://www.revontechtv.online/api/v1/resolve");
url.searchParams.set("url", "https://cdnedgch2.azamtvltd.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd");

const res = await fetch(url, {
  headers: {
    "X-API-Key": process.env.REVON_API_KEY,
  },
});
const json = await res.json();
if (!json.success) throw new Error(json.error.code + ": " + json.error.message);
console.log(json.data);
```

**PHP**

```php
<?php
$ch = curl_init('https://www.revontechtv.online/api/v1/resolve?' . http_build_query(['url' => 'https://cdnedgch2.azamtvltd.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd']));
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_HTTPHEADER => ['X-API-Key: YOUR_API_KEY'],
]);
$body = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$json = json_decode($body, true);
if ($code !== 200 || empty($json['success'])) {
    die('API error: ' . ($json['error']['code'] ?? $code));
}
print_r($json['data']);
```

**Python**

```python
import requests

res = requests.get('https://www.revontechtv.online/api/v1/resolve', params={'url': 'https://cdnedgch2.azamtvltd.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd'}, headers={'X-API-Key': 'YOUR_API_KEY'}, timeout=10)
json = res.json()
if not json.get("success"):
    raise RuntimeError(json["error"]["code"])
print(json["data"])
```

</details>

### POST /resolve — Weka token kwenye links nyingi

Hadi links 50 kwa ombi moja. Jibu huwa na items kila wakati, kwa mpangilio uleule.

Ruhusa: `resolve`

| Parameter | Wapi | Lazima | Maelezo |
|---|---|---|---|
| `urls` | body | ndiyo | Array ya links (max 50), kila moja ianze na http:// au https://. |
| `Content-Type` | header | ndiyo | application/json |

**Mfano wa ombi (cURL)**

```bash
curl \
  -X POST \
  "https://www.revontechtv.online/api/v1/resolve" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"urls":["https://cdnedgch2.azamtvltd.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd","https://other.example.com/live/index.m3u8"]}'
```

**Mfano wa jibu**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "input": "https://cdnedgch2.azamtvltd.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd",
        "url": "https://cdnedgch2.azamtvltd.co.tz/tok_eyJhbGciOiJIUzUxMiJ9.eyJleHAiOjE3OTIyNDc4Njl9.xxxxxxxxxxxxxxxxxxxx/live/eds/AzamSport1/DASH/AzamSport1.mpd",
        "tokenized": true
      },
      {
        "input": "https://other.example.com/live/index.m3u8",
        "url": "https://other.example.com/live/index.m3u8",
        "tokenized": false
      }
    ],
    "expires_at": "2026-10-22T14:37:49.000Z",
    "expires_in": 3600,
    "expired": false
  }
}
```

<details><summary>Mifano kwa lugha nyingine</summary>

**JavaScript (browser)**

```javascript
const url = new URL("https://www.revontechtv.online/api/v1/resolve");

const res = await fetch(url, {
  method: "POST",
  headers: {
    "X-API-Key": "YOUR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    "urls": [
      "https://cdnedgch2.azamtvltd.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd",
      "https://other.example.com/live/index.m3u8"
    ]
  }),
});
const json = await res.json();
if (!json.success) throw new Error(json.error.code + ": " + json.error.message);
console.log(json.data);
```

**Node.js**

```javascript
const url = new URL("https://www.revontechtv.online/api/v1/resolve");

const res = await fetch(url, {
  method: "POST",
  headers: {
    "X-API-Key": process.env.REVON_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    "urls": [
      "https://cdnedgch2.azamtvltd.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd",
      "https://other.example.com/live/index.m3u8"
    ]
  }),
});
const json = await res.json();
if (!json.success) throw new Error(json.error.code + ": " + json.error.message);
console.log(json.data);
```

**PHP**

```php
<?php
$ch = curl_init('https://www.revontechtv.online/api/v1/resolve');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_HTTPHEADER => ['X-API-Key: YOUR_API_KEY', 'Content-Type: application/json'],
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode(['urls' => ['https://cdnedgch2.azamtvltd.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd', 'https://other.example.com/live/index.m3u8']]),
]);
$body = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$json = json_decode($body, true);
if ($code !== 200 || empty($json['success'])) {
    die('API error: ' . ($json['error']['code'] ?? $code));
}
print_r($json['data']);
```

**Python**

```python
import requests

res = requests.post('https://www.revontechtv.online/api/v1/resolve', json={"urls":["https://cdnedgch2.azamtvltd.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd","https://other.example.com/live/index.m3u8"]}, headers={'X-API-Key': 'YOUR_API_KEY'}, timeout=10)
json = res.json()
if not json.get("success"):
    raise RuntimeError(json["error"]["code"])
print(json["data"])
```

</details>

### GET /channels — Orodha ya channels

Channels zinazotumika, kila moja ikiwa na stream_url tayari yenye token. Channels za malipo zinahitaji scope "premium"; funguo za DRM zinahitaji scope "drm".

Ruhusa: `channels`

| Parameter | Wapi | Lazima | Maelezo |
|---|---|---|---|
| `category` | query | hapana | Chuja kwa category (hailengi herufi kubwa/ndogo). |
| `type` | query | hapana | "dash" au "hls". |

**Mfano wa ombi (cURL)**

```bash
curl \
  -G \
  "https://www.revontechtv.online/api/v1/channels" \
  -H "X-API-Key: YOUR_API_KEY" \
  --data-urlencode "category=Sports"
```

**Mfano wa jibu**

```json
{
  "success": true,
  "data": {
    "count": 1,
    "token_expires_at": "2026-10-22T14:37:49.000Z",
    "token_expired": false,
    "channels": [
      {
        "id": "abc123",
        "name": "Azam Sport 1",
        "logo": "https://example.com/azam-sport-1.png",
        "category": "Sports",
        "type": "dash",
        "is_free": true,
        "stream_url": "https://cdnedgch2.azamtvltd.co.tz/tok_eyJhbGciOiJIUzUxMiJ9.eyJleHAiOjE3OTIyNDc4Njl9.xxxxxxxxxxxxxxxxxxxx/live/eds/AzamSport1/DASH/AzamSport1.mpd",
        "tokenized": true,
        "drm": {
          "kid": "00112233445566778899aabbccddeeff",
          "key": "ffeeddccbbaa99887766554433221100"
        }
      }
    ]
  }
}
```

- Sehemu ya "drm" inaonekana tu kama key ina scope "drm" na channel ina funguo.
- Orodha huhifadhiwa (cache) kwa takriban sekunde 30.

<details><summary>Mifano kwa lugha nyingine</summary>

**JavaScript (browser)**

```javascript
const url = new URL("https://www.revontechtv.online/api/v1/channels");
url.searchParams.set("category", "Sports");

const res = await fetch(url, {
  headers: {
    "X-API-Key": "YOUR_API_KEY",
  },
});
const json = await res.json();
if (!json.success) throw new Error(json.error.code + ": " + json.error.message);
console.log(json.data);
```

**Node.js**

```javascript
const url = new URL("https://www.revontechtv.online/api/v1/channels");
url.searchParams.set("category", "Sports");

const res = await fetch(url, {
  headers: {
    "X-API-Key": process.env.REVON_API_KEY,
  },
});
const json = await res.json();
if (!json.success) throw new Error(json.error.code + ": " + json.error.message);
console.log(json.data);
```

**PHP**

```php
<?php
$ch = curl_init('https://www.revontechtv.online/api/v1/channels?' . http_build_query(['category' => 'Sports']));
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_HTTPHEADER => ['X-API-Key: YOUR_API_KEY'],
]);
$body = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$json = json_decode($body, true);
if ($code !== 200 || empty($json['success'])) {
    die('API error: ' . ($json['error']['code'] ?? $code));
}
print_r($json['data']);
```

**Python**

```python
import requests

res = requests.get('https://www.revontechtv.online/api/v1/channels', params={'category': 'Sports'}, headers={'X-API-Key': 'YOUR_API_KEY'}, timeout=10)
json = res.json()
if not json.get("success"):
    raise RuntimeError(json["error"]["code"])
print(json["data"])
```

</details>

## Mwongozo wa kuunganisha

### 1. Njia salama (inapendekezwa): proxy ya PHP kwenye server yako

Browser ya wageni inaita token.php kwenye website YAKO; key inabaki kwenye server na haionekani popote. Faili hii pia ina cache ya sekunde 30, hivyo hata wageni 10,000 hawazidishi kikomo.

```php
<?php
// token.php – kwenye server yako (key haitoki hapa)
header('Content-Type: application/json');
header('Cache-Control: public, max-age=30');

$API_KEY = getenv('REVON_API_KEY');            // weka key kwenye environment, si kwenye code
$cache   = sys_get_temp_dir() . '/revon_token.json';

if (is_file($cache) && time() - filemtime($cache) < 30) {
    readfile($cache);
    exit;
}

$ch = curl_init('https://www.revontechtv.online/api/v1/token');
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
}
```

### 2. Pata token na uihifadhi (JavaScript)

Msaidizi mdogo anayeuliza API mara moja kwa dakika bila kujali watazamaji wangapi, na kuomba token mpya kabla haijaisha. Ikiwa unatumia proxy ya hatua 1, badilisha URL iwe /token.php na uondoe header ya key.

```javascript
// tokenClient.js
let cached = null;

export async function getToken() {
  const now = Date.now();
  if (cached && now < cached.refreshAt) return cached.token;

  const res = await fetch("https://www.revontechtv.online/api/v1/token", {
    headers: { "X-API-Key": "YOUR_API_KEY" },   // au piga proxy yako ya PHP badala yake
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error.code);

  const d = json.data;
  // omba mpya sekunde 60 kabla ya kuisha, lakini si mara nyingi kuliko kila dakika 1
  const ttl = d.expires_in != null ? Math.max(60, d.expires_in - 60) : 120;
  cached = { token: d.token, refreshAt: now + ttl * 1000 };
  return d.token;
}
```

### 3. Cheza channel ya Azam kwenye website nyingine

Njia rahisi ni /resolve: unaipa link safi na inarudisha link tayari kucheza. Weka kwenye Shaka Player, dash.js au hls.js. Token inapoisha (au mchezo ukitoa 403), omba link mpya na ucheze tena.

```javascript
const CLEAN = "https://cdnedgch2.azamtvltd.co.tz/live/eds/AzamSport1/DASH/AzamSport1.mpd";

async function getPlayableUrl() {
  const res = await fetch("https://www.revontechtv.online/api/v1/resolve?url=" + encodeURIComponent(CLEAN), {
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
});
```

## Makosa (Errors)

| HTTP | code | Maana |
|---|---|---|
| 400 | `bad_request` | Ombi lina kasoro (url haipo, si http(s), au zaidi ya 50). |
| 401 | `missing_key` | Hukutuma key. Tumia header X-API-Key. |
| 401 | `invalid_key` | Key si sahihi au imefutwa. |
| 403 | `key_disabled` | Key imezimwa kwenye admin. |
| 403 | `scope_missing` | Key haina ruhusa (scope) ya endpoint hii. |
| 403 | `origin_not_allowed` | Website uliyoitumia haipo kwenye orodha ya origins za key hii. |
| 403 | `wrong_key_type` | Hii ni key ya Channels API (type 2). Tumia endpoints za /v2. |
| 404 | `not_found` | Endpoint haipo. |
| 405 | `method_not_allowed` | Method si sahihi kwa endpoint hii. |
| 429 | `rate_limited` | Maombi mengi mno. Subiri sekunde za header Retry-After. |
| 500 | `server_error` | Hitilafu upande wetu. Jaribu tena. |
| 503 | `token_unavailable` | Hakuna token kwa sasa (angalia ukurasa wa Token kwenye admin). |

## Vikomo na tabia

- Kila key ina kikomo cha maombi kwa dakika (chaguo-msingi 60). Likizidi unapata 429 na header Retry-After.
- Kikomo kinahesabiwa kwa kila server instance, kwa hiyo ni ulinzi wa jumla, si hesabu kamili.
- Key ikizimwa au ikifutwa, athari huonekana ndani ya takriban sekunde 30.
- Token inahifadhiwa sekunde 5 upande wa API; orodha ya channels sekunde 30.
- Key inaonyeshwa MARA MOJA tu wakati wa kuunda. Hifadhiwa kama hash, hivyo haiwezi kurejeshwa — kama umeipoteza, tengeneza mpya na ufute ya zamani.

## Usalama

- Njia salama zaidi: piga API kutoka SERVER yako (PHP/Node/Python) na umpe browser matokeo tu — key haionekani kwa mtu yeyote.
- Ukilazimika kuiita moja kwa moja kutoka browser, key itaonekana kwenye page source. Weka "Allowed origins" ya key hiyo iwe website yako tu, na upe scope ndogo (token/resolve) tu.
- Epuka scope "premium" na "drm" kwa key itakayotumika kwenye browser.
- Tuma key kwenye header (X-API-Key au Authorization: Bearer). Njia ya ?api_key= ipo lakini inaonekana kwenye logs za server — usiitumie isipokuwa lazima.
- Tengeneza key tofauti kwa kila website/mteja ili uweze kuzima moja bila kuathiri nyingine.
