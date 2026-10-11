"""Template for local PrismSense settings.

Copy this file to local_secrets.py, then put a valid OpenRouter inference key
in OPENROUTER_API_KEY. The real local_secrets.py is ignored by Git.
"""

DJANGO_DEBUG = True
DJANGO_ALLOWED_HOSTS = ["localhost", "127.0.0.1"]
DJANGO_SECRET_KEY = ""  # Django generates a temporary key automatically in local debug mode.
LOCAL_DEMO_NO_EXPIRY = True

PPRC_LLM = "openrouter"
OPENROUTER_API_KEY = ""
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_MODEL = "apodex/apodex-1.1-mini:free"
OPENROUTER_SITE_URL = "http://localhost:5173"
OPENROUTER_APP_NAME = "PrismSense-current"
LLM_TIMEOUT = 20
LLM_RESEARCH_TIMEOUT = 60

# Optional integrations. Leave these blank for local OpenRouter use.
GOOGLE_CLIENT_ID = ""
REDIS_URL = ""
STRIPE_LINK_RESEARCHER = ""
STRIPE_LINK_TEAM = ""
STRIPE_LINK_ORGANIZATION = ""
SALES_CONTACT_URL = ""
