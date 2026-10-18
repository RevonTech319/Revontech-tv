/**
 * EPG (Electronic Program Guide / Ratiba ya Vipindi) Service
 *
 * Provides real-time and scheduled program data for channels,
 * backed by Firestore `channel_programs` with instant fallback to
 * Azam TV Max Videoready API.
 */

import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export interface Program {
  id: string;
  channelId: string;
  channelName: string;
  title: string;
  description: string;
  category: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  timeLabel?: string;
  duration?: number;  // in minutes
  date: string;      // YYYY-MM-DD
  thumbnail: string | null;
  rating?: string;
  isLive: boolean;
  language?: string;
  source?: string;
}

export interface EPGDay {
  date: string;
  label: string;
  programs: Program[];
}

/** Official Azam TV Max Videoready API Content IDs */
export const AZAM_EPG_MAP: Record<string, { guid: string; officialName: string }> = {
  'azam sports 1': { guid: 'CH-3974c2cd-9ec4-4d03-82b1-9c993973e487', officialName: 'Azam Sports 1 HD' },
  'azam sport 1':  { guid: 'CH-3974c2cd-9ec4-4d03-82b1-9c993973e487', officialName: 'Azam Sports 1 HD' },
  'azam sports 2': { guid: 'CH-671a5262-f771-4691-b968-8a63d88a1e53', officialName: 'Azam Sport 2 HD' },
  'azam sport 2':  { guid: 'CH-671a5262-f771-4691-b968-8a63d88a1e53', officialName: 'Azam Sport 2 HD' },
  'azam sports 3': { guid: 'CH-a8f7959c-f424-4064-8b71-6c125da488ff', officialName: 'Azam Sport 3 HD' },
  'azam sport 3':  { guid: 'CH-a8f7959c-f424-4064-8b71-6c125da488ff', officialName: 'Azam Sport 3 HD' },
  'azam sports 4': { guid: '6a2d199d6730074e79921e4d', officialName: 'Azam Sport 4 HD' },
  'azam sport 4':  { guid: '6a2d199d6730074e79921e4d', officialName: 'Azam Sport 4 HD' },
  'azam sports 5': { guid: '6a9e852599621f1ba92289cb', officialName: 'Azam sport 5' },
  'azam sport 5':  { guid: '6a9e852599621f1ba92289cb', officialName: 'Azam sport 5' },
  'azam one':      { guid: '6880e97da5050961320d1557', officialName: 'Azam One' },
  'azam two':      { guid: '6a4a247f06c6bb2b483bc570', officialName: 'Azam Two' },
  'sinema zetu':   { guid: '688cb98063a66635c9fd42ec', officialName: 'Sinema Zetu' },
  'utv':           { guid: 'CH-bb01e6a9-65ce-45e7-8da2-16be5aec6acc', officialName: 'UTV' },
  'espn 2':        { guid: '68d1781df8105f62ad296db9', officialName: 'Espn 2' },
  'kix':           { guid: 'CH-ee444a54-161b-43f7-ba7d-1f981a9546a9', officialName: 'Kix' }
};

/** Resolve channel name to Azam GUID if it's an Azam TV channel */
export function resolveAzamGuid(name: string): string | null {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  for (const [key, val] of Object.entries(AZAM_EPG_MAP)) {
    if (n.includes(key) || key.includes(n)) {
      return val.guid;
    }
  }
  return null;
}

/** Check if channel has EPG support */
export function hasEpgSupport(channelName?: string): boolean {
  if (!channelName) return false;
  return resolveAzamGuid(channelName) !== null;
}

/** Format time to HH:mm (East Africa Time) */
export function formatProgramTime(isoString?: string): string {
  if (!isoString) return '--:--';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '--:--';
  }
}

/** Check if a program is airing right now */
export function isCurrentlyAiring(program: Program): boolean {
  if (!program?.startTime || !program?.endTime) return false;
  try {
    const now = Date.now();
    const s = new Date(program.startTime).getTime();
    const e = new Date(program.endTime).getTime();
    return (now >= s && now <= e) || program.isLive === true;
  } catch {
    return false;
  }
}

/** Check if program has ended */
export function hasProgramEnded(program: Program): boolean {
  if (!program?.endTime) return false;
  try {
    return Date.now() > new Date(program.endTime).getTime();
  } catch {
    return false;
  }
}

/**
 * Fetch programs for a channel from Firestore with fallback to live Azam API
 */
export async function fetchChannelEPG(channelId: string, channelName: string): Promise<Program[]> {
  const foundPrograms: Program[] = [];

  // 1. Try Firestore `channel_programs`
  try {
    const searchKeys = [channelId, channelName];
    for (const key of searchKeys) {
      if (!key) continue;
      const q = query(
        collection(db, 'channel_programs'),
        where('channelId', '==', key)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        snap.forEach((docSnap) => {
          foundPrograms.push({ id: docSnap.id, ...docSnap.data() } as Program);
        });
        break;
      }
    }

    if (foundPrograms.length === 0) {
      const q = query(
        collection(db, 'channel_programs'),
        where('channelName', '==', channelName)
      );
      const snap = await getDocs(q);
      snap.forEach((docSnap) => {
        foundPrograms.push({ id: docSnap.id, ...docSnap.data() } as Program);
      });
    }
  } catch (fsErr) {
    console.warn('Firestore EPG lookup error:', fsErr);
  }

  if (foundPrograms.length > 0) {
    return foundPrograms.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  // 2. Fetch live via /api/azam-epg proxy
  const guid = resolveAzamGuid(channelName);
  if (guid) {
    try {
      const now = Date.now();
      const proxyUrl = `/api/azam-epg/content-detail-service/pub/v1/channel-day/${guid}/${now}`;
      const resp = await fetch(proxyUrl);
      if (resp.ok) {
        const json = await resp.json();
        const events = json?.data?.meta?.channelDay || [];
        const mapped: Program[] = events.map((ev: any) => {
          const s = new Date(ev.eventStartUtc);
          const e = new Date(ev.eventEndUtc || ev.eventStartUtc);
          const durMs = ev.duration || (ev.eventEndUtc ? ev.eventEndUtc - ev.eventStartUtc : 3600000);
          const title = (ev.title || ev.defaultTitle || '').trim();
          const cover = ev.boxCoverImage || ev.posterImage;
          const thumbnail = cover ? (cover.startsWith('http') ? cover : `https://ds.aztv.videoready.tv/${cover}`) : null;

          return {
            id: ev.eventId || `${guid}_${ev.eventStartUtc}`,
            channelId,
            channelName,
            title,
            description: (ev.description || title).trim(),
            category: ev.genres?.primary?.[0]?.genre?.[0] || 'Sports',
            startTime: s.toISOString(),
            endTime: e.toISOString(),
            timeLabel: `${formatProgramTime(s.toISOString())} - ${formatProgramTime(e.toISOString())}`,
            duration: Math.round(durMs / 60000),
            date: s.toISOString().split('T')[0],
            thumbnail,
            rating: 'General',
            isLive: (now >= ev.eventStartUtc && now <= (ev.eventEndUtc || ev.eventStartUtc)) || ev.live === true || title.toLowerCase().includes('live'),
            source: 'azam-live'
          };
        });

        if (mapped.length > 0) {
          return mapped.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        }
      }
    } catch (apiErr) {
      console.warn('Live Azam EPG proxy fetch error:', apiErr);
    }
  }

  return [];
}
