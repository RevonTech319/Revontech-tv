// Fallback for when the catch-all files are not matched: vercel.json rewrites /api/v1|v2/* here.
import { makeEntry } from './_lib/entry.js';

export default makeEntry(null);
