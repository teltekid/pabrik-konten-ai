# Rencana Implementasi: PABRIK KONTEN AI

## Ringkasan
Sistem event-driven generate video pendek vertikal (TikTok/Reels/Shorts), 100% free-tier.
SPA React (Vite) di Netlify -> Netlify Function trigger -> job queue Supabase -> worker Python di GitHub Actions.
AI: OpenRouter (fallback), edge-tts, Pollinations.ai, ffmpeg. Output: Telegram, Google Drive, YouTube (stub).

## Stack
- SPA: Vite + React + TS (Netlify, SPA fallback).
- API: Netlify Functions `netlify/functions/trigger.ts`.
- DB/Queue: Supabase (PostgreSQL + RLS).
- Worker: GitHub Actions ubuntu-latest + Python 3.11 + ffmpeg.
- AI: OpenRouter free models (fallback chain), edge-tts, Pollinations.ai.
- Output: Telegram Bot, Google Drive (service account), YouTube stub.

## Kondisi Repo Saat Ini (terverifikasi)
- `src/App.tsx`, `src/main.tsx`, `src/lib/supabase.ts` ada (SPA + polling 5s).
- `netlify/functions/trigger.ts` ada; URL dispatch sudah benar, tapi belum ada `netlify.toml`.
- `worker/src/`, `supabase/`, `.github/workflows/` KOSONG.
- `README.md` kosong; tidak ada `AGENTS.md`.
- `package.json` OK (react, supabase-js, vite, ts).

## File yang Dibuat/Diubah
1. `supabase/schema.sql` — enum `job_status`, tabel `video_jobs`, index, trigger `updated_at`, RLS (service_role full, anon read).
2. `netlify/functions/trigger.ts` — validasi topic, insert job pending (service role), dispatch `generate_video_job` ke `api.github.com/repos/{owner}/{repo}/dispatches` (Bearer PAT), return job. (perbaikan: pastikan URL benar, sudah OK).
3. `src/App.tsx` — form topic/language/voice/destinations + list status (poll anon key read-only). (sudah ada, verifikasi).
4. `netlify.toml` — SPA redirect + functions config.
5. `.github/workflows/video_worker.yml` — trigger `repository_dispatch` + `schedule` + `workflow_dispatch`; concurrency `video-generator-queue` no cancel; steps checkout, setup Python 3.11, install ffmpeg+fonts, pip install, run main.py.
6. `worker/src/main.py` — fetch job (TARGET_JOB_ID / pending terlama) -> set processing; script JSON via OpenRouter fallback; TTS edge-tts async per scene; gambar Pollinations 9:16; render ffmpeg (Ken Burns + audio + concat); output Telegram/Drive/YouTube stub; update completed/failed.
7. `worker/requirements.txt` — openai, supabase, edge-tts, requests, google-api-python-client, google-auth.
8. `README.md` — dokumentasi setup + secrets.

## Perbaikan Bug Blueprint
1. URL GitHub API dispatch (sudah benar di trigger.ts).
2. edge-tts async -> `asyncio.run()`.
3. YouTube OAuth2 -> stub MVP.
4. OpenRouter free models -> fallback + error handling.
5. Service role key hanya di Netlify Function; SPA pakai anon read-only.
6. Job locking: set `processing` sebelum kerja, cegah race.

## Secrets (Netlify + GitHub Actions)
- Netlify: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_PAT`.
- Vite (Netlify build): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- GitHub Actions: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `GDRIVE_SERVICE_ACCOUNT_JSON`.

## Urutan Implementasi (Todos)
1. `supabase/schema.sql` + apply.
2. `netlify.toml`.
3. Verifikasi/patch `netlify/functions/trigger.ts`.
4. Verifikasi `src/App.tsx`.
5. `.github/workflows/video_worker.yml`.
6. `worker/src/main.py`.
7. `worker/requirements.txt`.
8. `README.md`.
9. Konfigurasi secrets.
10. Test end-to-end + deploy Netlify.
11. Fase 2 (opsional): YouTube OAuth2, sosial IG/FB/Threads/TikTok, analytics.

## Catatan
- 100% gratis (tanpa credit card).
- MVP: video pendek + Telegram/Drive. Sosial & analytics menyusul.
- Error handling & fallback model di setiap tahap.