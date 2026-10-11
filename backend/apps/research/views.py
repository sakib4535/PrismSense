import json
import logging
import re
import secrets
import time
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from urllib.parse import urlparse

from django.conf import settings
from django.core import signing
from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from apps.agents.orchestrator import ResearchOrchestrator
from apps.agents.query_analyst import QueryAnalystAgent
from apps.agents.service import ResearchAgent
from apps.graphs.agent import GraphAgent
from apps.knowledge.retrieval import get_store
from apps.model_router.router import ModelRouter

MAX_Q = 600
_HITS: dict = {}
AUTH_SALT = 'prismsense.google-session.v1'
VISITOR_SALT = 'prismsense.demo-visitor.v1'
DEMO_RETENTION_SECONDS = 365 * 24 * 60 * 60


def _auth_user(request):
    token = request.COOKIES.get(settings.AUTH_COOKIE_NAME, '')
    if not token:
        return None
    try:
        user = signing.loads(token, salt=AUTH_SALT)
    except signing.BadSignature:
        return None
    if not isinstance(user, dict) or int(user.get('expires_at', 0)) <= int(time.time()):
        return None
    if not user.get('sub') or not user.get('email') or not user.get('email_verified'):
        return None
    return user


def _visitor_id(request):
    visitor = _visitor_payload(request)
    return visitor.get('visitor_id') if visitor else None


def _visitor_payload(request):
    token = request.COOKIES.get(settings.DEMO_VISITOR_COOKIE, '')
    if not token:
        return None
    try:
        visitor = signing.loads(token, salt=VISITOR_SALT)
    except signing.BadSignature:
        return None
    if isinstance(visitor, str) and 20 <= len(visitor) <= 100:
        return {'visitor_id': visitor}
    if isinstance(visitor, dict):
        visitor_id = visitor.get('visitor_id')
        if isinstance(visitor_id, str) and 20 <= len(visitor_id) <= 100:
            return visitor
    return None


def _trial_key(visitor_id):
    return 'prismsense:demo:' + sha256(visitor_id.encode('utf-8')).hexdigest()


def _trial_record(request):
    visitor = _visitor_payload(request)
    visitor_id = visitor.get('visitor_id') if visitor else None
    if not visitor_id:
        return None, None
    if not settings.REDIS_URL:
        record = visitor.get('trial')
        return (record if isinstance(record, dict) else None), None
    try:
        return cache.get(_trial_key(visitor_id)), None
    except Exception:
        logging.getLogger(__name__).exception('Demo session storage is unavailable')
        return None, JsonResponse({
            'error': 'Demo access is temporarily unavailable. Please sign in or try again later.',
            'code': 'DEMO_STORAGE_UNAVAILABLE',
        }, status=503)


def _access_error(request):
    if _auth_user(request):
        return None
    if settings.LOCAL_DEMO_NO_EXPIRY:
        return None
    record, failure = _trial_record(request)
    if failure:
        return failure
    if isinstance(record, dict):
        remaining = int(record.get('expires_at', 0)) - int(time.time())
        if remaining > 0:
            return None
        return JsonResponse({
            'error': 'Your 10-minute free demo has ended. Choose a plan or sign in with Google for full access.',
            'code': 'DEMO_EXPIRED',
        }, status=402)
    return JsonResponse({
        'error': 'Start the free 10-minute demo or sign in with Google to use PrismSense.',
        'code': 'ACCESS_REQUIRED',
    }, status=401)


@require_GET
def access_status(request):
    user = _auth_user(request)
    if user:
        return JsonResponse({'authenticated': True, 'email': user['email'], 'name': user.get('name', '')})
    if settings.LOCAL_DEMO_NO_EXPIRY:
        return JsonResponse({
            'authenticated': False,
            'active': True,
            'expired': False,
            'seconds_remaining': None,
            'local_development': True,
        })
    record, failure = _trial_record(request)
    if failure:
        return failure
    if isinstance(record, dict):
        remaining = max(0, int(record.get('expires_at', 0)) - int(time.time()))
        return JsonResponse({
            'authenticated': False,
            'active': remaining > 0,
            'expired': remaining <= 0,
            'seconds_remaining': remaining,
            'expires_at': int(record.get('expires_at', 0)),
        })
    return JsonResponse({
        'authenticated': False,
        'active': False,
        'expired': False,
        'demo_available': True,
    })


@csrf_exempt
@require_POST
def start_demo(request):
    user = _auth_user(request)
    if user:
        return JsonResponse({'authenticated': True, 'email': user['email'], 'name': user.get('name', '')})
    if settings.LOCAL_DEMO_NO_EXPIRY:
        return JsonResponse({
            'authenticated': False,
            'active': True,
            'expired': False,
            'seconds_remaining': None,
            'local_development': True,
        })
    visitor_payload = _visitor_payload(request)
    visitor_id = visitor_payload.get('visitor_id') if visitor_payload else None
    new_cookie = not visitor_id
    visitor_id = visitor_id or secrets.token_urlsafe(32)
    if settings.REDIS_URL:
        key = _trial_key(visitor_id)
        try:
            record = cache.get(key)
            if record is None:
                record = {'started_at': int(time.time()), 'expires_at': int(time.time()) + settings.DEMO_SECONDS}
                if not cache.add(key, record, timeout=DEMO_RETENTION_SECONDS):
                    record = cache.get(key)
            if not isinstance(record, dict):
                raise RuntimeError('demo session could not be recorded')
        except Exception:
            logging.getLogger(__name__).exception('Could not create demo session')
            return JsonResponse({
                'error': 'Demo access is temporarily unavailable. Please try again later.',
                'code': 'DEMO_STORAGE_UNAVAILABLE',
            }, status=503)
    else:
        record = visitor_payload.get('trial') if visitor_payload else None
        if not isinstance(record, dict):
            record = {'started_at': int(time.time()), 'expires_at': int(time.time()) + settings.DEMO_SECONDS}
        new_cookie = True

    remaining = int(record.get('expires_at', 0)) - int(time.time())
    if remaining <= 0:
        return JsonResponse({
            'error': 'Your 10-minute free demo has ended. Choose a plan or sign in with Google for full access.',
            'code': 'DEMO_EXPIRED',
        }, status=402)
    response = JsonResponse({
        'authenticated': False,
        'active': True,
        'seconds_remaining': remaining,
        'expires_at': int(record['expires_at']),
    })
    if new_cookie:
        cookie_value = visitor_id if settings.REDIS_URL else {'visitor_id': visitor_id, 'trial': record}
        response.set_cookie(
            settings.DEMO_VISITOR_COOKIE,
            signing.dumps(cookie_value, salt=VISITOR_SALT),
            max_age=settings.DEMO_VISITOR_SECONDS,
            httponly=True,
            secure=not settings.DEBUG,
            samesite='Lax',
            path='/',
        )
    return response


@require_GET
def auth_config(request):
    return JsonResponse({'google_client_id': settings.GOOGLE_CLIENT_ID})


@csrf_exempt
@require_POST
def google_login(request):
    if not settings.GOOGLE_CLIENT_ID:
        return JsonResponse({'error': 'Google sign-in is not configured yet.', 'code': 'GOOGLE_NOT_CONFIGURED'}, status=503)
    data = _data(request)
    credential = str((data or {}).get('credential') or '')
    if not credential or len(credential) > 12000:
        return JsonResponse({'error': 'Google did not return a valid sign-in credential.'}, status=400)
    try:
        from google.auth.transport.requests import Request as GoogleRequest
        from google.oauth2 import id_token
        claims = id_token.verify_oauth2_token(credential, GoogleRequest(), settings.GOOGLE_CLIENT_ID)
    except Exception:
        logging.getLogger(__name__).info('Google sign-in token could not be verified')
        return JsonResponse({'error': 'Google sign-in could not be verified. Please try again.'}, status=401)
    email = str(claims.get('email') or '').strip().lower()
    subject = str(claims.get('sub') or '')
    if not email or not subject or claims.get('email_verified') is not True:
        return JsonResponse({'error': 'Use a Google account with a verified email address.'}, status=403)
    expires_at = int(time.time()) + settings.AUTH_SESSION_SECONDS
    user = {'sub': subject, 'email': email, 'name': str(claims.get('name') or '')[:160],
            'email_verified': True, 'expires_at': expires_at}
    response = JsonResponse({'authenticated': True, 'email': email, 'name': user['name']})
    response.set_cookie(
        settings.AUTH_COOKIE_NAME,
        signing.dumps(user, salt=AUTH_SALT),
        max_age=settings.AUTH_SESSION_SECONDS,
        httponly=True,
        secure=not settings.DEBUG,
        samesite='Lax',
        path='/',
    )
    return response


@csrf_exempt
@require_POST
def auth_logout(request):
    response = JsonResponse({'authenticated': False})
    response.delete_cookie(settings.AUTH_COOKIE_NAME, path='/', samesite='Lax')
    return response


@require_GET
def billing_plans(request):
    return JsonResponse({
        'prices': settings.PLAN_PRICE_LABELS,
        'checkout_available': {key: bool(value) for key, value in settings.STRIPE_PAYMENT_LINKS.items()},
        'sales_contact_url': settings.SALES_CONTACT_URL,
    })


@csrf_exempt
@require_POST
def billing_checkout(request):
    data = _data(request)
    plan = str((data or {}).get('plan') or '')
    link = settings.STRIPE_PAYMENT_LINKS.get(plan)
    parsed = urlparse(link or '')
    if not link or parsed.scheme != 'https' or not parsed.netloc:
        return JsonResponse({
            'error': 'Checkout is not configured for this plan yet. Sign in with Google for full access.',
            'code': 'CHECKOUT_NOT_CONFIGURED',
        }, status=503)
    return JsonResponse({'checkout_url': link})


def _limited(request) -> bool:
    # Only honor forwarded client IP when the deployment explicitly declares
    # that a trusted reverse proxy overwrites this header.
    ip = request.META.get("REMOTE_ADDR", "?")
    if settings.TRUST_PROXY_IP and request.META.get("HTTP_X_FORWARDED_FOR"):
        ip = request.META["HTTP_X_FORWARDED_FOR"].split(",")[0].strip() or ip
    now = time.time()
    hits = [t for t in _HITS.get(ip, []) if now - t < 3600]
    if len(hits) >= settings.HOURLY_LIMIT:
        _HITS[ip] = hits
        return True
    hits.append(now)
    _HITS[ip] = hits
    if len(_HITS) > 5000:
        _HITS.clear()
    return False


def _data(request):
    try:
        value = json.loads(request.body or "{}")
        return value if isinstance(value, dict) else None
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


def _question(request):
    data = _data(request)
    if data is None:
        return None, None, JsonResponse({"error": "Invalid JSON"}, status=400)
    question = str(data.get("question") or "").strip()
    if not question:
        return None, None, JsonResponse({"error": "question is required"}, status=400)
    if len(question) > MAX_Q:
        return None, None, JsonResponse({"error": f"Keep questions under {MAX_Q} characters."}, status=400)
    return data, question, None


def _run(request, long_form):
    data, question, bad = _question(request)
    if bad:
        return bad
    blocked = _access_error(request)
    if blocked:
        return blocked
    if _limited(request):
        return JsonResponse({"error": "Request limit reached for this hour. Please try again later."}, status=429)
    style = data.get("citation_style") if data.get("citation_style") in ("APA", "MLA", "Chicago", "Harvard") else "APA"
    selected = data.get("selected_evidence")
    ids = [str(x)[:120] for x in selected[:40]] if isinstance(selected, list) else []
    if long_form:
        agent = ResearchOrchestrator(settings.DEMO_ORGS)
        output = agent.run(question, style, "report", limit=10, long_form=True, selected_ids=ids)
        output["workflow"] = "research-orchestrator"
    else:
        agent = ResearchAgent(settings.DEMO_ORGS)
        output = agent.run(question, style, "brief", selected_ids=ids)
        output["workflow"] = "desk-agent"
    output.pop("selected_evidence", None)
    return JsonResponse(output)


@require_GET
def health(request):
    return JsonResponse({"status": "ok", "service": "prismsense"})


@csrf_exempt
@require_POST
def model_check(request):
    blocked = _access_error(request)
    if blocked:
        return blocked
    if _limited(request):
        return JsonResponse({"error": "Request limit reached for this hour. Please try again later."}, status=429)
    result = ModelRouter().test_connection()
    return JsonResponse(result, status=200 if result.get("ok") else 503)


@csrf_exempt
@require_POST
def ask(request):
    return _run(request, False)


@csrf_exempt
@require_POST
def orchestrate(request):
    return _run(request, True)


@csrf_exempt
@require_POST
def progga(request):
    """Choose focused specialists for Progga, unless the user requests all agents."""
    data, question, bad = _question(request)
    if bad:
        return bad
    blocked = _access_error(request)
    if blocked:
        return blocked
    if _limited(request):
        return JsonResponse({"error": "Request limit reached for this hour. Please try again later."}, status=429)

    style = data.get("citation_style") if data.get("citation_style") in ("APA", "MLA", "Chicago", "Harvard") else "APA"
    selected = data.get("selected_evidence")
    ids = [str(x)[:120] for x in selected[:40]] if isinstance(selected, list) else []
    context = data.get("context") if isinstance(data.get("context"), str) else ""
    context = re.sub(r"\s+", " ", context).strip()[:2400]
    routing_text = f"{context} {question}".lower()
    requested_all = data.get("agent_mode") == "all" or bool(re.search(
        r"\b(?:all|every|each)\s+(?:(?:of\s+)?the\s+)?(?:four\s+)?agents?\b|"
        r"\b(?:whole|entire)\s+(?:agent\s+)?team\b|\bevery specialist\b",
        question.lower(),
    ))

    query_intent = bool(re.search(
        r"\b(research questions?|methodolog(?:y|ies)|research methods?|theor(?:y|ies)|frameworks?|hypotheses|hypothesis|"
        r"study design|research proposal|refine (?:my|this|the) idea|turn .* into .* questions?)\b",
        routing_text,
    ))
    research_intent = bool(re.search(
        r"\b(comprehensive|in[- ]depth|deep dive|long[- ]form|full report|research report|literature review|"
        r"critical analysis|implications and limitations|detailed report|write a report|prepare a report|make a report|detailed analysis)\b",
        routing_text,
    ))
    graph_intent = bool(re.search(
        r"\b(dataset|indicator|numeric|numbers|chart|graph|plot|visuali[sz]e|trend|over time|"
        r"growth rate|percentage|percent|compare values|time series)\b",
        routing_text,
    )) or bool(re.search(r"\bdata\b", routing_text) and re.search(
        r"\b(compare|show|plot|chart|trend|change|growth|over time|between years?)\b", routing_text,
    ))

    if requested_all:
        selected_agents = ("query", "desk", "research", "graph")
    elif query_intent:
        selected_agents = ("query",)
    elif research_intent:
        selected_agents = ("research", "graph") if graph_intent else ("research",)
    elif graph_intent:
        selected_agents = ("desk", "graph")
    else:
        selected_agents = ("desk",)

    run_question = question
    if context:
        run_question = (
            f"Conversation background (use only where relevant): {context}\n\n"
            f"Current request: {question}"
        )

    def run_query_agent():
        return QueryAnalystAgent().process({"stage": "generate_questions", "idea": run_question})

    def run_desk_agent():
        return ResearchAgent(settings.DEMO_ORGS).run(
            run_question, style, "brief", selected_ids=ids, include_graph=False,
        )

    def run_research_agent():
        return ResearchOrchestrator(settings.DEMO_ORGS).run(
            run_question, style, "report", limit=10, long_form=True,
            selected_ids=ids, include_graph=False,
        )

    def run_graph_agent():
        return GraphAgent().generate(run_question)

    runners = {
        "query": run_query_agent,
        "desk": run_desk_agent,
        "research": run_research_agent,
        "graph": run_graph_agent,
    }
    agent_results = {}
    with ThreadPoolExecutor(max_workers=len(selected_agents), thread_name_prefix="progga-agent") as pool:
        futures = {name: pool.submit(runners[name]) for name in selected_agents}
        for name, future in futures.items():
            try:
                agent_results[name] = future.result()
            except Exception:
                logging.getLogger(__name__).exception("Progga %s agent failed", name)
                agent_results[name] = None

    desk = agent_results.get("desk") or {}
    research_result = agent_results.get("research")
    research_failed = "research" in selected_agents and not bool(research_result)
    query = agent_results.get("query") or {}
    graph = agent_results.get("graph")

    # Prefer the detailed report when available. A concise brief is the fallback
    # when both were requested; a Query-only run remains a structured answer.
    report = research_result or desk or {}
    if not report and not query and graph is None:
        return JsonResponse({"error": "Progga could not complete this request. Please try again."}, status=502)

    agents = {}
    if "query" in selected_agents:
        agents["query"] = {
            "status": "complete" if query and query.get("ok") else "failed",
            "note": str(query.get("chat_message") or query.get("summary") or query.get("error") or "")[:1200],
        }
    if "desk" in selected_agents:
        agents["desk"] = {
            "status": "complete" if desk else "failed",
            "answer": str(desk.get("answer") or "")[:6000],
            "quality": desk.get("quality"),
            "model": desk.get("model"),
        }
    if "research" in selected_agents:
        agents["research"] = {
            "status": "failed" if research_failed else "complete",
            "quality": (research_result or {}).get("quality"),
            "model": (research_result or {}).get("model"),
        }
    if "graph" in selected_agents:
        graph = graph or {}
        graph_has_data = bool(graph.get("plots") or graph.get("available_series"))
        agents["graph"] = {
            "status": "failed" if agent_results.get("graph") is None else "complete" if graph_has_data else "no_data",
            "plots": len(graph.get("plots") or []),
            "series": len(graph.get("available_series") or []),
        }

    primary_agent = "research" if research_result else "desk" if desk else "query" if query else "graph"
    answer = str(report.get("answer") or "")
    if not answer and query:
        answer = str(query.get("chat_message") or query.get("summary") or query.get("error") or "")

    output = dict(report)
    output.update({
        "question": question,
        "answer": answer,
        "agents": agents,
        "primary_agent": primary_agent,
        "workflow": "progga-central",
        "trace": [*report.get("trace", [])],
    })
    if query:
        output["query_agent"] = query
    if "graph" in selected_agents:
        output["graph_agent"] = graph or {}
    else:
        output.pop("graph_agent", None)
    if primary_agent == "query":
        output.setdefault("evidence", [])
        output.setdefault("figures", [])
        output.setdefault("references", [])
        output.setdefault("markdown", answer)
    output.pop("selected_evidence", None)
    for name, state in agents.items():
        output["trace"].insert(0, {
            "stage": f"agent_{name}",
            "status": state["status"],
            "detail": "Selected for this request",
        })
    return JsonResponse(output)


@csrf_exempt
@require_POST
def query_analyst(request):
    data = _data(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    blocked = _access_error(request)
    if blocked:
        return blocked
    agent = QueryAnalystAgent()
    result = agent.process(data)
    return JsonResponse(result, status=200 if result.get("ok", True) else 400)







@csrf_exempt
@require_POST
def graph_agent(request):
    data, question, bad = _question(request)
    if bad:
        return bad
    blocked = _access_error(request)
    if blocked:
        return blocked
    try:
        count = max(1, min(12, int(data.get("max_charts", 6))))
    except (TypeError, ValueError):
        count = 6
    selected = data.get("selected_series")
    selected = selected if isinstance(selected, list) else None
    return JsonResponse(GraphAgent().generate(
        question, count, selected_series=selected,
        start_year=data.get("start_year"), end_year=data.get("end_year"),
    ))


@require_GET
def library(request):
    blocked = _access_error(request)
    if blocked:
        return blocked
    store, orgs = get_store(), settings.DEMO_ORGS
    query = (request.GET.get("q") or "").strip()[:200]
    try:
        limit = min(300, max(1, int(request.GET.get("limit", "100"))))
    except ValueError:
        limit = 100
    def year(key):
        try:
            return int(request.GET[key]) if request.GET.get(key) else None
        except ValueError:
            return None
    docs = store.document_catalog(query, limit, orgs)
    total = sum(1 for item in store.docs if str(item.get("owner", "public")) in orgs)
    return JsonResponse({"documents": docs, "figures": store.figure_catalog(query, limit, year("start_year"), year("end_year")),
                         "counts": {"documents": total, "figures": len(store.figures)}})


def bad_request(request, exception=None):
    logging.getLogger(__name__).warning("400 on %s: %s", request.path, str(exception)[:160])
    return JsonResponse({"error": "Bad request"}, status=400)
