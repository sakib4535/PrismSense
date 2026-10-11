"""WSGI config for the Django application."""

import os

from django.core.wsgi import get_wsgi_application


os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.config.settings')
application = get_wsgi_application()
# Vercel's Python runtime discovers WSGI applications through an ``app`` name.
app = application
