# PABRIK KONTEN AI

Sistem otomatis event-driven untuk generate video pendek vertikal (TikTok/Reels/Shorts), 100% free-tier.

## Arsitektur

```
SPA React (Netlify) -> Netlify Function trigger -> Supabase (queue) -> GitHub Actions worker (Python + ffmpeg)
                                                                         |
                                                          OpenRouter (naskah) + edge-tts (suara)
                                                          + Pollinations.ai (gambar) + ffmpeg (render)
                                                                         |
                                                          Output: Telegram / Google Drive / YouTube (stub)
```

## Alur

1. User isi form di SPA (topik, bahasa, voice, destinasi).
2. SPA POST `/.netlify/functions/trigger`.
3. Function insert job `pending` ke Supabase, lalu dispatch GitHub Actions `generate_video_job`.
4. Worker ambil job (set `processing`), generate naskah -> TTS -> gambar -> render -> upload.
5. Job jadi `completed` / `failed`; SPA polling status tiap 5 detik.

## Struktur

```
netlify/functions/trigger.ts   # API serverless
src/                           # SPA React (Vite)
worker/src/main.py             # Pipeline video (Python)
worker/requirements.txt
supabase/schema.sql            # Skema DB + RLS
.github/workflows/video_worker.yml
netlify.toml
```

## Setup

### 1. Supabase
Jalankan `supabase/schema.sql` di SQL Editor.

### 2. Secrets

Netlify (Site settings -> Environment variables):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_PAT` (PAT scope `repo`)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

GitHub Actions (Repo -> Settings -> Secrets):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTER_API_KEY`
- `GEMINI_API_KEY` (Google AI Studio, primary)
- `GROQ_API_KEY` (GroqCloud, fallback)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- `GDRIVE_SERVICE_ACCOUNT_JSON` (service account JSON)

### 3. Dev lokal
```bash
npm install
npm run dev
```

### 4. Deploy
Deploy repo ke Netlify (build `npm run build`, publish `dist`).

## Catatan
- 100% gratis (tanpa credit card).
- MVP: Telegram + Google Drive. YouTube masih stub (butuh OAuth2, fase 2).
- OpenRouter memakai fallback model bila model utama gagal.