import asyncio
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.parse
from pathlib import Path

import requests
from openai import OpenAI
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
CLOUDFLARE_ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
SAMBANOVA_API_KEY = os.environ.get("SAMBANOVA_API_KEY", "")
POLLINATIONS_API_KEY = os.environ.get("POLLINATIONS_API_KEY", "")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
GDRIVE_SERVICE_ACCOUNT_JSON = os.environ.get("GDRIVE_SERVICE_ACCOUNT_JSON", "")
GDRIVE_CLIENT_ID = os.environ.get("GDRIVE_CLIENT_ID", "")
GDRIVE_CLIENT_SECRET = os.environ.get("GDRIVE_CLIENT_SECRET", "")
GDRIVE_REFRESH_TOKEN = os.environ.get("GDRIVE_REFRESH_TOKEN", "")
YOUTUBE_CLIENT_ID = os.environ.get("YOUTUBE_CLIENT_ID", "")
YOUTUBE_CLIENT_SECRET = os.environ.get("YOUTUBE_CLIENT_SECRET", "")
YOUTUBE_REFRESH_TOKEN = os.environ.get("YOUTUBE_REFRESH_TOKEN", "")

TARGET_JOB_ID = os.environ.get("TARGET_JOB_ID", "").strip()

WIDTH, HEIGHT = 1080, 1920
FPS = 30

# Rantai provider (semua via SDK OpenAI, base_url berbeda).
# Urutan: Gemini -> Groq -> Cloudflare -> SambaNova -> OpenRouter.
# Dapat di-override via env LLM_PROVIDERS_JSON (JSON array).
_DEFAULT_PROVIDERS = [
    {
        "name": "gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "api_key": GEMINI_API_KEY,
        "models": ["gemini-flash-latest", "gemini-flash-lite-latest"],
    },
    {
        "name": "groq",
        "base_url": "https://api.groq.com/openai/v1",
        "api_key": GROQ_API_KEY,
        "models": ["openai/gpt-oss-20b"],
    },
    {
        "name": "cloudflare",
        "base_url": (
            f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1"
            if CLOUDFLARE_ACCOUNT_ID
            else ""
        ),
        "api_key": CLOUDFLARE_API_TOKEN,
        "models": [
            "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
            "@cf/meta/llama-3.1-8b-instruct",
        ],
    },
    {
        "name": "sambanova",
        "base_url": "https://api.sambanova.ai/v1",
        "api_key": SAMBANOVA_API_KEY,
        "models": ["Meta-Llama-3.3-70B-Instruct", "Meta-Llama-3.1-8B-Instruct"],
    },
    {
        "name": "openrouter",
        "base_url": "https://openrouter.ai/api/v1",
        "api_key": OPENROUTER_API_KEY,
        "models": [
            "google/gemma-4-31b-it:free",
            "baidu/ernie-5.5-flash-preview:free",
            "inclusionai/ling-3.2-flash:free",
            "nvidia/nemotron-3.5-lightning:free",
        ],
    },
]

_PROVIDERS_RAW = os.environ.get("LLM_PROVIDERS_JSON", "").strip()
_LOADED = False
if _PROVIDERS_RAW:
    try:
        _candidate = json.loads(_PROVIDERS_RAW)
        _LOADED = True
    except json.JSONDecodeError:
        log("LLM_PROVIDERS_JSON invalid, fallback ke config/file/default")
        _candidate = None
else:
    _candidate = None

if not _LOADED:
    # coba file config
    _cfg_path = os.environ.get("LLM_PROVIDERS_FILE", "worker/config/models.json")
    try:
        with open(_cfg_path, encoding="utf-8") as f:
            _candidate = json.load(f)
            _LOADED = True
    except (OSError, json.JSONDecodeError):
        _candidate = None

if _LOADED and isinstance(_candidate, list):
    PROVIDERS = []
    for p in _candidate:
        name = p.get("name", "")
        base = p.get("base_url", "")
        if name == "cloudflare" and not base and CLOUDFLARE_ACCOUNT_ID:
            base = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1"
        key = p.get("api_key") or os.environ.get(p.get("api_key_env", ""), "")
        PROVIDERS.append(
            {
                "name": name,
                "base_url": base,
                "api_key": key,
                "models": p.get("models", []),
            }
        )
else:
    PROVIDERS = _DEFAULT_PROVIDERS

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def log(msg: str) -> None:
    print(f"[worker] {msg}", flush=True)


def update_job(job_id: str, **fields) -> None:
    supabase.table("video_jobs").update(fields).eq("id", job_id).execute()


def fetch_job():
    # Reclaim job yang nyangkut di 'processing' lebih dari 30 menit
    reclaim_stale_jobs()
    if TARGET_JOB_ID:
        res = supabase.table("video_jobs").select("*").eq("id", TARGET_JOB_ID).limit(1).execute()
        return res.data[0] if res.data else None
    res = (
        supabase.table("video_jobs")
        .select("*")
        .eq("status", "pending")
        .order("created_at", desc=False)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def reclaim_stale_jobs() -> None:
    try:
        from datetime import datetime, timedelta, timezone

        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
        supabase.table("video_jobs").update(
            {"status": "pending", "error_message": "reclaimed: stale processing"}
        ).eq("status", "processing").lt("updated_at", cutoff).execute()
    except Exception as e:  # noqa: BLE001
        log(f"reclaim gagal (non-fatal): {e}")


def claim_job(job_id: str) -> bool:
    # Set processing hanya jika masih pending (cegah race condition)
    res = (
        supabase.table("video_jobs")
        .update({"status": "processing", "error_message": None})
        .eq("id", job_id)
        .eq("status", "pending")
        .select("id")
        .execute()
    )
    return bool(res.data)


def _retry_after(err) -> float | None:
    resp = getattr(err, "response", None)
    if resp is not None:
        try:
            v = resp.headers.get("retry-after")
            if v:
                return min(float(v), 5.0)
        except (ValueError, TypeError):
            pass
    return None


def _is_daily_limit(err, body: str) -> bool:
    resp = getattr(err, "response", None)
    if resp is not None:
        try:
            rem = resp.headers.get("x-ratelimit-remaining")
            if rem is not None and str(rem).strip() == "0":
                return True
        except Exception:  # noqa: BLE001
            pass
    low = (body or "").lower()
    return any(k in low for k in ("per-day", "free-models-per-day", "daily", "quota"))


def _quality_ok(data: dict) -> bool:
    scenes = data.get("scenes")
    if not isinstance(scenes, list) or not (4 <= len(scenes) <= 8):
        return False
    texts = []
    total_len = 0
    for s in scenes:
        if not isinstance(s, dict):
            return False
        t = s.get("text")
        ip = s.get("image_prompt")
        if not isinstance(t, str) or len(t.strip()) < 20:
            return False
        if not isinstance(ip, str) or len(ip.strip()) < 5:
            return False
        texts.append(t.strip().lower())
        total_len += len(t.strip())
    # hindari duplikasi scene
    if len(set(texts)) < len(texts):
        return False
    # kualitas minimal: total panjang naskah
    if total_len < 120:
        return False
    return True


def generate_script(topic: str, language: str) -> dict:
    prompt = (
        "Buat naskah video pendek vertikal (9:16) berdasarkan topik berikut. "
        "Jawab HANYA JSON valid dengan struktur: "
        '{"title": string, "scenes": [{"text": string, "image_prompt": string}]}. '
        f"Minimal 4 scene, maksimal 8. Bahasa: {language}. Topik: {topic}"
    )
    last_err = None
    deadline = time.monotonic() + 90  # total budget per tugas
    for provider in PROVIDERS:
        if time.monotonic() > deadline:
            raise RuntimeError("deadline 90s terlampaui, fallback ke lokal")
        if not provider.get("api_key") or not provider.get("base_url"):
            log(f"provider {provider['name']} dilewati (api_key/base_url kosong)")
            continue
        client = OpenAI(
            base_url=provider["base_url"],
            api_key=provider["api_key"],
            timeout=45,
            max_retries=0,
        )
        log(f"provider {provider['name']} key_len={len(provider['api_key'])}")
        for model in provider.get("models", []):
            if time.monotonic() > deadline:
                raise RuntimeError("deadline 90s terlampaui, fallback ke lokal")
            try:
                log(f"generate script with {provider['name']}/{model}")
                resp = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.6,
                )
                content = resp.choices[0].message.content.strip()
                content = content.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                data = json.loads(content)
                if not _quality_ok(data):
                    raise ValueError("kualitas output tidak memenuhi (scene/text)")
                return data
            except Exception as e:  # noqa: BLE001
                last_err = e
                resp_obj = getattr(e, "response", None)
                body = resp_obj.text if resp_obj is not None else ""
                status = getattr(resp_obj, "status_code", None) or getattr(e, "status_code", None)
                log(f"model {provider['name']}/{model} gagal: {e} | body={body[:200]}")

                retryable = (status == 429 and not _is_daily_limit(e, body)) or (
                    isinstance(status, int) and 500 <= status < 600
                )
                if retryable:
                    wait = _retry_after(e) or (2.0 if status == 429 else 1.0)
                    if time.monotonic() + wait <= deadline:
                        log(f"retry {provider['name']}/{model} setelah {wait}s")
                        time.sleep(wait)
                        try:
                            resp = client.chat.completions.create(
                                model=model,
                                messages=[{"role": "user", "content": prompt}],
                                temperature=0.6,
                            )
                            content = resp.choices[0].message.content.strip()
                            content = content.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                            data = json.loads(content)
                            if _quality_ok(data):
                                return data
                        except Exception as e2:  # noqa: BLE001
                            last_err = e2
                            log(f"retry gagal: {e2}")
                if _is_daily_limit(e, body):
                    log(f"kuota harian {provider['name']} habis, lewati provider")
                    break
    raise RuntimeError(f"Semua provider/model gagal: {last_err}")


async def _tts_scene(text: str, path: Path, voice: str) -> None:
    import asyncio

    import edge_tts

    communicate = edge_tts.Communicate(text, voice)
    await asyncio.wait_for(communicate.save(str(path)), timeout=60)


def generate_tts(scenes: list, voice: str, workdir: Path) -> list:
    import asyncio

    paths = []
    for i, scene in enumerate(scenes):
        p = workdir / f"scene_{i:02d}.mp3"
        asyncio.run(_tts_scene(scene["text"], p, voice))
        paths.append(p)
        log(f"tts scene {i} -> {p.name}")
    return paths


def make_placeholder(prompt: str, path: Path) -> None:
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (WIDTH, HEIGHT), (20, 30, 60))
    draw = ImageDraw.Draw(img)
    for y in range(HEIGHT):
        t = y / HEIGHT
        draw.line([(0, y), (WIDTH, y)], fill=(int(20 + 40 * t), int(30 + 50 * t), int(60 + 90 * t)))

    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 56)
    except Exception:  # noqa: BLE001
        font = ImageFont.load_default()

    words = prompt.split()
    lines, cur = [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if draw.textlength(test, font=font) > WIDTH - 160:
            lines.append(cur)
            cur = w
        else:
            cur = test
    if cur:
        lines.append(cur)

    text = "\n".join(lines[:12])
    bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=16)
    h = bbox[3] - bbox[1]
    draw.multiline_text(((WIDTH - (bbox[2] - bbox[0])) / 2, (HEIGHT - h) / 2), text, fill=(255, 255, 255), font=font, spacing=16)
    img.save(path)
    log(f"placeholder -> {path.name}")


def _cloudflare_image(prompt: str, path: Path) -> bool:
    if os.environ.get("CLOUDFLARE_IMAGE_ENABLED", "").lower() not in ("1", "true", "yes"):
        return False
    if not (CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN):
        return False
    url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell"
    try:
        r = requests.post(
            url,
            headers={"Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}"},
            json={"prompt": prompt},
            timeout=30,
        )
        r.raise_for_status()
        path.write_bytes(r.content)
        log("image (cloudflare flux) -> " + path.name)
        return True
    except Exception as e:  # noqa: BLE001
        body = ""
        resp_obj = getattr(e, "response", None)
        if resp_obj is not None:
            try:
                body = resp_obj.text
            except Exception:  # noqa: BLE001
                body = ""
            log(
                f"cloudflare image HTTP {resp_obj.status_code} "
                f"ctype={resp_obj.headers.get('content-type')} len={len(resp_obj.content)}"
            )
        log(f"cloudflare image gagal ({e}) body={body[:300]}")
        return False


def download_image(prompt: str, path: Path) -> None:
    # Pollinations di-skip (butuh berbayar). Cloudflare Flux -> placeholder lokal.
    if _cloudflare_image(prompt, path):
        return
    make_placeholder(prompt, path)


def run(cmd: list) -> None:
    log("exec: " + " ".join(str(c) for c in cmd))
    subprocess.run([str(c) for c in cmd], check=True)


def render_video(scenes: list, audios: list, workdir: Path, out_path: Path) -> None:
    clips = []
    for i, scene in enumerate(scenes):
        img = workdir / f"scene_{i:02d}.png"
        download_image(scene["image_prompt"], img)

        # Durasi mengikuti panjang audio
        dur = float(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(audios[i]),
        ]).decode().strip())

        clip = workdir / f"clip_{i:02d}.mp4"
        # Ken Burns: zoom perlahan
        zoom = (
            f"zoompan=z='min(zoom+0.0015,1.15)':d={int(dur*FPS)}"
            f":s={WIDTH}x{HEIGHT}:fps={FPS},format=yuv420p"
        )
        run([
            "ffmpeg", "-y", "-loop", "1", "-i", img,
            "-t", f"{dur:.3f}", "-vf", zoom,
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS), clip,
        ])
        clips.append(clip)

    # Gabungkan audio
    concat_audio = workdir / "audio.m4a"
    list_audio = workdir / "audio_list.txt"
    list_audio.write_text("".join(f"file '{p.as_posix()}'\n" for p in audios))
    run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_audio,
        "-c:a", "aac", concat_audio,
    ])

    # Gabungkan video
    list_video = workdir / "video_list.txt"
    list_video.write_text("".join(f"file '{p.as_posix()}'\n" for p in clips))
    merged = workdir / "merged.mp4"
    run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_video,
        "-c", "copy", merged,
    ])

    # Gabungkan video + audio
    run([
        "ffmpeg", "-y", "-i", merged, "-i", concat_audio,
        "-c:v", "copy", "-c:a", "aac", "-shortest", out_path,
    ])
    log(f"render selesai -> {out_path.name}")


def upload_telegram(out_path: Path) -> str:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return ""
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendVideo"
    with out_path.open("rb") as f:
        r = requests.post(
            url,
            data={"chat_id": TELEGRAM_CHAT_ID},
            files={"video": f},
            timeout=300,
        )
    r.raise_for_status()
    log("uploaded ke Telegram")
    return "telegram"


def upload_gdrive(out_path: Path) -> str:
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

    folder_id = os.environ.get("GDRIVE_FOLDER_ID", "").strip()

    # Prioritas: OAuth user (refresh token) -> service account
    if GDRIVE_REFRESH_TOKEN and GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET:
        creds = Credentials(
            token=None,
            refresh_token=GDRIVE_REFRESH_TOKEN,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=GDRIVE_CLIENT_ID,
            client_secret=GDRIVE_CLIENT_SECRET,
            scopes=["https://www.googleapis.com/auth/drive"],
        )
        log("gdrive via OAuth user")
    elif GDRIVE_SERVICE_ACCOUNT_JSON:
        from google.oauth2 import service_account

        info = json.loads(GDRIVE_SERVICE_ACCOUNT_JSON)
        creds = service_account.Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/drive"]
        )
        log("gdrive via service account")
    else:
        log("gdrive tidak dikonfigurasi (butuh OAuth atau service account)")
        return ""

    service = build("drive", "v3", credentials=creds)
    try:
        service._http.timeout = 120
    except Exception:  # noqa: BLE001
        pass

    meta = {"name": out_path.name}
    log(f"gdrive folder_id_len={len(folder_id)}")
    if folder_id:
        meta["parents"] = [folder_id]

    log("uploading ke Google Drive...")
    media = MediaFileUpload(str(out_path), mimetype="video/mp4", resumable=True)
    file = service.files().create(body=meta, media_body=media, fields="id,webViewLink").execute()

    try:
        service.permissions().create(
            fileId=file["id"], body={"type": "anyone", "role": "reader"}
        ).execute()
    except Exception as e:  # noqa: BLE001
        log(f"set permission gagal (non-fatal): {e}")

    link = file.get("webViewLink") or "gdrive"
    log(f"uploaded ke Google Drive: {link}")
    return link


def upload_youtube(out_path: Path) -> str:
    if not (YOUTUBE_REFRESH_TOKEN and YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET):
        log("youtube tidak dikonfigurasi (butuh OAuth)")
        return ""
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

    creds = Credentials(
        token=None,
        refresh_token=YOUTUBE_REFRESH_TOKEN,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=YOUTUBE_CLIENT_ID,
        client_secret=YOUTUBE_CLIENT_SECRET,
        scopes=["https://www.googleapis.com/auth/youtube.upload"],
    )
    service = build("youtube", "v3", credentials=creds)
    body = {
        "snippet": {
            "title": out_path.stem,
            "description": "Generated by Pabrik Konten AI",
            "tags": ["shorts", "ai"],
            "categoryId": "22",
        },
        "status": {"privacyStatus": "unlisted"},
    }
    media = MediaFileUpload(str(out_path), mimetype="video/mp4", resumable=True, chunksize=1024 * 1024)
    req = service.videos().insert(part="snippet,status", body=body, media_body=media)
    resp = None
    while resp is None:
        status, resp = req.next_chunk()
        if status:
            log(f"youtube upload {int(status.progress() * 100)}%")
    vid = resp.get("id")
    link = f"https://youtu.be/{vid}" if vid else "youtube"
    log(f"uploaded ke YouTube: {link}")
    return link


def main() -> int:
    job = fetch_job()
    if not job:
        log("tidak ada job pending")
        return 0

    job_id = job["id"]
    if not claim_job(job_id):
        log(f"job {job_id} sudah diklaim proses lain")
        return 0

    log(f"proses job {job_id}: {job['topic']}")
    try:
        script = generate_script(job["topic"], job.get("language", "id-ID"))
        scenes = script["scenes"]

        with tempfile.TemporaryDirectory() as tmp:
            workdir = Path(tmp)
            audios = generate_tts(scenes, job.get("voice_name", "id-ID-ArdiNeural"), workdir)
            out_path = workdir / "final.mp4"
            render_video(scenes, audios, workdir, out_path)

            links = {}
            dest = job.get("destinations") or {}
            if dest.get("telegram"):
                k = upload_telegram(out_path)
                if k:
                    links[k] = "ok"
            if dest.get("gdrive"):
                link = upload_gdrive(out_path)
                if link:
                    links["gdrive"] = link
            if dest.get("youtube"):
                link = upload_youtube(out_path)
                if link:
                    links["youtube"] = link

        update_job(job_id, status="completed", output_links=links, error_message=None)
        log(f"job {job_id} completed")
        return 0
    except Exception as e:  # noqa: BLE001
        log(f"job {job_id} gagal: {e}")
        update_job(job_id, status="failed", error_message=str(e))
        return 1


if __name__ == "__main__":
    sys.exit(main())