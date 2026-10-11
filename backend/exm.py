"""Compatibility entry point for the OpenRouter connection check.

The key is read by Django from config/local_secrets.py. Never place API keys here.
Run from the backend directory with: python exm.py
"""

from check_openrouter import main


if __name__ == "__main__":
    raise SystemExit(main())