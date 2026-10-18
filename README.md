# Revontech TV

Streaming platform for live football matches, live TV channels and movies, built for Swahili-speaking audiences in Tanzania and East Africa.

## Structure

| Folder | Purpose |
| --- | --- |
| `src/` | Main website (React + Vite + TypeScript + Tailwind + shadcn/ui) |
| `admin/` | Admin panel (separate Vite app) |
| `functions/` | Firebase Cloud Functions |
| `supabase/` | Supabase config, functions and migrations |
| `android/` | Android app |
| `public/` | Static assets: icons, sitemap, robots.txt, APK downloads |

## Getting started

```sh
npm install
cp .env.example .env   # then fill in your own values
npm run dev
```

The admin panel runs from its own folder:

```sh
cd admin
npm install
npm run dev
```

## Environment variables

See `.env.example`. Never commit `.env`.

## Deploy

- Main site: Vercel (`vercel.json`) or Firebase Hosting (`firebase.json`)
- Admin panel: Firebase Hosting target `admin`

## License

All rights reserved © Revontech TV.
