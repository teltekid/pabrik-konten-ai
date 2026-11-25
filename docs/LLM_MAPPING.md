# Pemetaan Model AI (Fokus Free Tier)

Catatan: ketersediaan free tier bisa berubah. Verifikasi di dashboard masing-masing provider.
Urutan fallback di worker mengikuti tabel "Rantai" di bawah.

## 1. Rantai Fallback (Task: Generate Naskah/Teks)
Urutan: Gemini -> Groq -> Cloudflare -> SambaNova -> OpenRouter.
Semua via SDK OpenAI (base_url berbeda), timeout 45s, max_retries=0 (non-blocking).

| Provider | Model free (contoh) | Peruntukan | Catatan |
|---|---|---|---|
| Gemini (Google AI Studio) | `gemini-flash-latest`, `gemini-flash-lite-latest`, `gemini-2.5-pro` | General + teks + reasoning cepat | Primary; kuota harian longgar |
| Groq | `openai/gpt-oss-20b` | General/teks cepat (inferensi super cepat) | Rate limit ketat |
| Cloudflare Workers AI | `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `@cf/meta/llama-3.1-8b-instruct` | General/teks | Butuh Account ID + token |
| SambaNova | `Meta-Llama-3.3-70B-Instruct`, `Meta-Llama-3.1-8B-Instruct` | General/teks | Free tier tersedia |
| OpenRouter | `google/gemma-4-31b-it:free`, `baidu/ernie-5.5-flash-preview:free`, `inclusionai/ling-3.2-flash:free`, `nvidia/nemotron-3.5-lightning:free` | General/teks | Kuota harian 50 req (perlu 10 kredit untuk 1000) |

## 2. Kategori per Peruntukan

### General / Teks (naskah, caption, deskripsi)
- Gemini `gemini-flash-latest` (primary)
- Groq `openai/gpt-oss-20b`
- Cloudflare `llama-3.3-70b-instruct-fp8-fast`
- SambaNova `Meta-Llama-3.3-70B-Instruct`
- OpenRouter `gemma-4-31b-it:free`

### Research Mendalam / Reasoning
- Gemini `gemini-2.5-pro` (free tier terbatas) — paling kuat untuk penalaran.
- OpenRouter `nvidia/nemotron-3.5-lightning:free` (reasoning).
- Cloudflare `@cf/deepseek/deepseek-r1-distill-qwen-32b` (reasoning, bila tersedia).
Catatan: untuk MVP, reasoning tidak dipakai; naskah cukup model flash.

### Generate Gambar (Image)
- **Pollinations.ai** (dengan API key) — primary, kualitas prompt-to-image baik.
- **Cloudflare Workers AI** `@cf/black-forest-labs/flux-1-schnell` (free) — fallback.
- **Fallback lokal** (gradien + teks via Pillow) — selalu tersedia, 100% gratis.
Rantai gambar: Pollinations (key, 30s) -> Cloudflare Flux (60s) -> placeholder lokal.

### Generate Audio (TTS)
- **edge-tts** (gratis, tanpa key) — dipakai. Voice `id-ID-ArdiNeural` dst.
- Cloudflare `@cf/myshell-ai/melotts` (opsional, free) — cadangan bila edge-tts gagal.
- Gemini TTS `gemini-2.5-flash-preview-tts` (free tier) — opsional.

### Generate Video Pendek
- Tidak ada model AI video gratis yang andal. Pendekatan: **rakit dari gambar + audio via ffmpeg** (Ken Burns + concat). 100% gratis.
- Opsi AI video (berbayar/kuota): tidak dipakai.

### Lainnya
- Embedding: Gemini `text-embedding-004` (free) — belum dipakai.
- Whisper (Groq `whisper-large-v3`) — transkripsi (belum dipakai).

## 3. Mekanisme Fallback & Retry (Non-Blocking)
- Setiap panggilan LLM: `timeout=45s`, `max_retries=0` -> gagal cepat, lanjut provider berikutnya.
- Gambar: timeout pendek (Pollinations 30s / Cloudflare 60s) -> fallback cepat ke placeholder.
- TTS: `asyncio.wait_for` 60s -> gagal cepat.
- Tidak ada retry internal yang menggantung; rantai provider membuat sistem tetap maju.
- Setiap kegagalan dicatat di log, job tetap diproses selama satu tahap berhasil.