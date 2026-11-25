import asyncio
import json
import os
import subprocess
import sys
import tempfile
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
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
GDRIVE_SERVICE_ACCOUNT_JSON = os.environ.get("GDRIVE_SERVICE_ACCOUNT_JSON", "")
GDRIVE_CLIENT_ID = os.environ.get("GDRIVE_CLIENT_ID", "")
GDRIVE_CLIENT_SECRET = os.environ.get("GDRIVE_CLIENT_SECRET", "")
GDRIVE_REFRESH_TOKEN = os.environ.get("GDRIVE_REFRESH_TOKEN", "")

TARGET_JOB_ID = os.environ.get("TARGET_JOB_ID", "").strip()

WIDTH, HEIGHT = 1080, 1920
FPS = 30

# Rantai provider (semua via SDK OpenAI, base_url berbeda).
# Urutan: Gemini -> Groq -> Cloudflare -> SambaNova -> OpenRouter.
PROVIDERS = [
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

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def log(msg: str) -> None:
    print(f"[worker] {msg}", flush=True)


def update_job(job_id: str, **fields) -> None:
    supabase.table("video_jobs").update(fields).eq("id", job_id).execute()


def fetch_job():
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


def generate_script(topic: str, language: str) -> dict:
    prompt = (
        "Buat naskah video pendek vertikal (9:16) berdasarkan topik berikut. "
        "Jawab HANYA JSON valid dengan struktur: "
        '{"title": string, "scenes": [{"text": string, "image_prompt": string}]}. '
        f"Minimal 4 scene, maksimal 8. Bahasa: {language}. Topik: {topic}"
    )
    last_err = None
    for provider in PROVIDERS:
        if not provider["api_key"] or not provider["base_url"]:
            log(f"provider {provider['name']} dilewati (api_key/base_url kosong)")
            continue
        client = OpenAI(base_url=provider["base_url"], api_key=provider["api_key"], timeout=45, max_retries=0)
        log(f"provider {provider['name']} key_len={len(provider['api_key'])}")
        for model in provider["models"]:
            try:
                log(f"generate script with {provider['name']}/{model}")
                resp = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.8,
                )
                content = resp.choices[0].message.content.strip()
                content = content.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                data = json.loads(content)
                if not data.get("scenes"):
                    raise ValueError("scenes kosong")
                return data
            except Exception as e:  # noqa: BLE001
                last_err = e
                body = ""
                resp_obj = getattr(e, "response", None)
                if resp_obj is not None:
                    try:
                        body = resp_obj.text
                    except Exception:  # noqa: BLE001
                        body = ""
                log(f"model {provider['name']}/{model} gagal: {e} | body={body[:300]}")
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
    if not (CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN):
        return False
    url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell"
    try:
        r = requests.post(
            url,
            headers={"Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}"},
            json={"prompt": prompt, "width": WIDTH, "height": HEIGHT},
            timeout=60,
        )
        r.raise_for_status()
        path.write_bytes(r.content)
        log("image (cloudflare flux) -> " + path.name)
        return True
    except Exception as e:  # noqa: BLE001
        log(f"cloudflare image gagal ({e})")
        return False


def download_image(prompt: str, path: Path) -> None:
    encoded = urllib.parse.quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded}?width={WIDTH}&height={HEIGHT}&nologo=true"
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        path.write_bytes(r.content)
        log(f"image -> {path.name}")
        return
    except Exception as e:  # noqa: BLE001
        log(f"pollinations gagal ({e})")

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
                links["youtube"] = "stub (fase 2)"

        update_job(job_id, status="completed", output_links=links, error_message=None)
        log(f"job {job_id} completed")
        return 0
    except Exception as e:  # noqa: BLE001
        log(f"job {job_id} gagal: {e}")
        update_job(job_id, status="failed", error_message=str(e))
        return 1


if __name__ == "__main__":
    sys.exit(main())