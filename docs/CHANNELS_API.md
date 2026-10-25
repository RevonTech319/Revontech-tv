# RevonTech Channels API (Type 2)

Unashiriki CHANNELS ulizopakia kwenye RevonTech TV, zikiwa tayari kucheza: link yenye token, funguo za DRM, playlist ya IPTV na kiungo kisichokwisha.

## Haraka (dakika 2)

1. Fungua **Admin → API → Keys**, bonyeza **Tengeneza key mpya** na uchague **Type 2 · Channels API**.
2. **Nakili key mara moja** — haionyeshwi tena.
3. Jaribu: `curl -H "X-API-Key: YOUR_API_KEY" https://www.revontechtv.online/api/v2/channels`

## Base URL

- Domain yako (Vercel): `https://www.revontechtv.online/api/v2`

## Uthibitisho (Authentication)

Tuma key kwenye header:

```
X-API-Key: rtk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Pia inakubalika `Authorization: Bearer <key>`. Njia ya `?api_key=` ipo kwa ajili ya players na apps za IPTV zisizoweza kutuma header (`/play`, `/playlist.m3u`).

Majibu ya JSON: mafanikio `{ "success": true, "data": … }`; kosa `{ "success": false, "error": { "code": "…", "message": "…" } }`.

## Unachoshiriki

Kila key ya Channels API ina mipangilio yake kwenye admin:

- **Channels zote**, **categories maalum**, au **channels ulizochagua**.
- **Channels za malipo**: zikiwa zimezimwa, key inaona channels BURE tu.
- **Funguo za DRM**: zikiwa zimezimwa, `play.drm` ni `null` (channels zilizosimbwa hazitacheza).

Key ya type 1 haifanyi kazi hapa na key ya type 2 haifanyi kazi kwenye `/v1` — ni mifumo miwili tofauti.

## Endpoints

### GET /channels — Orodha ya channels zilizoshirikiwa

Channels zote ulizoruhusu kwa key hii. Kila moja ina play.url (tayari kucheza, ina token ya sasa) na play.drm (funguo za ClearKey, kama umeruhusu).

Ruhusa: key halali ya Channels API

| Parameter | Wapi | Lazima | Maelezo |
|---|---|---|---|
| `category` | query | hapana | Chuja kwa category (hailengi herufi kubwa/ndogo). |
| `type` | query | hapana | "dash" au "hls". |
| `q` | query | hapana | Tafuta kwa jina la channel. |

**Mfano wa ombi (cURL)**

```bash
curl \
  -G \
  "https://www.revontechtv.online/api/v2/channels" \
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
        "is_free": false,
        "drm_protected": true,
        "play": {
          "url": "https://cdnedgch2.azamtvltd.co.tz/tok_eyJhbGciOiJIUzUxMiJ9.eyJleHAiOjE3OTIyNDc4Njl9.xxxxxxxxxxxxxxxxxxxx/live/eds/AzamSport1/DASH/AzamSport1.mpd",
          "tokenized": true,
          "expires_at": "2026-10-22T14:37:49.000Z",
          "expires_in": 3600,
          "drm": {
            "type": "clearkey",
            "kid": "00112233445566778899aabbccddeeff",
            "key": "ffeeddccbbaa99887766554433221100",
            "keys": [
              {
                "kid": "00112233445566778899aabbccddeeff",
                "key": "ffeeddccbbaa99887766554433221100"
              }
            ]
          }
        }
      }
    ]
  }
}
```

- play.drm inaonekana tu kama key ina "Funguo za DRM" imewashwa. drm_protected=true inaonyesha channel imesimbwa hata kama funguo zimefichwa.
- play.url ina token ya sasa na itakwisha muda. Soma play.expires_in na uombe tena, au tumia /play/:id (inatoa link ya sasa kila mara).
- Orodha huhifadhiwa (cache) kwa takriban sekunde 30.

<details><summary>Mifano kwa lugha nyingine</summary>

**JavaScript (browser)**

```javascript
const url = new URL("https://www.revontechtv.online/api/v2/channels");
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
const url = new URL("https://www.revontechtv.online/api/v2/channels");
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
$ch = curl_init('https://www.revontechtv.online/api/v2/channels?' . http_build_query(['category' => 'Sports']));
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

res = requests.get('https://www.revontechtv.online/api/v2/channels', params={'category': 'Sports'}, headers={'X-API-Key': 'YOUR_API_KEY'}, timeout=10)
json = res.json()
if not json.get("success"):
    raise RuntimeError(json["error"]["code"])
print(json["data"])
```

</details>

### GET /channels/CHANNEL_ID — Channel moja

Taarifa kamili za channel moja, pamoja na link mpya ya kucheza. Channel isiyo kwenye mgao wa key hii inarudi 404.

Ruhusa: key halali ya Channels API

| Parameter | Wapi | Lazima | Maelezo |
|---|---|---|---|
| `CHANNEL_ID` | query | ndiyo | id kutoka kwenye /channels (sehemu ya njia, si query). |

**Mfano wa ombi (cURL)**

```bash
curl \
  "https://www.revontechtv.online/api/v2/channels/CHANNEL_ID" \
  -H "X-API-Key: YOUR_API_KEY"
```

**Mfano wa jibu**

```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "name": "Azam Sport 1",
    "logo": "https://example.com/azam-sport-1.png",
    "category": "Sports",
    "type": "dash",
    "is_free": false,
    "drm_protected": true,
    "play": {
      "url": "https://cdnedgch2.azamtvltd.co.tz/tok_eyJhbGciOiJIUzUxMiJ9.eyJleHAiOjE3OTIyNDc4Njl9.xxxxxxxxxxxxxxxxxxxx/live/eds/AzamSport1/DASH/AzamSport1.mpd",
      "tokenized": true,
      "expires_at": "2026-10-22T14:37:49.000Z",
      "expires_in": 3600,
      "drm": {
        "type": "clearkey",
        "kid": "00112233445566778899aabbccddeeff",
        "key": "ffeeddccbbaa99887766554433221100",
        "keys": [
          {
            "kid": "00112233445566778899aabbccddeeff",
            "key": "ffeeddccbbaa99887766554433221100"
          }
        ]
      }
    }
  }
}
```

<details><summary>Mifano kwa lugha nyingine</summary>

**JavaScript (browser)**

```javascript
const url = new URL("https://www.revontechtv.online/api/v2/channels/CHANNEL_ID");

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
const url = new URL("https://www.revontechtv.online/api/v2/channels/CHANNEL_ID");

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
$ch = curl_init('https://www.revontechtv.online/api/v2/channels/CHANNEL_ID');
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

res = requests.get('https://www.revontechtv.online/api/v2/channels/CHANNEL_ID', headers={'X-API-Key': 'YOUR_API_KEY'}, timeout=10)
json = res.json()
if not json.get("success"):
    raise RuntimeError(json["error"]["code"])
print(json["data"])
```

</details>

### GET /categories — Categories

Categories za channels zilizoshirikiwa na idadi ya channels kila moja.

Ruhusa: key halali ya Channels API

**Mfano wa ombi (cURL)**

```bash
curl \
  "https://www.revontechtv.online/api/v2/categories" \
  -H "X-API-Key: YOUR_API_KEY"
```

**Mfano wa jibu**

```json
{
  "success": true,
  "data": {
    "count": 2,
    "categories": [
      {
        "name": "News",
        "count": 4
      },
      {
        "name": "Sports",
        "count": 6
      }
    ]
  }
}
```

<details><summary>Mifano kwa lugha nyingine</summary>

**JavaScript (browser)**

```javascript
const url = new URL("https://www.revontechtv.online/api/v2/categories");

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
const url = new URL("https://www.revontechtv.online/api/v2/categories");

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
$ch = curl_init('https://www.revontechtv.online/api/v2/categories');
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

res = requests.get('https://www.revontechtv.online/api/v2/categories', headers={'X-API-Key': 'YOUR_API_KEY'}, timeout=10)
json = res.json()
if not json.get("success"):
    raise RuntimeError(json["error"]["code"])
print(json["data"])
```

</details>

### GET /play/CHANNEL_ID.m3u8 — Kiungo cha kucheza kisichokwisha (redirect)

URL ya kudumu ya channel. Kila unapoiomba, inakupeleka (302) kwenye link ya sasa yenye token mpya — hivyo hutawahi kuhifadhi link iliyokwisha. Weka moja kwa moja kwenye player yako.

Ruhusa: key halali ya Channels API

| Parameter | Wapi | Lazima | Maelezo |
|---|---|---|---|
| `CHANNEL_ID` | query | ndiyo | id ya channel (sehemu ya njia). Kiendelezi .m3u8 / .mpd ni hiari — kwa players zinazotegemea jina la faili. |
| `api_key` | query | ndiyo | Key yako. Players hawawezi kutuma header, kwa hiyo hapa key inaenda kwenye URL. |

**Mfano wa ombi (cURL)**

```bash
curl \
  -i \
  -G \
  "https://www.revontechtv.online/api/v2/play/CHANNEL_ID.m3u8" \
  --data-urlencode "api_key=YOUR_API_KEY"
```

**Mfano wa jibu**

```http
HTTP/1.1 302 Found
Location: https://cdnedgch2.azamtvltd.co.tz/tok_eyJhbGciOiJIUzUxMiJ9.eyJleHAiOjE3OTIyNDc4Njl9.xxxxxxxxxxxxxxxxxxxx/live/eds/AzamSport1/DASH/AzamSport1.mpd
```

- Channel ya DASH yenye DRM bado inahitaji kid/key kutoka /channels (player ya DASH inazihitaji).
- Azam ikikosa token kwa sasa, unapata 503 token_unavailable badala ya link isiyofanya kazi.

<details><summary>Mifano kwa lugha nyingine</summary>

**JavaScript (browser)**

```javascript
const url = new URL("https://www.revontechtv.online/api/v2/play/CHANNEL_ID.m3u8");
url.searchParams.set("api_key", "YOUR_API_KEY");

// Tumia URL hii moja kwa moja kama chanzo cha player — server inakupeleka kwenye stream ya sasa.
const video = document.querySelector("video");
video.src = url.toString();   // HLS: Safari moja kwa moja; vinginevyo hls.loadSource(url.toString())
```

**Node.js**

```javascript
const url = new URL("https://www.revontechtv.online/api/v2/play/CHANNEL_ID.m3u8");
url.searchParams.set("api_key", process.env.REVON_API_KEY);

const res = await fetch(url, { redirect: "manual" });
console.log(res.status, res.headers.get("location"));
```

**PHP**

```php
<?php
$ch = curl_init('https://www.revontechtv.online/api/v2/play/CHANNEL_ID.m3u8?' . http_build_query(['api_key' => 'YOUR_API_KEY']));
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_HEADER => true,
]);
$body = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo $body;   // HTTP 302 + Location: <link ya sasa>
```

**Python**

```python
import requests

res = requests.get('https://www.revontechtv.online/api/v2/play/CHANNEL_ID.m3u8', params={'api_key': 'YOUR_API_KEY'}, allow_redirects=False, timeout=10)
print(res.status_code, res.headers["Location"])
```

</details>

### GET /playlist.m3u — Playlist ya IPTV (M3U)

Orodha kamili ya channels kwa app za IPTV (Kodi, TiviMate, OTT Navigator). DASH yenye DRM inajumuisha mistari ya KODIPROP ya clearkey. Weka URL hii kwenye app kama "M3U URL".

Ruhusa: key halali ya Channels API

| Parameter | Wapi | Lazima | Maelezo |
|---|---|---|---|
| `category` | query | hapana | Chuja kwa category (hailengi herufi kubwa/ndogo). |
| `type` | query | hapana | "dash" au "hls". |
| `q` | query | hapana | Tafuta kwa jina la channel. |
| `mode` | query | hapana | "direct" (chaguo-msingi: link yenye token ya sasa) au "redirect" (kila channel inatumia /play/:id — haikwisha). |
| `api_key` | query | ndiyo | Key yako (apps za IPTV haziwezi kutuma header). |

**Mfano wa ombi (cURL)**

```bash
curl \
  -G \
  "https://www.revontechtv.online/api/v2/playlist.m3u" \
  --data-urlencode "category=Sports" \
  --data-urlencode "api_key=YOUR_API_KEY"
```

**Mfano wa jibu**

```
#EXTM3U
#EXTINF:-1 tvg-id="abc123" tvg-name="Azam Sport 1" tvg-logo="https://example.com/azam-sport-1.png" group-title="Sports",Azam Sport 1
#KODIPROP:inputstream.adaptive.manifest_type=mpd
#KODIPROP:inputstream.adaptive.license_type=clearkey
#KODIPROP:inputstream.adaptive.license_key=00112233445566778899aabbccddeeff:ffeeddccbbaa99887766554433221100
https://cdnedgch2.azamtvltd.co.tz/tok_eyJhbGciOiJIUzUxMiJ9.eyJleHAiOjE3OTIyNDc4Njl9.xxxxxxxxxxxxxxxxxxxx/live/eds/AzamSport1/DASH/AzamSport1.mpd
```

- Tumia mode=redirect ili app ya IPTV isihitaji kupakia playlist upya token ikikwisha.
- VLC inacheza HLS tu; haiwezi DASH yenye ClearKey. Kodi / TiviMate / OTT Navigator zinaweza.

<details><summary>Mifano kwa lugha nyingine</summary>

**JavaScript (browser)**

```javascript
const url = new URL("https://www.revontechtv.online/api/v2/playlist.m3u");
url.searchParams.set("category", "Sports");
url.searchParams.set("api_key", "YOUR_API_KEY");

const res = await fetch(url, {
  headers: {
  },
});
if (!res.ok) throw new Error("HTTP " + res.status);
console.log((await res.text()).slice(0, 500));
```

**Node.js**

```javascript
const url = new URL("https://www.revontechtv.online/api/v2/playlist.m3u");
url.searchParams.set("category", "Sports");
url.searchParams.set("api_key", process.env.REVON_API_KEY);

const res = await fetch(url, {
  headers: {
  },
});
if (!res.ok) throw new Error("HTTP " + res.status);
console.log((await res.text()).slice(0, 500));
```

**PHP**

```php
<?php
$ch = curl_init('https://www.revontechtv.online/api/v2/playlist.m3u?' . http_build_query(['category' => 'Sports', 'api_key' => 'YOUR_API_KEY']));
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
]);
$body = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($code !== 200) { die("API error: HTTP " . $code); }
echo $body;
```

**Python**

```python
import requests

res = requests.get('https://www.revontechtv.online/api/v2/playlist.m3u', params={'category': 'Sports', 'api_key': 'YOUR_API_KEY'}, timeout=10)
res.raise_for_status()
print(res.text[:500])
```

</details>

## Mwongozo wa kuunganisha

### 1. App ya IPTV (Kodi, TiviMate, OTT Navigator)

Njia ya haraka kuliko zote: weka URL ya playlist kwenye app. Kwa links zisizokwisha tumia mode=redirect. Unaweza kuchuja: &category=Sports au &type=hls.

```text
# Playlist ya kawaida (links zenye token ya sasa)
https://www.revontechtv.online/api/v2/playlist.m3u?api_key=YOUR_API_KEY

# Playlist yenye links zisizokwisha (kila channel inapitia /play)
https://www.revontechtv.online/api/v2/playlist.m3u?api_key=YOUR_API_KEY&mode=redirect

# Sports tu
https://www.revontechtv.online/api/v2/playlist.m3u?api_key=YOUR_API_KEY&mode=redirect&category=Sports
```

### 2. Ukurasa mmoja wa kucheza (HTML + Shaka + hls.js)

Faili moja unayoweza kuweka kwenye website yoyote: inaorodhesha channels na kuzicheza (DASH kwa Shaka pamoja na ClearKey, HLS kwa hls.js). Kwa production, piga API kutoka server yako badala ya kuweka key hapa.

```html
<!doctype html>
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
const API = "https://www.revontechtv.online/api/v2";
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
</script>
```

### 3. Kiungo kisichokwisha kwenye player yako mwenyewe

Kwa channels za HLS, URL ya /play inatosha. Kwa DASH yenye DRM, chukua kid/key kutoka /channels mara moja, kisha cheza URL ya /play kila wakati — token ikikwisha, player inapata link mpya yenyewe unapoanzisha upya.

```javascript
// HLS – URL ya kudumu, hakuna kuhifadhi token
const hlsUrl = "https://www.revontechtv.online/api/v2/play/CHANNEL_ID.m3u8?api_key=YOUR_API_KEY";
const hls = new Hls();
hls.loadSource(hlsUrl);
hls.attachMedia(document.querySelector("video"));

// DASH + ClearKey (Shaka) – funguo mara moja, URL ya /play kila mara
const res  = await fetch("https://www.revontechtv.online/api/v2/channels/CHANNEL_ID", { headers: { "X-API-Key": "YOUR_API_KEY" } });
const { data } = await res.json();
const clearKeys = {};
data.play.drm.keys.forEach((k) => { clearKeys[k.kid] = k.key; });

const player = new shaka.Player();
await player.attach(document.querySelector("video"));
player.configure({ drm: { clearKeys } });
await player.load("https://www.revontechtv.online/api/v2/play/CHANNEL_ID.mpd?api_key=YOUR_API_KEY");

// kosa la 403 / token imekwisha → pakia tena URL ile ile
player.addEventListener("error", () => player.load("https://www.revontechtv.online/api/v2/play/CHANNEL_ID.mpd?api_key=YOUR_API_KEY"));
```

## Makosa (Errors)

| HTTP | code | Maana |
|---|---|---|
| 401 | `missing_key` | Hukutuma key. Tumia header X-API-Key (au ?api_key= kwa players). |
| 401 | `invalid_key` | Key si sahihi au imefutwa. |
| 403 | `key_disabled` | Key imezimwa kwenye admin. |
| 403 | `wrong_key_type` | Hii ni key ya Token API (type 1). Tumia endpoints za /v1. |
| 403 | `origin_not_allowed` | Website uliyoitumia haipo kwenye orodha ya origins za key hii. |
| 404 | `channel_not_found` | Channel haipo, au haimo kwenye mgao wa key hii. |
| 404 | `not_found` | Endpoint haipo. |
| 405 | `method_not_allowed` | Tumia GET. |
| 429 | `rate_limited` | Maombi mengi mno. Subiri sekunde za header Retry-After. |
| 500 | `server_error` | Hitilafu upande wetu. Jaribu tena. |
| 503 | `token_unavailable` | Hakuna token kwa sasa, na channel ya Azam inaihitaji (hutokea kwenye /play). |

## Vikomo na tabia

- Kila key ina kikomo cha maombi kwa dakika. Kila mtazamaji anayeanza kucheza kupitia /play ni ombi moja, kwa hiyo weka kikomo kikubwa ukitumia /play kwa watazamaji wengi.
- Kikomo kinahesabiwa kwa kila server instance, kwa hiyo ni ulinzi wa jumla, si hesabu kamili.
- Mabadiliko ya key (kuzima, kufuta, kubadilisha channels zilizoshirikiwa) yanaonekana ndani ya takriban sekunde 30.
- Orodha ya channels huhifadhiwa sekunde ~30 na token sekunde 5, kwa hiyo channel mpya au iliyozimwa inaonekana ndani ya nusu dakika.
- Links za "direct" zina token ya sasa na zitakwisha muda. Tumia /play/:id au playlist ya mode=redirect kama unahitaji links za kudumu.
- Key inaonyeshwa MARA MOJA tu wakati wa kuunda. Hifadhiwa kama hash, hivyo haiwezi kurejeshwa — kama umeipoteza, tengeneza mpya na ufute ya zamani.

## Usalama

- Mwenye key hii anapata kila kitu kinachohitajika kucheza channels ulizomshirikisha — pamoja na funguo za DRM (ukizirusu). Mpe key mtu/website unayemwamini tu, na tengeneza key tofauti kwa kila mteja.
- "Channels za malipo" zikiwashwa, website hiyo inaweza kuzionyesha kwa watumiaji wake bila kulipia kwako. Washa tu kama ni makubaliano yenu.
- URL ya playlist (?api_key=…) ina key ndani yake — itendee kama nywila. Ukiivujisha, zima key hiyo kwenye admin.
- Funguo za DRM zinapaswa kufika kwenye player ili ichezeshe, kwa hiyo zinaonekana kwa mtu anayeangalia network ya browser. Hii ni ya kawaida kwa mfumo wowote wa ClearKey — usitegemee kuzificha dhidi ya mtumiaji mwenye ujuzi.
- Ukitumia key kwenye browser, weka "Allowed origins" iwe website hiyo tu. Njia salama zaidi ni kupiga API kutoka server yako.
- Tuma key kwenye header (X-API-Key) kila inapowezekana; ?api_key= ni kwa players zisizoweza kutuma header.
