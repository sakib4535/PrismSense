from django.http import FileResponse, HttpResponse
from django.urls import path, include
from django.views.decorators.http import require_GET
from .settings import FRONTEND_DIST


@require_GET
def frontend_app(request):
    index_file = FRONTEND_DIST / 'index.html'
    if not index_file.is_file():
        return HttpResponse(
            'PrismSense frontend has not been built. Run Start-PrismSense.ps1 locally, '
            'or deploy with the project Dockerfile.',
            status=503,
            content_type='text/plain; charset=utf-8',
        )
    return FileResponse(index_file.open('rb'), content_type='text/html; charset=utf-8')


urlpatterns = [path('api/', include('apps.research.urls')), path('', frontend_app)]
handler400 = 'apps.research.views.bad_request'
