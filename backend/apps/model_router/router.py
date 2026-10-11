from __future__ import annotations

import json
import re
import time
from typing import Any

import requests
from django.conf import settings


SYSTEM_PROMPT = """You are PrismSense's research synthesis engine.

Your job is to turn a user research question and a bounded evidence packet into a clear, structured, nuanced research brief.
The query manager has already determined intent, date restrictions, and evidence scope. You must NOT broaden the scope.

CORE PRINCIPLES
1. Answer the actual question first. Never begin with filler such as "The available evidence indicates".
2. Use ONLY facts supported by the supplied evidence packet. Never invent facts, numbers, years, causes, explanations, or implications.
3. Synthesize. Do not copy, paraphrase sentence-by-sentence, or concatenate source passages.
4. Every material factual statement must cite one or more supplied markers such as [S1] or [F2].
5. Never expose source metadata, document titles, URLs, document dates, raw source labels, or a References section in the answer.
6. Respect the query's year restriction exactly. If the request is for 2020, do not discuss 2019 or 2022. If it is 2020-2025, use only evidence points inside that interval.
7. For data/analysis questions, prioritize the requested values and describe the pattern only when the supplied values support it. Do not infer a trend from a single point.
8. For descriptive questions, describe the evidence precisely and concretely.
9. For explanatory questions, distinguish observed evidence from explanation. Only state a mechanism or implication when the evidence supports it.
10. For exploratory questions, surface the strongest supported patterns, contrasts, tensions, and unanswered questions. Do not manufacture hypotheses as facts.
11. For comparison questions, compare like with like and identify the dimensions actually supported by the evidence.
12. Use varied sentence structure and professional research prose. Avoid repetitive sentence openings.
13. For Agent Research requests, produce a substantive long-form research report of at least 500 words. Do not pad: add evidence-grounded reasoning, cross-evidence connections, critical tensions, implications, limitations, and a conclusion. For Agent Desk requests, remain concise unless the user explicitly asks for depth.
14. If evidence is insufficient for an important part of the question, say exactly what is missing instead of filling the gap.
15. Do not write a source passage as the answer. Compress multiple evidence items into original prose where possible. Never use a source title, abstract label, or document metadata as a finding heading.
16. For an analytical query, separate observed values from interpretation: never claim a cause unless the evidence explicitly supports it.
17. Prefer 2-4 high-value findings over many small observations. Every finding must earn its place by answering part of the question.
18. Use polished Markdown inside text fields: short paragraphs, meaningful headings, and concise bullet lists when they improve scanning. Bold only the most important labels or figures. Avoid long unbroken blocks of text.
19. Treat the supplied JSON evidence packet as the required knowledge base for this answer. Read both narrative facts and numeric facts, use only relevant items, and synthesize them with the requested question and format. Never substitute general model knowledge for missing evidence.

OUTPUT CONTRACT
Return JSON only. Use this exact shape:
{
  "lead": "Direct answer.",
  "lead_citations": ["S1"],
  "executive_summary": "A substantive orientation to the research question.",
  "executive_summary_citations": ["S1"],
  "findings": [
    {"heading": "Unique analytical heading", "text": "Evidence-grounded finding with interpretation.", "citations": ["S1"]}
  ],
  "critical_analysis": "Cross-evidence analysis that connects quantitative and narrative evidence without inventing causality.",
  "critical_analysis_citations": ["S1", "F2"],
  "synthesis": "The broader supported interpretation.",
  "synthesis_citations": ["S1", "F2"],
  "implications": "What the evidence reasonably implies for understanding the issue; distinguish implication from proven causality.",
  "implications_citations": ["S2"],
  "critical_aspects": "Important tensions, trade-offs, distributional issues, methodological concerns, or contextual dimensions supported by evidence.",
  "critical_aspects_citations": ["S3"],
  "limitations": "Evidence gaps, comparability problems, missing years, measurement limitations, or uncertainty.",
  "limitations_citations": ["S4"],
  "data_points": [
    {"label": "Metric or series", "year": "2022", "value": "18.7", "unit": "%", "citations": ["F1"]}
  ],
  "caveat": "A precise limitation only when the evidence warrants one. Otherwise empty string.",
  "caveat_citations": ["S3"],
  "conclusion": "A concise concluding synthesis that answers the research question without introducing new unsupported claims.",
  "conclusion_citations": ["S1"]
}

Every lead, finding, synthesis, and evidence-based caveat must carry at least one citation marker in its corresponding citations array.
Do not put citations inside the JSON text fields. Put them only in the citations arrays.
Do not create data_points unless the evidence packet contains explicit numeric data.
"""


_SESSION = requests.Session()


class ModelRouter:
    """OpenRouter synthesis gateway with a deterministic grounded fallback."""

    def __init__(self):
        self.mode = str(getattr(settings, "PPRC_LLM", "grounded")).lower()
        self.model = getattr(settings, "OPENROUTER_MODEL", "apodex/apodex-1.1-mini:free")
        self.last_error = ""
        if self.mode not in ("openrouter", "grounded"):
            self.last_error = "Unsupported model mode; set PPRC_LLM=openrouter or grounded"
        elif self.mode == "openrouter" and not settings.OPENROUTER_API_KEY:
            self.last_error = "OPENROUTER_API_KEY is empty in Django settings; add it to backend/config/local_secrets.py, then restart Django"

    def status(self) -> dict:
        configured = self.mode == "openrouter" and bool(settings.OPENROUTER_API_KEY)
        return {
            "configured": configured,
            "available": configured and not self.last_error,
            "mode": self.mode,
            "provider": "OpenRouter" if self.mode == "openrouter" else "Grounded fallback",
            "model": self.model if self.mode == "openrouter" else None,
            "error": self.last_error,
        }

    def result_status(self, used_for_answer: bool, evidence_count: int) -> dict[str, Any]:
        """Report what actually happened in this research run, not just configuration."""
        result = self.status()
        result["used_for_answer"] = bool(used_for_answer)
        if used_for_answer:
            result["request_status"] = "used"
            result["answer_source"] = "knowledge_base_plus_model"
        elif evidence_count <= 0:
            result["request_status"] = "not_attempted_no_evidence"
            result["answer_source"] = "knowledge_base_only"
            result["error"] = "No matching knowledge-base evidence was retrieved, so the model was not asked to synthesize an answer."
        elif self.mode == "grounded":
            result["request_status"] = "disabled"
            result["answer_source"] = "knowledge_base_only"
            result["error"] = "PPRC_LLM is set to grounded mode, so the OpenRouter model was not called."
        else:
            result["request_status"] = "failed"
            result["answer_source"] = "knowledge_base_only"
            result["error"] = result.get("error") or "OpenRouter did not return a usable structured answer. The visible facts come from the knowledge base."
        return result

    def test_connection(self) -> dict[str, Any]:
        """Make a tiny live request so the app can verify credentials and model access."""
        if self.mode != "openrouter":
            return {"ok": False, "error": "Set PPRC_LLM=openrouter to test the model."}
        if not settings.OPENROUTER_API_KEY:
            return {"ok": False, "error": "Add OPENROUTER_API_KEY to backend/config/local_secrets.py and restart Django."}
        reply = self._post("Reply with exactly MODEL_OK.", temperature=0, timeout=20)
        if reply is None:
            return {"ok": False, "error": self.last_error or "OpenRouter did not return a response."}
        return {"ok": True, "reply": reply.strip()[:160]}

    @staticmethod
    def _strip_wrappers(text: str) -> str:
        text = (text or "").strip()
        text = re.sub(r"^```(?:json|text|markdown)?\s*|\s*```$", "", text, flags=re.I)
        return text.strip()

    @classmethod
    def _clean_json(cls, text: str) -> dict[str, Any] | None:
        text = cls._strip_wrappers(text)
        try:
            payload = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            match = re.search(r"\{.*\}", text, flags=re.S)
            if not match:
                return None
            try:
                payload = json.loads(match.group(0))
            except json.JSONDecodeError:
                return None
        return payload if isinstance(payload, dict) else None

    @staticmethod
    def _assistant_text(content: Any) -> str:
        """Normalize OpenRouter's string and structured text content formats."""
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, dict):
            value = content.get("text")
            return value.strip() if isinstance(value, str) else ""
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict):
                    value = item.get("text")
                    if isinstance(value, str) and item.get("type", "text") in ("text", "output_text"):
                        parts.append(value)
            return "\n".join(part for part in parts if part.strip()).strip()
        return ""

    @staticmethod
    def _packet(evidence: list[dict], plan: dict[str, Any], max_items: int = 8) -> list[dict[str, Any]]:
        """Build a compact, model-facing packet.

        Metadata is deliberately withheld. Numeric figures are represented as structured facts;
        narrative evidence is shortened to reduce copying pressure and latency.
        """
        data_items = [x for x in evidence if x.get("marker", "").startswith("[F")]
        narrative_items = [x for x in evidence if x.get("marker", "").startswith("[S")]
        if plan.get("long_form"):
            max_items = 18
        ordered = (data_items[:8] + narrative_items[: max(0, max_items - min(8, len(data_items)))]) if plan.get("wants_data") else narrative_items[:max_items]
        if not ordered:
            ordered = evidence[:max_items]

        packet = []
        for item in ordered:
            marker = item["marker"]
            if marker.startswith("[F"):
                packet.append({
                    "marker": marker,
                    "type": "data",
                    "label": item.get("title", ""),
                    "year": str(item.get("year", item.get("date", "")))[:4],
                    "value": str(item.get("value", "")),
                    "unit": str(item.get("unit", "")),
                    "fact": item.get("text", "")[:320],
                })
            else:
                text = re.sub(r"\s+", " ", item.get("text", "")).strip()
                # Send a compact factual excerpt. The model must synthesize, not reproduce.
                packet.append({"marker": marker, "type": "narrative", "fact": text[:520]})
        return packet

    def _post(self, prompt: str, temperature: float = 0.2, timeout: float = 0, long_form: bool = False) -> str | None:
        if self.mode != "openrouter" or not settings.OPENROUTER_API_KEY:
            return None
        limit = timeout or (settings.LLM_RESEARCH_TIMEOUT if long_form else settings.LLM_TIMEOUT)
        headers = {
            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        }
        if settings.OPENROUTER_SITE_URL:
            headers["HTTP-Referer"] = settings.OPENROUTER_SITE_URL
        if settings.OPENROUTER_APP_NAME:
            headers["X-Title"] = settings.OPENROUTER_APP_NAME
        base_tokens = 2600 if long_form else (420 if getattr(self, "_desk_mode", False) else 650)
        for attempt in range(2):
            request_body = {
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
                "max_tokens": base_tokens if attempt == 0 else min(max(base_tokens * 2, 1000), 4096),
            }
            if attempt == 0:
                # Keep the existing reasoning behavior for the first attempt.
                request_body["reasoning"] = {"enabled": True}
            else:
                # Some routed providers spend the first output budget on reasoning and return
                # no user-facing content. Retry once with reasoning disabled and more room.
                request_body["reasoning"] = {"enabled": False}
            try:
                response = _SESSION.post(
                    f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                    headers=headers,
                    json=request_body,
                    timeout=(3, limit),
                )
                response.raise_for_status()
                payload = response.json()
                choices = payload.get("choices") if isinstance(payload, dict) else None
                if not choices:
                    provider_error = payload.get("error", {}) if isinstance(payload, dict) else {}
                    detail = provider_error.get("message", "") if isinstance(provider_error, dict) else str(provider_error)
                    if settings.OPENROUTER_API_KEY:
                        detail = str(detail).replace(settings.OPENROUTER_API_KEY, "[redacted]")
                    suffix = f": {detail[:240]}" if detail else ""
                    self.last_error = f"OpenRouter returned no completion choices{suffix}"
                    return None

                choice = choices[0] if isinstance(choices[0], dict) else {}
                message = choice.get("message", {})
                content = self._assistant_text(message.get("content") if isinstance(message, dict) else None)
                if content:
                    self.last_error = ""
                    return content

                if attempt == 0:
                    continue
                finish_reason = str(choice.get("finish_reason") or "unknown")
                response_model = str(payload.get("model") or self.model)[:100]
                provider = str(payload.get("provider") or "unknown")[:80]
                self.last_error = (
                    "OpenRouter returned no user-facing text after one retry "
                    f"(finish_reason={finish_reason}, model={response_model}, provider={provider}). "
                    "The provider may have exhausted its output limit or returned reasoning without a final answer."
                )
                return None
            except requests.HTTPError as error:
                response = error.response
                detail = ""
                if response is not None:
                    try:
                        payload = response.json()
                        provider_error = payload.get("error", {}) if isinstance(payload, dict) else {}
                        detail = str(provider_error.get("message", "")) if isinstance(provider_error, dict) else str(provider_error)
                    except (ValueError, AttributeError):
                        detail = ""
                    detail = detail.replace(settings.OPENROUTER_API_KEY, "[redacted]") if settings.OPENROUTER_API_KEY else detail
                status = response.status_code if response is not None else "unknown"
                suffix = f": {detail[:240]}" if detail else ""
                self.last_error = f"OpenRouter returned HTTP {status}{suffix}"
                return None
            except Exception as error:
                self.last_error = f"OpenRouter request failed: {type(error).__name__} {str(error)[:140]}"
                return None
        return None

    def generate(self, user: str, evidence: list[dict], plan: dict[str, Any], repair_feedback: str = "") -> dict[str, Any] | None:
        if self.mode != "openrouter" or not settings.OPENROUTER_API_KEY:
            return None
        packet = self._packet(evidence, plan)
        style_rule = {
            "descriptive": "Describe what the evidence shows, with concrete detail and no invented context.",
            "explanatory": "Explain supported relationships and distinguish evidence from interpretation.",
            "exploratory": "Surface the strongest patterns, contrasts, tensions, and evidence-backed questions.",
            "comparison": "Compare only supported dimensions and make the contrast explicit.",
            "question": "Answer directly, then support the answer with the strongest evidence.",
            "data": "Lead with the requested data, show the relevant values, then interpret the supported pattern.",
            "analysis": "Analyze the requested evidence, connecting values and narratives without inventing causality.",
        }.get(plan.get("intent"), "Write clear, evidence-grounded research prose.")
        desk_rules = """DESK AGENT MODE
Give the direct answer first in 1-2 concise sentences, then use 2-4 short Markdown bullets for the strongest supporting findings when the question needs them. Keep the whole answer normally under 160 words. Use **bold** sparingly for key values or terms. Do not add an executive summary, separate analysis or conclusion sections, generic caveats, or background the user did not ask for. Cite every factual claim using supplied markers in the citations arrays. If evidence is insufficient, do not fill the gap with general knowledge.
""" if plan.get("persona") == "desk" else ""
        long_form_rules = """
MASTER RESEARCH ORCHESTRATOR MODE
Produce a report of at least 500 words and preferably 600-900 words when the evidence supports it. Structure the report as:
1) Direct answer / executive framing
2) 4-6 distinct key findings with unique, meaningful headings
3) Data and trend interpretation when numeric evidence exists
4) Critical analysis: connect evidence across sources, identify patterns, tensions, distributional effects, mechanisms only where supported, and distinguish observation from interpretation
5) Broader implications: explain what the evidence means for researchers, policy, institutions, or the issue being studied, without making unsupported recommendations
6) Critical aspects and evidence gaps: identify limitations, contradictions, comparability problems, missing years, measurement issues, or unresolved questions
7) Conclusion: synthesize the argument without introducing new facts
Use generous paragraph development, then add concise Markdown bullets where they make evidence or implications easier to scan. Each finding should normally contain a developed 2-4 sentence explanation, not a fragment. Use the knowledge-base details actively: connect multiple evidence items when they support the same argument, surface meaningful contrasts, and develop original analytical framing. Creativity means better synthesis and clearer argumentation, not invented facts. Do not repeat the same idea across sections. Do not use generic headings such as 'Evidence finding' or 'Finding' repeatedly. Do not quote or reproduce source passages. Do not invent examples, causes, statistics, actors, dates, or policy effects.
""" if plan.get("long_form") else ""
        feedback = f"\nQUALITY REVIEW — REPAIR THESE SPECIFIC FAILURES:\n{repair_feedback}\n" if repair_feedback else ""
        prompt = (
            f"{SYSTEM_PROMPT}\n\n"
            f"QUERY MANAGEMENT:\n{plan.get('management_instruction', '')}\n"
            f"INTENT: {plan.get('intent')}\n"
            f"WRITING MODE: {style_rule}\n" f"{desk_rules}{long_form_rules}\n"
            f"QUESTION:\n{user}\n\n"
            f"BOUNDED EVIDENCE PACKET:\n{json.dumps(packet, ensure_ascii=False)}\n"
            f"{feedback}\n"
            "Before writing, internally select only evidence that directly answers the question. Do not expose your internal reasoning."
            " Return only the JSON object required by the output contract."
        )
        self._desk_mode = plan.get("persona") == "desk"
        raw = self._post(prompt, long_form=bool(plan.get("long_form")))
        payload = self._clean_json(raw or "")
        if not payload:
            if raw is not None: self.last_error = "Model replied but not in the required JSON format"
            return None
        return self._normalize_payload(payload)

    @staticmethod
    def _normalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
        findings = payload.get("findings") if isinstance(payload.get("findings"), list) else []
        normalized_findings = []
        for item in findings[:5]:
            if not isinstance(item, dict):
                continue
            citations = [str(x) for x in item.get("citations", []) if re.fullmatch(r"[SF]\d+", str(x))]
            normalized_findings.append({
                "heading": str(item.get("heading", "Finding")).strip()[:100] or "Finding",
                "text": str(item.get("text", "")).strip(),
                "citations": citations,
            })
        data_points = []
        for item in (payload.get("data_points") if isinstance(payload.get("data_points"), list) else [])[:10]:
            if not isinstance(item, dict):
                continue
            citations = [str(x) for x in item.get("citations", []) if re.fullmatch(r"[SF]\d+", str(x))]
            data_points.append({
                "label": str(item.get("label", "")).strip(),
                "year": str(item.get("year", "")).strip(),
                "value": str(item.get("value", "")).strip(),
                "unit": str(item.get("unit", "")).strip(),
                "citations": citations,
            })
        def norm_citations(value):
            if not isinstance(value, list):
                return []
            return [str(x) for x in value if re.fullmatch(r"[SF]\d+", str(x))][:6]

        def norm_text(name):
            return str(payload.get(name, "")).strip()
        return {
            "lead": norm_text("lead"),
            "lead_citations": norm_citations(payload.get("lead_citations")),
            "executive_summary": norm_text("executive_summary"),
            "executive_summary_citations": norm_citations(payload.get("executive_summary_citations")),
            "findings": normalized_findings,
            "critical_analysis": norm_text("critical_analysis"),
            "critical_analysis_citations": norm_citations(payload.get("critical_analysis_citations")),
            "synthesis": norm_text("synthesis"),
            "synthesis_citations": norm_citations(payload.get("synthesis_citations")),
            "implications": norm_text("implications"),
            "implications_citations": norm_citations(payload.get("implications_citations")),
            "critical_aspects": norm_text("critical_aspects"),
            "critical_aspects_citations": norm_citations(payload.get("critical_aspects_citations")),
            "limitations": norm_text("limitations"),
            "limitations_citations": norm_citations(payload.get("limitations_citations")),
            "data_points": data_points,
            "caveat": norm_text("caveat"),
            "caveat_citations": norm_citations(payload.get("caveat_citations")),
            "conclusion": norm_text("conclusion"),
            "conclusion_citations": norm_citations(payload.get("conclusion_citations")),
        }

