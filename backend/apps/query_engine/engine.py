from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any

import requests
from django.conf import settings

YEAR = re.compile(r"(?<!\d)(19\d{2}|20\d{2}|21\d{2})(?!\d)")
RANGE = re.compile(r"(?<!\d)(19\d{2}|20\d{2}|21\d{2})\s*(?:-|–|—|to|through|until)\s*(19\d{2}|20\d{2}|21\d{2})(?!\d)", re.I)


@dataclass(frozen=True)
class QueryPlan:
    original: str
    intent: str
    start_year: int | None
    end_year: int | None
    exact_year: int | None
    wants_data: bool
    wants_explanation: bool
    wants_exploration: bool
    wants_comparison: bool
    keywords: list[str]
    management_instruction: str
    planner_source: str = "deterministic"

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class PocketPhDManager:
    """Optional query-management adapter. It never writes the final answer."""

    def __init__(self):
        self.url = getattr(settings, "POCKET_PHD_API_URL", "").strip()
        self.timeout = float(getattr(settings, "POCKET_PHD_TIMEOUT", "4"))

    def plan(self, question: str) -> dict[str, Any] | None:
        if not self.url:
            return None
        try:
            r = requests.post(self.url, json={"question": question}, timeout=self.timeout)
            r.raise_for_status()
            payload = r.json()
            return payload if isinstance(payload, dict) else None
        except Exception:
            return None


class QueryEngine:
    DATA_TERMS = {
        "data", "dataset", "datasets", "rate", "rates", "percent", "percentage", "share",
        "value", "values", "number", "numbers", "statistics", "statistic", "trend",
        "indicator", "indicators", "series", "figure", "figures", "how many", "how much",
        "poverty rate", "gdp", "income", "population", "unemployment", "growth", "analysis",
    }
    EXPLANATORY = {"why", "explain", "explanation", "how does", "how do", "what does", "meaning", "implication", "significance", "causes", "drivers"}
    EXPLORATORY = {"explore", "exploratory", "patterns", "drivers", "what can we learn", "what stands out", "discuss", "analyze", "analysis", "assess", "assessment"}
    COMPARISON = {"compare", "comparison", "versus", "vs", "difference", "higher than", "lower than", "change between"}

    def __init__(self):
        self.pocket = PocketPhDManager()

    @staticmethod
    def _years(question: str) -> tuple[int | None, int | None, int | None]:
        m = RANGE.search(question)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            return min(a, b), max(a, b), None
        years = [int(x) for x in YEAR.findall(question)]
        if years:
            return years[0], years[0], years[0]
        return None, None, None

    @classmethod
    def _intent(cls, q: str, wants_data: bool = False) -> str:
        x = q.lower()
        if any(k in x for k in cls.COMPARISON):
            return "comparison"
        if any(k in x for k in cls.EXPLANATORY):
            return "explanatory"
        if any(k in x for k in cls.EXPLORATORY):
            return "analysis" if "analysis" in x or "analyze" in x else "exploratory"
        if wants_data:
            return "data"
        if x.endswith("?") or any(x.startswith(k) for k in ("what ", "which ", "when ", "where ", "who ", "how ")):
            return "question"
        return "descriptive"

    @classmethod
    def _keywords(cls, q: str) -> list[str]:
        words = re.findall(r"[A-Za-z][A-Za-z0-9'-]{2,}", q.lower())
        stop = {"the", "and", "for", "with", "from", "that", "this", "between", "during", "only", "show", "give", "data"}
        out = []
        for w in words:
            if w not in stop and w not in out:
                out.append(w)
        return out[:20]

    def build(self, question: str) -> QueryPlan:
        start, end, exact = self._years(question)
        low = question.lower()
        wants_data = any(term in low for term in self.DATA_TERMS) or start is not None
        intent = self._intent(question, wants_data)
        wants_explanation = intent in {"explanatory", "question", "analysis"}
        wants_exploration = intent in {"exploratory", "analysis", "descriptive"}
        wants_comparison = intent == "comparison"

        if exact is not None:
            management = f"STRICT DATE SCOPE: only evidence points whose data year is {exact}. Exclude every other year from the answer. Narratives are allowed only when they directly describe {exact}."
        elif start is not None and end is not None:
            management = f"STRICT DATE SCOPE: only evidence points whose data year is between {start} and {end}, inclusive. Exclude every other year from the answer. Narratives may be used only when they directly explain that interval."
        else:
            management = "No explicit year restriction. Select the most relevant evidence and distinguish current values, historical context, and narrative explanation rather than mixing them indiscriminately."

        if intent == "data":
            management += " This is data-oriented: prioritize exact figures/series first, then use only directly relevant narrative context."
        elif intent == "analysis":
            management += " This is analytical: combine relevant quantitative evidence with narrative evidence and explain supported patterns without inventing causality."
        elif intent == "explanatory":
            management += " This is explanatory: identify only evidence-supported relationships and clearly separate observation from interpretation."
        elif intent == "exploratory":
            management += " This is exploratory: surface the strongest supported patterns, contrasts, tensions, and evidence gaps."
        elif intent == "comparison":
            management += " This is comparative: compare like-for-like measures and years, and do not introduce unrelated metrics."

        remote = self.pocket.plan(question)
        source = "deterministic"
        if remote:
            remote_intent = str(remote.get("intent", "")).lower()
            if remote_intent in {"descriptive", "explanatory", "exploratory", "comparison", "question", "data", "analysis"}:
                intent = remote_intent
            source = "pocket-phd"

        return QueryPlan(
            question, intent, start, end, exact, wants_data, wants_explanation,
            wants_exploration, wants_comparison, self._keywords(question), management, source,
        )
