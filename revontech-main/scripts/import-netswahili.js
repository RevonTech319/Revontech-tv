/**
 * Bulk Import NetSwahili Movies to Firestore
 * 
 * This script fetches movies from NetSwahili.com and imports them to Firestore
 * Usage: node scripts/import-netswahili.js
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import fetch from 'node-fetch';

// Firebase config - replace with your actual config
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const UPSTREAM = 'https://netswahili.com';
const PROXY = 'https://proxy.cors.sh/';
const PAGE_SIZE = 10;
const EPISODE_PAGE = 5;

function slugify(text) {
  return (text || '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80);
}

async function fetchUpstreamPage(offset) {
  const url = offset === 0
    ? `${PROXY}${UPSTREAM}/all/latest`
    : `${PROXY}${UPSTREAM}/data/fetch_post.php`;

  const init = offset === 0
    ? {}
    : {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `starting=${offset}&type=latest`,
      };
  
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseUpstreamCards(html, seen) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const cards = [];
  
  doc.querySelectorAll('.post-card').forEach((card) => {
    const ancestorAnchor = card.closest('a');
    const childAnchor = card.querySelector('a[href*="/post/"]');
    const linkEl = ancestorAnchor || childAnchor;
    const href = linkEl?.getAttribute('href') || '';
    const slugMatch = href.match(/\/post\/([^/?#]+)/);
    const slug = slugMatch?.[1];
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    
    cards.push({
      slug,
      title: card.querySelector('.post-title')?.textContent?.trim() || slug.replace(/-/g, ' '),
      poster: card.querySelector('img')?.getAttribute('src') || '',
      type: card.querySelector('.type')?.textContent?.trim() || 'Movie',
    });
  });
  return cards;
}

function parseEpisodes(root) {
  const out = [];
  root.querySelectorAll('.list-epsode').forEach((el) => {
    const onclick = el.getAttribute('onclick') || '';
    const m = onclick.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    const t = onclick.match(/,\s*['"]([^'"]+)['"]/);
    if (m) {
      out.push({
        title: t?.[1] || el.querySelector('.epsodes-number')?.textContent?.trim() || `Episode ${out.length + 1}`,
        driveId: m[1],
      });
    }
  });
  return out;
}

async function fetchMoreEpisodes(slug, startOffset) {
  const all = [];
  let offset = startOffset;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${PROXY}${UPSTREAM}/data/fetch_episode.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `starting=${offset}&slug=${encodeURIComponent(slug)}`,
      });
      if (!res.ok) break;
      const html = await res.text();
      if (!html.trim()) break;
      
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      const batch = parseEpisodes(dom.window.document);
      if (batch.length === 0) break;
      all.push(...batch);
      offset += EPISODE_PAGE;
    } catch {
      break;
    }
  }
  return all;
}

async function fetchUpstreamDetail(slug) {
  try {
    const res = await fetch(`${PROXY}${UPSTREAM}/post/${slug}`);
    if (!res.ok) return null;
    const html = await res.text();
    
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const title = doc.querySelector('.movie-details h1')?.textContent?.trim() ||
      doc.querySelector('h1')?.textContent?.trim() || '';
    const poster = doc.querySelector('.details-image img')?.getAttribute('src') || '';
    const description = doc.querySelector('.details-description')?.textContent?.trim() || '';

    let episodes = parseEpisodes(doc);
    const hasMore = !!doc.querySelector('#episode-load');
    if (hasMore && episodes.length > 0) {
      const more = await fetchMoreEpisodes(slug, episodes.length);
      episodes = [...episodes, ...more];
    }

    return { title, poster, description, episodes };
  } catch (e) {
    console.error(`Error fetching detail for ${slug}:`, e.message);
    return null;
  }
}

async function getExistingMovies() {
  const snap = await getDocs(collection(db, 'movies'));
  const slugs = new Set();
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.imported_from) slugs.add(data.imported_from);
    if (data.slug) slugs.add(data.slug);
  });
  return slugs;
}

async function bulkImport(maxPages = 10) {
  console.log('🚀 Starting NetSwahili bulk import...');
  console.log(`📦 Will fetch up to ${maxPages} pages (${maxPages * PAGE_SIZE} movies)\n`);

  const existingSlugs = await getExistingMovies();
  console.log(`✅ Found ${existingSlugs.size} existing movies in Firestore\n`);

  const seen = new Set();
  const allCards = [];
  let offset = 0;

  // Fetch movie cards
  console.log('📥 Fetching movie list from NetSwahili...');
  for (let page = 0; page < maxPages; page++) {
    try {
      const html = await fetchUpstreamPage(offset);
      const cards = parseUpstreamCards(html, seen);
      if (cards.length === 0) {
        console.log(`   Page ${page + 1}: No more movies found`);
        break;
      }
      allCards.push(...cards);
      offset += PAGE_SIZE;
      console.log(`   Page ${page + 1}: Found ${cards.length} movies (total: ${allCards.size})`);
      
      // Delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.error(`   Page ${page + 1}: Error -`, e.message);
      break;
    }
  }

  console.log(`\n📊 Total movies found: ${allCards.length}`);
  
  // Filter out already imported
  const toImport = allCards.filter(card => !existingSlugs.has(card.slug));
  console.log(`📝 Movies to import: ${toImport.length}`);
  console.log(`⏭️  Skipping ${allCards.length - toImport.length} already imported\n`);

  if (toImport.length === 0) {
    console.log('✅ All movies are already imported!');
    return;
  }

  // Import each movie
  let imported = 0;
  let failed = 0;
  const sortOrderStart = existingSlugs.size + 1;

  console.log('💾 Starting import to Firestore...\n');
  
  for (let i = 0; i < toImport.length; i++) {
    const movie = toImport[i];
    const progress = `[${i + 1}/${toImport.length}]`;
    
    try {
      console.log(`${progress} Importing: ${movie.title}`);
      
      const detail = await fetchUpstreamDetail(movie.slug);
      if (!detail || detail.episodes.length === 0) {
        console.log(`${progress} ⚠️  Skipped (no episodes found)`);
        failed++;
        continue;
      }

      const isSeries = detail.episodes.length > 1;
      const payload = {
        title: detail.title || movie.title,
        slug: slugify(movie.title),
        poster: detail.poster || movie.poster,
        description: detail.description || '',
        drive_id: detail.episodes[0].driveId,
        episodes: detail.episodes,
        category: isSeries ? 'Series' : movie.type || 'Movie',
        year: String(new Date().getFullYear()),
        is_free: false,
        active: true,
        sort_order: sortOrderStart + imported,
        imported_from: movie.slug,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };

      await addDoc(collection(db, 'movies'), payload);
      console.log(`${progress} ✅ Imported (${detail.episodes.length} episodes)`);
      imported++;
      
      // Delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      console.log(`${progress} ❌ Failed:`, e.message);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📈 IMPORT SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Successfully imported: ${imported}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📦 Total in Firestore: ${existingSlugs.size + imported}`);
  console.log('='.repeat(50));
}

// Run the import
const maxPages = process.argv[2] ? parseInt(process.argv[2]) : 10;
bulkImport(maxPages)
  .then(() => {
    console.log('\n🎉 Import complete!');
    process.exit(0);
  })
  .catch((e) => {
    console.error('\n❌ Import failed:', e);
    process.exit(1);
  });
