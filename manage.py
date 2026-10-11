#!/usr/bin/env python
"""Repository-root Django entrypoint for Vercel and local management commands."""

import os
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent / 'backend'
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')


def main():
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
