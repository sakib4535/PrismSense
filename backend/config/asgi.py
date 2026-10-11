"""ASGI config for the Django application, including Vercel import support."""

import os
import sys
from pathlib import Path

from django.core.asgi import get_asgi_application


BACKEND_DIR = str(Path(__file__).resolve().parent.parent)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.config.settings')
application = get_asgi_application()
# Vercel's Python runtime discovers ASGI applications through an ``app`` name.
app = application
