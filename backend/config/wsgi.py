import os
import sys
from pathlib import Path
from django.core.wsgi import get_wsgi_application

# Vercel imports this from the repository root; make the existing Django
# project's `config` and `apps` packages importable in that context.
BACKEND_DIR = str(Path(__file__).resolve().parent.parent)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
application=get_wsgi_application()
# Vercel's Python runtime looks for a WSGI/ASGI entrypoint named ``app``.
app = application
