"""Safely check PrismSense's configured OpenRouter connection.

Run from the backend directory with: py check_openrouter.py
The script uses the same Django settings and ModelRouter as the application.
It never prints the API key.
"""

from __future__ import annotations

import os
from pathlib import Path
import sys


BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from apps.model_router.router import ModelRouter  # noqa: E402
def main() -> int:
    local_file = settings.LOCAL_SECRETS_FILE
    file_key = settings.LOCAL_OPENROUTER_API_KEY
    loaded_key = (settings.OPENROUTER_API_KEY or "").strip()
    print(f"Backend folder: {settings.BASE_DIR}")
    print(f"Local settings file: {local_file}")
    print(f"Local settings file exists: {local_file.is_file()}")
    print(f"LLM mode: {settings.PPRC_LLM}")
    print(f"OpenRouter model: {settings.OPENROUTER_MODEL}")
    print(f"Key set in local settings file: {bool(file_key)}")
    print(f"Key loaded by Django: {bool(loaded_key)}")
    print(f"Django key matches local settings: {bool(file_key) and loaded_key == file_key}")
    if file_key and loaded_key and file_key != loaded_key:
        print("A non-empty deployment environment value takes precedence over the local key.")

    if not settings.OPENROUTER_API_KEY:
        print("Add OPENROUTER_API_KEY to backend/config/local_secrets.py, save it, then restart Django.")
        return 2
    if settings.PPRC_LLM != "openrouter":
        print('Set PPRC_LLM = "openrouter" in backend/config/local_secrets.py, then restart Django.')
        return 2

    result = ModelRouter().test_connection()
    if not result.get("ok"):
        print("OpenRouter check failed:", result.get("error", "Unknown provider error"))
        return 1

    print("OpenRouter connection succeeded.")
    print("Model reply:", result.get("reply", ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
