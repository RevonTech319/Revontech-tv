/**
 * Firebase Cloud Functions for RevonTech.
 *
 * refreshCdnToken (scheduled): Every 2 minutes, fetches the latest CDN token
 * from tweve.online and writes it to Firestore doc `tokens/global`. The user
 * website reads that doc (via onSnapshot) so playback always has a fresh token
 * without any client-side CORS worries.
 *
 * refreshCdnTokenHttp (HTTPS): Manual trigger for the same logic — useful for
 * testing or for the admin panel to force a refresh from the UI.
 * 
 * onSubscriptionCreate (Firestore trigger): When a subscription becomes 'active',
 * checks if the user was referred and credits the referrer with commission.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createTokenApi } = require('./tokenApi');

initializeApp();

const TOKEN_URL = 'https://www.tweve.online/api/cdn-token?key=twv_MHHEAjtKJBwCsjk3aMinGOwX';
const TOKEN_DOC_PATH = 'tokens/global';

/** Parse a raw response body (JSON or plain text) into a clean token string. */
function parseTokenResponse(raw) {
  let value = '';
  try {
    const j = JSON.parse(raw);
    value = j.token || j.value || j.cdntoken || j.data || '';
  } catch (_e) {
    value = raw;
  }
  return (value || '').toString().trim().replace(/^"|"$/g, '');
}

async function fetchAndStoreToken() {
  let text = '';
  try {
    const res = await fetch(TOKEN_URL, { cache: 'no-store' });
    if (res.ok) {
      text = await res.text();
    }
  } catch (err) {
    logger.warn('Direct fetch from TOKEN_URL failed, trying proxy fallback', { error: err.message });
  }

  // Fallback via proxy if direct fetch failed or returned non-200
  if (!text) {
    try {
      const proxyRes = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(TOKEN_URL), { cache: 'no-store' });
      if (proxyRes.ok) {
        text = await proxyRes.text();
      }
    } catch (proxyErr) {
      logger.warn('Proxy fallback fetch also failed', { error: proxyErr.message });
    }
  }

  const value = parseTokenResponse(text);
  if (!value || value.length < 10) {
    throw new Error('Upstream returned empty or too-short token');
  }

  const db = getFirestore();
  await db.doc(TOKEN_DOC_PATH).set(
    {
      value,
      source: 'auto',
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return value;
}

exports.refreshCdnToken = onSchedule(
  {
    schedule: 'every 2 minutes',
    timeoutSeconds: 60,
    memory: '256MiB',
    region: 'us-central1',
    retryCount: 2,
  },
  async () => {
    try {
      const value = await fetchAndStoreToken();
      logger.info('Refreshed CDN token', { length: value.length });
    } catch (err) {
      logger.error('CDN token refresh failed', { error: err.message });
      throw err;
    }
  }
);

exports.refreshCdnTokenHttp = onRequest(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
    region: 'us-central1',
    cors: true,
  },
  async (_req, res) => {
    try {
      const value = await fetchAndStoreToken();
      res.status(200).json({ ok: true, length: value.length });
    } catch (err) {
      logger.error('Manual CDN token refresh failed', { error: err.message });
      res.status(502).json({ ok: false, error: err.message });
    }
  }
);

/**
 * Helper: Processes referral rewards when a referred user buys a package.
 * Inviter gets free subscription days for each package purchase and any future repeat purchases!
 */
async function processReferralReward(db, subscriptionId, subscription) {
  try {
    // Only process active, paid subscriptions (not free or referral rewards)
    if (subscription.status !== 'active' || subscription.gateway === 'referral' || !subscription.amount || subscription.amount <= 0) {
      return;
    }

    // Check if this subscription has already been credited
    if (subscription.referral_credited) {
      logger.info('Referral already credited for this subscription', { subscriptionId });
      return;
    }

    const userId = subscription.user_id;
    if (!userId) return;

    // Get the user's profile to check who referred them
    const profileDoc = await db.doc(`profiles/${userId}`).get();
    if (!profileDoc.exists) {
      logger.info('Profile not found for user', { userId });
      return;
    }

    const profileData = profileDoc.data();
    const referredBy = profileData.referred_by;
    if (!referredBy) {
      logger.info('User was not referred by anyone', { userId });
      return;
    }

    // Find the referrer by referral_code
    const referrerQuery = await db.collection('profiles').where('referral_code', '==', referredBy).get();
    if (referrerQuery.empty) {
      logger.warn('Referrer not found for code', { referredBy });
      return;
    }

    const referrerDoc = referrerQuery.docs[0];
    const referrerId = referrerDoc.id;
    const referrerData = referrerDoc.data() || {};

    // Calculate free package days for the inviter based on purchased plan
    let rewardDays = 1;
    const planStr = (subscription.plan || '').toLowerCase();
    if (planStr.includes('miezi 3') || planStr.includes('3 month') || planStr.includes('miezi mitatu')) {
      rewardDays = 15;
    } else if (planStr.includes('month') || planStr.includes('mwezi') || planStr.includes('mmoja')) {
      rewardDays = 7;
    } else if (planStr.includes('week2') || planStr.includes('wiki mbili') || planStr.includes('week 2') || planStr.includes('week_2')) {
      rewardDays = 4;
    } else if (planStr.includes('week') || planStr.includes('wiki')) {
      rewardDays = 2;
    } else {
      rewardDays = 1; // 1 Day plan = 1 Free day
    }

    // Calculate new expiry date for the referrer (extend if active, or start fresh from now)
    const now = new Date();
    let baseDate = now;
    if (referrerData.expires_at) {
      const rawExp = referrerData.expires_at;
      const d = (rawExp && typeof rawExp.toDate === 'function') ? rawExp.toDate() : new Date(rawExp);
      if (!isNaN(d.getTime()) && d > now) {
        baseDate = d;
      }
    }
    const newExp = new Date(baseDate.getTime() + (rewardDays * 24 * 60 * 60 * 1000));

    // Calculate commission percentage from settings
    const settingsDoc = await db.doc('settings/general_settings').get();
    const commissionPercentage = settingsDoc.exists ? (settingsDoc.data().referral_commission_percentage || 10) : 10;
    const commissionAmount = (subscription.amount * commissionPercentage) / 100;

    // Track buyer purchase details on referrer profile
    const existingBuyers = referrerData.referred_buyers || {};
    const previousBuyerInfo = existingBuyers[userId] || { purchases_count: 0, reward_days_earned: 0 };
    const updatedBuyerInfo = {
      purchases_count: (previousBuyerInfo.purchases_count || 0) + 1,
      reward_days_earned: (previousBuyerInfo.reward_days_earned || 0) + rewardDays,
      last_purchased_at: now.toISOString(),
      display_name: profileData.display_name || 'Mteja',
      phone: profileData.phone || null,
      plan: subscription.plan || 'Kifurushi'
    };

    // 1. Update referrer profile: activate subscription, extend expiry, and add reward days
    await db.doc(`profiles/${referrerId}`).set({
      plan: 'Referral VIP',
      is_active: true,
      expires_at: newExp.toISOString(),
      referral_reward_days: FieldValue.increment(rewardDays),
      referral_paid_count: FieldValue.increment(1),
      pending_commissions: FieldValue.increment(commissionAmount),
      referred_buyers: {
        ...existingBuyers,
        [userId]: updatedBuyerInfo
      }
    }, { merge: true });

    // 2. Add an active referral reward subscription record for the referrer
    await db.collection('subscriptions').add({
      user_id: referrerId,
      plan: 'Referral VIP',
      amount: 0,
      duration_days: rewardDays,
      gateway: 'referral',
      status: 'active',
      starts_at: now.toISOString(),
      expires_at: newExp.toISOString(),
      created_at: FieldValue.serverTimestamp(),
      buyer_id: userId,
      buyer_subscription_id: subscriptionId,
      notes: `Zawadi ya mwaliko kutoka kwa ${profileData.display_name || 'rafiki'}`
    });

    // 3. Mark buyer's subscription as credited so it is never double-rewarded
    await db.doc(`subscriptions/${subscriptionId}`).update({
      referral_credited: true,
      referral_reward_days: rewardDays,
      referral_commission_amount: commissionAmount,
      referral_commission_percentage: commissionPercentage,
    });

    // 4. Send in-app notification to the referrer
    try {
      await db.collection('user_notifications').add({
        user_id: referrerId,
        title: 'Hongera! Umepata Kifurushi cha Bure! 🎉',
        message: `Rafiki yako ${profileData.display_name || ''} amenunua kifurushi (${subscription.plan || 'Kifurushi'}). Akaunti yako imeongezewa siku ${rewardDays} za bure za kutazama vipindi vyote!`,
        read: false,
        type: 'referral_reward',
        created_at: FieldValue.serverTimestamp()
      });
    } catch (notifErr) {
      logger.warn('Failed to create referral notification', { error: notifErr.message });
    }

    logger.info('Referral reward processed successfully', {
      referrerId,
      userId,
      rewardDays,
      newExpiresAt: newExp.toISOString()
    });

  } catch (error) {
    logger.error('Error processing referral reward', { error: error.message });
  }
}

/**
 * onSubscriptionCreate: Triggered when a subscription document is created.
 */
exports.onSubscriptionCreate = onDocumentCreated(
  {
    document: 'subscriptions/{subscriptionId}',
    region: 'us-central1',
  },
  async (event) => {
    const subscription = event.data.data();
    const subscriptionId = event.params.subscriptionId;
    await processReferralReward(getFirestore(), subscriptionId, subscription);
  }
);

/**
 * onSubscriptionUpdate: Triggered when a subscription is updated to active status.
 */
exports.onSubscriptionUpdate = onDocumentUpdated(
  {
    document: 'subscriptions/{subscriptionId}',
    region: 'us-central1',
  },
  async (event) => {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const subscriptionId = event.params.subscriptionId;

    // Only process if status transitioned to active
    if (beforeData.status !== 'active' && afterData.status === 'active') {
      await processReferralReward(getFirestore(), subscriptionId, afterData);
    }
  }
);

/**
 * Helper to auto-grant a subscription and activate user profile
 */
async function grantSubscription(db, subDocRef, subData) {
  if (subData.status === 'active') return;

  const now = new Date();
  let days = subData.duration_days;
  if (!days) {
    const key = (subData.plan || '').toLowerCase();
    if (key.includes('day') || key.includes('siku')) days = 1;
    else if (key.includes('week2') || key.includes('wiki mbili') || key.includes('week 2') || key.includes('week_2')) days = 14;
    else if (key.includes('week') || key.includes('wiki')) days = 7;
    else if (key.includes('month') || key.includes('mwezi') || key.includes('mmoja')) days = 30;
    else if (key.includes('miezi 3') || key.includes('miezi mitatu') || key.includes('3 months')) days = 90;
    else days = 30;
  }

  const expDate = new Date();
  expDate.setDate(now.getDate() + days);

  await subDocRef.update({
    status: 'active',
    starts_at: now.toISOString(),
    expires_at: expDate.toISOString(),
    updated_at: FieldValue.serverTimestamp()
  });

  if (subData.user_id) {
    await db.doc(`profiles/${subData.user_id}`).set({
      plan: subData.plan,
      is_active: true
    }, { merge: true });

    try {
      await db.collection('user_notifications').add({
        user_id: subData.user_id,
        title: 'Malipo Yamekamilika!',
        message: 'Kifurushi chako kimewezeshwa kikamilifu. Furahia kutazama vipindi vyote bila kikomo!',
        read: false,
        type: 'payment_success',
        created_at: FieldValue.serverTimestamp()
      });
    } catch (notifErr) {
      logger.warn('Failed to create notification', { error: notifErr.message });
    }
  }
}

/**
 * snippeApi: Server-side proxy for Snippe payment initiation and status checking.
 * Solves browser CORS restrictions, prevents exposing API key on frontend,
 * and automatically grants subscriptions when a check confirms completed payment.
 */
exports.snippeApi = onRequest(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
    region: 'us-central1',
    cors: true,
  },
  async (req, res) => {
    try {
      const db = getFirestore();
      const settingsSnap = await db.doc('settings/general_settings').get();
      const settingsData = settingsSnap.exists ? settingsSnap.data() : {};
      const apiKey = (settingsData.snippe_api_key || '').trim() || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

      const path = (req.path || '').replace(/^\/api\/snippe/, '');

      // 1. Webhook endpoint routed via /api/snippe/webhook
      if (path === '/webhook' || path === '/webhook/') {
        return handleSnippeWebhookInternal(db, req, res);
      }

      // 2. Initiate Payment: POST /v1/payments
      if (req.method === 'POST' && (path === '/v1/payments' || path === '/v1/payments/')) {
        if (!apiKey) {
          return res.status(400).json({ status: false, message: 'Snippe API key is not configured in Admin Settings' });
        }

        const payload = req.body || {};
        if (!payload.webhook_url) {
          payload.webhook_url = 'https://us-central1-revontech-6c62d.cloudfunctions.net/snippeWebhook';
        }
        const idempotencyKey = req.headers['idempotency-key'] || `RT_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const upstreamRes = await fetch('https://api.snippe.sh/v1/payments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Idempotency-Key': idempotencyKey
          },
          body: JSON.stringify(payload)
        });

        const data = await upstreamRes.json();
        return res.status(upstreamRes.status).json(data);
      }

      // 3. Status Poll: GET /v1/payments/:reference
      if (req.method === 'GET' && path.startsWith('/v1/payments/')) {
        const reference = path.replace('/v1/payments/', '').replace(/^\//, '').trim();
        if (!reference) {
          return res.status(400).json({ status: false, message: 'Reference is required' });
        }

        if (!apiKey) {
          return res.status(400).json({ status: false, message: 'Snippe API key is not configured in Admin Settings' });
        }

        const upstreamRes = await fetch(`https://api.snippe.sh/v1/payments/${encodeURIComponent(reference)}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          }
        });

        const data = await upstreamRes.json();
        const payStatus = ((data && data.data && data.data.status) || (data && data.status) || '').toLowerCase();

        // Auto-grant if completed
        if (payStatus === 'completed') {
          try {
            const subQuery = await db.collection('subscriptions')
              .where('snippe_reference', '==', reference)
              .limit(1)
              .get();

            if (!subQuery.empty) {
              const subDoc = subQuery.docs[0];
              await grantSubscription(db, subDoc.ref, subDoc.data());
            }
          } catch (grantErr) {
            logger.error('Error auto-granting during Snippe status check', { error: grantErr.message });
          }
        }

        return res.status(upstreamRes.status).json(data);
      }

      return res.status(404).json({ status: false, message: `Route not found: ${req.method} ${path}` });
    } catch (err) {
      logger.error('Snippe API Proxy Error', { error: err.message });
      return res.status(500).json({ status: false, error: err.message });
    }
  }
);

/**
 * Shared webhook processor for Snippe callbacks
 */
async function handleSnippeWebhookInternal(db, req, res) {
  try {
    const event = req.body || {};
    logger.info('Received Snippe Webhook event', { body: event });

    const ref = event?.data?.reference || event?.reference;
    const orderId = event?.data?.metadata?.order_id || event?.metadata?.order_id;
    const status = (event?.data?.status || event?.status || event?.event || '').toLowerCase();

    if (status.includes('completed') || status === 'payment.completed') {
      let subDoc = null;
      if (ref) {
        const q1 = await db.collection('subscriptions').where('snippe_reference', '==', ref).limit(1).get();
        if (!q1.empty) subDoc = q1.docs[0];
      }
      if (!subDoc && orderId) {
        const q2 = await db.collection('subscriptions').where('order_id', '==', orderId).limit(1).get();
        if (!q2.empty) subDoc = q2.docs[0];
        if (!subDoc) {
          const directDoc = await db.doc(`subscriptions/${orderId}`).get();
          if (directDoc.exists) subDoc = directDoc;
        }
      }

      if (subDoc) {
        await grantSubscription(db, subDoc.ref, subDoc.data());
        logger.info('Auto-granted subscription via Snippe webhook', { subId: subDoc.id });
      } else {
        logger.warn('Subscription not found for Snippe webhook', { ref, orderId });
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error('Error processing Snippe webhook', { error: err.message });
    return res.status(500).json({ received: false, error: err.message });
  }
}

/**
 * Dedicated webhook HTTPS trigger for Snippe:
 * URL: https://us-central1-revontech-6c62d.cloudfunctions.net/snippeWebhook
 */
exports.snippeWebhook = onRequest(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
    region: 'us-central1',
    cors: true,
  },
  async (req, res) => {
    const db = getFirestore();
    return handleSnippeWebhookInternal(db, req, res);
  }
);

/**
 * movieProxy: Server-side proxy for upstream movie catalog & posts.
 * Resolves browser CORS restrictions by fetching from netswahili server-side.
 */
exports.movieProxy = onRequest(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
    region: 'us-central1',
    cors: true,
  },
  async (req, res) => {
    try {
      const targetUrl = (req.query.url || (req.body && req.body.url) || '').toString().trim();
      if (!targetUrl || !targetUrl.startsWith('https://netswahili.com')) {
        return res.status(400).send('Invalid url parameter');
      }

      const method = req.method;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      };

      let body = undefined;
      if (method === 'POST') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        if (typeof req.body === 'string') {
          body = req.body;
        } else if (req.rawBody) {
          body = req.rawBody.toString();
        } else if (req.body && typeof req.body === 'object') {
          const params = new URLSearchParams();
          for (const [k, v] of Object.entries(req.body)) {
            if (k !== 'url') params.append(k, String(v));
          }
          body = params.toString();
        }
      }

      const upstreamRes = await fetch(targetUrl, {
        method,
        headers,
        body
      });

      const text = await upstreamRes.text();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(upstreamRes.status).send(text);
    } catch (err) {
      logger.error('Movie Proxy Error', { error: err.message });
      return res.status(502).send(err.message);
    }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
//  AUTOMATED EPG (PERIODS / RATIBA YA VIPINDI) SYNCHRONIZATION
// ══════════════════════════════════════════════════════════════════════════════

const EPG_BASE_URL = 'https://api.aztv.videoready.tv';
const EPG_IMAGE_BASE_URL = 'https://ds.aztv.videoready.tv';

const AZAM_EPG_CHANNELS = [
  { code: 'AzamSport1', id: 'CH-3974c2cd-9ec4-4d03-82b1-9c993973e487', name: 'Azam Sports 1 HD' },
  { code: 'AzamSport2', id: 'CH-671a5262-f771-4691-b968-8a63d88a1e53', name: 'Azam Sport 2 HD' },
  { code: 'AzamSport3', id: 'CH-a8f7959c-f424-4064-8b71-6c125da488ff', name: 'Azam Sport 3 HD' },
  { code: 'AzamSport4', id: '6a2d199d6730074e79921e4d', name: 'Azam Sport 4 HD' },
  { code: 'AzamSport5', id: '6a9e852599621f1ba92289cb', name: 'Azam sport 5' },
  { code: 'SinemaZetu', id: '688cb98063a66635c9fd42ec', name: 'Sinema Zetu' },
  { code: 'UTV',        id: 'CH-bb01e6a9-65ce-45e7-8da2-16be5aec6acc', name: 'UTV' },
  { code: 'AzamOne',    id: '6880e97da5050961320d1557', name: 'Azam One' },
  { code: 'AzamTwo',    id: '6a4a247f06c6bb2b483bc570', name: 'Azam Two' },
];

async function syncAzamEpgToFirestore() {
  const db = getFirestore();
  const now = Date.now();
  let totalSaved = 0;

  const channelsSnap = await db.collection('channels').get();
  const channelMap = new Map();
  channelsSnap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const name = (data.name || '').toLowerCase().trim();
    channelMap.set(name, docSnap.id);
  });

  for (const ch of AZAM_EPG_CHANNELS) {
    const timestamps = [now, now + 86400000]; // Today & Tomorrow
    const channelEvents = [];

    for (const ts of timestamps) {
      const url = `${EPG_BASE_URL}/content-detail-service/pub/v1/channel-day/${ch.id}/${ts}`;
      try {
        const resp = await fetch(url, {
          headers: {
            'platform': 'web',
            'language': 'eng',
            'local': 'tz',
            'tenantCode': 'azamtv',
            'User-Agent': 'Mozilla/5.0',
          },
        });

        if (resp.ok) {
          const json = await resp.json();
          const events = json?.data?.meta?.channelDay || [];
          channelEvents.push(...events);
        }
      } catch (err) {
        logger.warn(`Failed fetching EPG for ${ch.name}`, { error: err.message });
      }
    }

    if (!channelEvents.length) continue;

    // Deduplicate
    const seen = new Set();
    const uniqueEvents = [];
    for (const ev of channelEvents) {
      const key = ev.eventId || `${ev.eventStartUtc}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueEvents.push(ev);
      }
    }

    // Resolve channel Firestore doc ID
    const chLower = ch.name.toLowerCase().trim();
    let matchedDocId = channelMap.get(chLower) || '';
    if (!matchedDocId) {
      for (const [cName, cId] of channelMap.entries()) {
        if (cName.includes(chLower) || chLower.includes(cName)) {
          matchedDocId = cId;
          break;
        }
      }
    }

    let batch = db.batch();
    let opCount = 0;

    for (const ev of uniqueEvents) {
      const title = (ev.title || ev.defaultTitle || '').trim();
      if (!title) continue;

      const s = new Date(ev.eventStartUtc);
      const e = new Date(ev.eventEndUtc || ev.eventStartUtc);
      const dateStr = s.toISOString().split('T')[0];
      const durationMs = ev.duration || (ev.eventEndUtc ? ev.eventEndUtc - ev.eventStartUtc : 3600000);
      const durationMin = Math.round(durationMs / 60000);

      const fmt = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      const timeLabel = `${fmt(s)} - ${fmt(e)}`;

      const boxCover = ev.boxCoverImage || ev.posterImage;
      const thumbnail = boxCover
        ? boxCover.startsWith('http')
          ? boxCover
          : `${EPG_IMAGE_BASE_URL}/${boxCover}`
        : null;
      const isLive =
        (now >= ev.eventStartUtc && now <= (ev.eventEndUtc || ev.eventStartUtc)) ||
        ev.live === true ||
        title.toLowerCase().includes('live');

      const programDoc = {
        id: ev.eventId || `${ch.code}_${ev.eventStartUtc}`,
        channelId: matchedDocId || ch.code,
        channelDocId: matchedDocId || null,
        channelCode: ch.code,
        channelGuid: ch.id,
        channelName: ch.name,
        title: title,
        description: (ev.description || title).trim(),
        category: ev.genres?.primary?.[0]?.genre?.[0] || 'Sports',
        startTime: s.toISOString(),
        endTime: e.toISOString(),
        timeLabel: timeLabel,
        duration: durationMin,
        date: dateStr,
        thumbnail: thumbnail,
        rating: 'General',
        isLive: isLive,
        language: ev.language || 'Swahili',
        source: 'azam-live',
        updatedAt: FieldValue.serverTimestamp(),
      };

      const docRef = db.collection('channel_programs').doc(programDoc.id);
      batch.set(docRef, programDoc, { merge: true });
      opCount++;
      totalSaved++;

      if (opCount >= 450) {
        await batch.commit();
        batch = db.batch();
        opCount = 0;
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }
  }

  await db.doc('epg_sync_status/azam').set(
    {
      lastSync: FieldValue.serverTimestamp(),
      totalPrograms: totalSaved,
      status: 'success',
    },
    { merge: true }
  );

  return totalSaved;
}

exports.syncEpgPrograms = onSchedule(
  {
    schedule: 'every 4 hours',
    timeoutSeconds: 300,
    memory: '512MiB',
    region: 'us-central1',
    retryCount: 1,
  },
  async () => {
    try {
      const count = await syncAzamEpgToFirestore();
      logger.info('Auto-synced EPG programs', { count });
    } catch (err) {
      logger.error('Scheduled EPG sync failed', { error: err.message });
      throw err;
    }
  }
);

exports.syncEpgProgramsHttp = onRequest(
  {
    timeoutSeconds: 300,
    memory: '512MiB',
    region: 'us-central1',
    cors: true,
  },
  async (_req, res) => {
    try {
      const count = await syncAzamEpgToFirestore();
      res.status(200).json({ ok: true, count });
    } catch (err) {
      logger.error('Manual EPG sync failed', { error: err.message });
      res.status(500).json({ ok: false, error: err.message });
    }
  }
);

/**
 * tokenApi (HTTPS): public API that shares the live CDN token with your other
 * websites. Keys are created in Admin → API (stored hashed in `api_keys`).
 * Docs: docs/TOKEN_API.md
 */
const handleTokenApi = createTokenApi({
  getDb: () => getFirestore(),
  FieldValue,
  log: (msg, detail) => logger.warn(msg, { detail }),
});

exports.tokenApi = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 10,
    cors: false, // CORS is handled per API key inside the handler
  },
  handleTokenApi
);
