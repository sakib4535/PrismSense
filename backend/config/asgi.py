"""ASGI config for the Django application."""

import os

from django.core.asgi import get_asgi_application


os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.config.settings')
application = get_asgi_application()
# Vercel's Python runtime discovers ASGI applications through an ``app`` name.
app = application
