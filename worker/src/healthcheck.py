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
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
GDRIVE_SERVICE_ACCOUNT_JSON = os.environ.get("GDRIVE_SERVICE_ACCOUNT_JSON", "")
GDRIVE_CLIENT_ID = os.environ.get("GDRIVE_CLIENT_ID", "")
GDRIVE_CLIENT_SECRET = os.environ.get("GDRIVE_CLIENT_SECRET", "")
GDRIVE_REFRESH_TOKEN = os.environ.get("GDRIVE_REFRESH_TOKEN", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
CLOUDFLARE_ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
SAMBANOVA_API_KEY = os.environ.get("SAMBANOVA_API_KEY", "")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

PROVIDERS = [
    ("gemini", "https://generativelanguage.googleapis.com/v1beta/openai/", GEMINI_API_KEY, ["gemini-flash-latest"]),
    ("groq", "https://api.groq.com/openai/v1", GROQ_API_KEY, ["openai/gpt-oss-20b"]),
    ("cloudflare", f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1" if CLOUDFLARE_ACCOUNT_ID else "", CLOUDFLARE_API_TOKEN, ["@cf/meta/llama-3.3-70b-instruct-fp8-fast"]),
    ("sambanova", "https://api.sambanova.ai/v1", SAMBANOVA_API_KEY, ["Meta-Llama-3.3-70B-Instruct"]),
    ("openrouter", "https://openrouter.ai/api/v1", OPENROUTER_API_KEY, ["google/gemma-4-31b-it:free"]),
]


def check_llm() -> list:
    out = []
    for name, base, key, models in PROVIDERS:
        if not key or not base:
            out.append((f"{name}", "skip", "no key"))
            continue
        client = OpenAI(base_url=base, api_key=key, timeout=10, max_retries=0)
        ok = False
        detail = ""
        for m in models:
            t0 = time.monotonic()
            try:
                r = client.chat.completions.create(
                    model=m, messages=[{"role": "user", "content": "Balas: OK"}], max_tokens=5, temperature=0
                )
                if r.choices and r.choices[0].message.content:
                    ok = True
                    detail = f"{int((time.monotonic()-t0)*1000)}ms"
                    break
            except Exception as e:  # noqa: BLE001
                detail = str(e)[:60]
        out.append((f"{name}/{models[0]}", "ok" if ok else "fail", detail))
    return out


def check_tts() -> tuple:
    t0 = time.monotonic()
    try:
        import asyncio, edge_tts
        async def _run():
            c = edge_tts.Communicate("tes", "id-ID-ArdiNeural")
            with tempfile.TemporaryDirectory() as d:
                await c.save(str(Path(d) / "t.mp3"))
        asyncio.run(asyncio.wait_for(_run(), timeout=15))
        return "ok", f"{int((time.monotonic()-t0)*1000)}ms"
    except Exception as e:  # noqa: BLE001
        return "fail", str(e)[:80]


def check_supabase() -> tuple:
    t0 = time.monotonic()
    try:
        c = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        c.table("video_jobs").select("id").limit(1).execute()
        return "ok", f"{int((time.monotonic()-t0)*1000)}ms"
    except Exception as e:  # noqa: BLE001
        return "fail", str(e)[:80]


def check_gdrive() -> tuple:
    if not (GDRIVE_REFRESH_TOKEN and GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET):
        if not GDRIVE_SERVICE_ACCOUNT_JSON:
            return "skip", "no creds"
    t0 = time.monotonic()
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        if GDRIVE_REFRESH_TOKEN:
            creds = Credentials(
                token=None,
                refresh_token=GDRIVE_REFRESH_TOKEN,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=GDRIVE_CLIENT_ID,
                client_secret=GDRIVE_CLIENT_SECRET,
                scopes=["https://www.googleapis.com/auth/drive"],
            )
        else:
            from google.oauth2 import service_account
            info = json.loads(GDRIVE_SERVICE_ACCOUNT_JSON)
            creds = service_account.Credentials.from_service_account_info(
                info, scopes=["https://www.googleapis.com/auth/drive"]
            )
        service = build("drive", "v3", credentials=creds)
        service.files().list(pageSize=1, fields="files(id)").execute()
        return "ok", f"{int((time.monotonic()-t0)*1000)}ms"
    except Exception as e:  # noqa: BLE001
        return "fail", str(e)[:80]


def send_telegram(text: str) -> None:
    if not (TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID):
        print(text)
        return
    requests.post(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        json={"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "HTML"},
        timeout=20,
    )


def main() -> int:
    now = time.strftime("%d/%m %H:%M", time.gmtime(time.time() + 7 * 3600))
    lines = [f"🩺 <b>Health Check PabrikKontenAI</b> — {now} WIB", ""]

    llm = check_llm()
    lines.append("<b>LLM</b>")
    for name, st, det in llm:
        icon = "✅" if st == "ok" else ("⏭" if st == "skip" else "❌")
        lines.append(f"{icon} {name} — {det}")

    tts_st, tts_det = check_tts()
    lines.append(f"\n<b>TTS</b>: {'✅' if tts_st=='ok' else '❌'} edge-tts — {tts_det}")

    db_st, db_det = check_supabase()
    lines.append(f"<b>DB</b>: {'✅' if db_st=='ok' else '❌'} supabase — {db_det}")

    gd_st, gd_det = check_gdrive()
    lines.append(f"<b>Drive</b>: {'✅' if gd_st=='ok' else ('⏭' if gd_st=='skip' else '❌')} gdrive — {gd_det}")

    ok = sum(1 for _, s, _ in llm if s == "ok") + (tts_st == "ok") + (db_st == "ok") + (gd_st == "ok")
    total = len(llm) + 3
    lines.append(f"\nRingkas: {ok}/{total} OK")

    send_telegram("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())