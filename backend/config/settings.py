from pathlib import Path
import os
import secrets
import sys

try:
    from . import local_secrets as _local_secrets
except ImportError:
    # The example remains in source control; the real local file is ignored.
    _local_secrets = None

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
LOCAL_SECRETS_FILE = Path(__file__).resolve().with_name('local_secrets.py')
LOCAL_OPENROUTER_API_KEY = str(getattr(_local_secrets, 'OPENROUTER_API_KEY', '') or '').strip()


def _config_value(name, default=''):
    """Prefer deployment/process environment values, then local ignored settings."""
    process_value = os.environ.get(name)
    if process_value is not None and process_value.strip():
        return process_value

    if _local_secrets is not None:
        local_value = getattr(_local_secrets, name, None)
        if local_value is not None and not (isinstance(local_value, str) and not local_value.strip()):
            return local_value
    return default


def _as_bool(value):
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


def _as_list(value):
    if isinstance(value, (list, tuple, set, frozenset)):
        return [str(item).strip() for item in value if str(item).strip()]
    return [item.strip() for item in str(value).split(',') if item.strip()]


IS_VERCEL = bool(os.environ.get('VERCEL'))
DEBUG = _as_bool(_config_value('DJANGO_DEBUG', not IS_VERCEL))
SECRET_KEY = str(_config_value('DJANGO_SECRET_KEY', '') or '').strip()
if not SECRET_KEY and DEBUG:
    SECRET_KEY = secrets.token_urlsafe(50)
if not SECRET_KEY:
    raise RuntimeError('Set DJANGO_SECRET_KEY in your hosting provider settings for production.')

_default_allowed_hosts = '.vercel.app,localhost,127.0.0.1' if IS_VERCEL else 'localhost,127.0.0.1'
ALLOWED_HOSTS = _as_list(_config_value('DJANGO_ALLOWED_HOSTS', _default_allowed_hosts))
INSTALLED_APPS = ['django.contrib.staticfiles', 'apps.research']
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.middleware.common.CommonMiddleware',
]
ROOT_URLCONF = 'backend.config.urls'
WSGI_APPLICATION = 'backend.config.wsgi.application'
ASGI_APPLICATION = 'backend.config.asgi.application'
DATABASES = {}
USE_TZ = True
TIME_ZONE = 'Asia/Dhaka'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
FRONTEND_DIST = BASE_DIR.parent / 'frontend' / 'dist'
# Vite emits URLs beneath /static/app/, so preserve that namespace when
# collectstatic copies the distribution into STATIC_ROOT or Vercel's CDN.
STATICFILES_DIRS = [('app', str(FRONTEND_DIST))] if FRONTEND_DIST.is_dir() else []
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {
        'BACKEND': (
            'django.contrib.staticfiles.storage.StaticFilesStorage'
            if os.environ.get('VERCEL')
            else 'whitenoise.storage.CompressedStaticFilesStorage'
        ),
    },
}
DATA_UPLOAD_MAX_MEMORY_SIZE = 64 * 1024
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'same-origin'
X_FRAME_OPTIONS = 'DENY'
if not DEBUG:
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_SSL_REDIRECT = _as_bool(_config_value('SECURE_SSL_REDIRECT', False))

PPRC_DATA_DIR = Path(_config_value('PPRC_DATA_DIR', str(BASE_DIR / 'data' / 'knowledge')))
OPENROUTER_API_KEY = str(_config_value('OPENROUTER_API_KEY', '') or '').strip()
PPRC_LLM = str(_config_value('PPRC_LLM', 'openrouter') or 'openrouter').strip().lower()
OPENROUTER_BASE_URL = str(_config_value('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1')).rstrip('/')
OPENROUTER_MODEL = str(_config_value('OPENROUTER_MODEL', 'apodex/apodex-1.1-mini:free')).strip()
_public_deploy_url = os.environ.get('RENDER_EXTERNAL_URL', '')
if not _public_deploy_url and os.environ.get('VERCEL_URL'):
    _public_deploy_url = 'https://' + os.environ['VERCEL_URL'].strip().lstrip('/')
OPENROUTER_SITE_URL = str(_config_value(
    'OPENROUTER_SITE_URL', _public_deploy_url or 'http://localhost:5173'
)).strip()
OPENROUTER_APP_NAME = str(_config_value('OPENROUTER_APP_NAME', 'PrismSense-current')).strip()
LLM_TIMEOUT = float(_config_value('LLM_TIMEOUT', '20'))
LLM_RESEARCH_TIMEOUT = float(_config_value('LLM_RESEARCH_TIMEOUT', '60'))
POCKET_PHD_API_URL = str(_config_value('POCKET_PHD_API_URL', '')).strip()
POCKET_PHD_TIMEOUT = float(_config_value('POCKET_PHD_TIMEOUT', '2'))
HOURLY_LIMIT = max(1, int(_config_value('HOURLY_LIMIT', '30')))
TRUST_PROXY_IP = _as_bool(_config_value('TRUST_PROXY_IP', False))
DEMO_ORGS = frozenset({'public'} | set(_as_list(_config_value('DEMO_ORGS', 'PPRC'))))

# Local runs use process-local cache; production can supply a shared Redis URL.
REDIS_URL = str(_config_value('REDIS_URL', '')).strip()
if REDIS_URL:
    CACHES = {'default': {'BACKEND': 'django.core.cache.backends.redis.RedisCache', 'LOCATION': REDIS_URL}}
else:
    CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'prismsense-local'}}

GOOGLE_CLIENT_ID = str(_config_value('GOOGLE_CLIENT_ID', '')).strip()
AUTH_COOKIE_NAME = 'ps_auth'
AUTH_SESSION_SECONDS = max(3600, int(_config_value('AUTH_SESSION_SECONDS', str(30 * 24 * 60 * 60))))
DEMO_SECONDS = 10 * 60
LOCAL_DEMO_NO_EXPIRY = DEBUG and _as_bool(_config_value('LOCAL_DEMO_NO_EXPIRY', True))
DEMO_VISITOR_COOKIE = 'ps_demo_visitor'
DEMO_VISITOR_SECONDS = 365 * 24 * 60 * 60

# Stripe Payment Links are public URLs; secret Stripe keys never belong in Vite.
STRIPE_PAYMENT_LINKS = {
    'researcher': str(_config_value('STRIPE_LINK_RESEARCHER', '')).strip(),
    'team': str(_config_value('STRIPE_LINK_TEAM', '')).strip(),
    'organization': str(_config_value('STRIPE_LINK_ORGANIZATION', '')).strip(),
}
PLAN_PRICE_LABELS = {
    'researcher': _config_value('PRICE_LABEL_RESEARCHER', 'Monthly subscription'),
    'team': _config_value('PRICE_LABEL_TEAM', 'Monthly team subscription'),
    'organization': _config_value('PRICE_LABEL_ORGANIZATION', 'Annual or monthly subscription'),
}
SALES_CONTACT_URL = str(_config_value('SALES_CONTACT_URL', '')).strip()
