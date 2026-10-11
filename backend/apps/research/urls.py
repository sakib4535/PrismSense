from django.urls import path
from .views import (
    access_status, ask, auth_config, auth_logout, billing_checkout, billing_plans,
    google_login, graph_agent, health, library, model_check, orchestrate, progga, query_analyst, start_demo,
)

urlpatterns = [
    path('health/', health),
    path('model-check/', model_check),
    path('access/status/', access_status),
    path('demo/start/', start_demo),
    path('auth/config/', auth_config),
    path('auth/google/', google_login),
    path('auth/logout/', auth_logout),
    path('billing/plans/', billing_plans),
    path('billing/checkout/', billing_checkout),
    path('ask/', ask),
    path('orchestrate/', orchestrate),
    path('progga/', progga),
    path('query-analyst/', query_analyst),
    path('graph-agent/', graph_agent),
    path('library/', library),
]
