"""Dapatkan GDrive refresh token (OAuth user) untuk upload ke My Drive pribadi.

Pakai:
  pip install google-auth-oauthlib
  python scripts/gdrive_oauth.py <path-ke-client_secret.json>

Setelah itu salin nilai "refresh_token" ke secret GitHub: GDRIVE_REFRESH_TOKEN
(plus GDRIVE_CLIENT_ID & GDRIVE_CLIENT_SECRET dari file JSON yang sama).
"""
import json
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/drive"]


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python scripts/gdrive_oauth.py <client_secret.json>")
        return 1
    path = sys.argv[1]
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    client_id = data["installed"]["client_id"]
    client_secret = data["installed"]["client_secret"]

    flow = InstalledAppFlow.from_client_secrets_file(path, SCOPES)
    creds = flow.run_local_server(port=0)

    print("\n=== SALIN NILAI BERIKUT KE GITHUB SECRETS ===")
    print("GDRIVE_CLIENT_ID=" + client_id)
    print("GDRIVE_CLIENT_SECRET=" + client_secret)
    print("GDRIVE_REFRESH_TOKEN=" + (creds.refresh_token or "TIDAK ADA (coba lagi)"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())