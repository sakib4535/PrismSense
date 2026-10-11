from __future__ import annotations

import re

from apps.citations.engine import Source, render_references
from apps.formatting.renderer import render_markdown
from apps.graphs.agent import GraphAgent
from apps.knowledge.retrieval import get_store
from apps.model_router.router import ModelRouter
from apps.query_engine.engine import QueryEngine
from apps.quality.validator import quality_gate


class ResearchOrchestrator:
    """Deep-research agent: plan → broad retrieval → structured draft
    (sections, arguments, paragraphs, data analysis) → critique → revise → gate."""

    MAX_REVISIONS = 1

    def __init__(self, orgs=frozenset({"public"})):
        self.orgs = frozenset(orgs)
        self.store = get_store()
        self.model = ModelRouter()
        self.query_engine = QueryEngine()

    # ---------- text formatting helpers ----------

    @staticmethod
    def _cites(values) -> str:
        return " ".join(f"[{c}]" for c in values if re.fullmatch(r"[SF]\d+", str(c)))

    @staticmethod
    def _clean(text) -> str:
        return re.sub(r"\s+", " ", str(text or "")).strip()

    @staticmethod
    def _cell(text) -> str:
        return re.sub(r"\s+", " ", str(text or "")).replace("|", "\\|").strip()

    @classmethod
    def _sentences(cls, text) -> list[str]:
        parts = re.split(r"(?<=[.!?])\s+(?=[A-Z“\"'(\[])", cls._clean(text))
        return [p.strip() for p in parts if p.strip()]

    @classmethod
    def _paragraphize(cls, text, max_sentences: int = 4) -> list[str]:
        """Format raw model prose into tight paragraphs of <= max_sentences."""
        sents = cls._sentences(text)
        return [" ".join(sents[i:i + max_sentences]) for i in range(0, len(sents), max_sentences)]

    @classmethod
    def _word_count(cls, doc: str) -> int:
        return len(re.findall(r"\b[\w’'-]+\b", doc or ""))

    # ---------- document rendering ----------

    @classmethod
    def _render_section(cls, index: int, section: dict) -> str:
        heading = cls._clean(section.get("heading")) or f"Section {index}"
        out = [f"## {heading}"]

        argument = section.get("argument") if isinstance(section.get("argument"), dict) else {}
        claim = cls._clean(argument.get("claim"))
        if claim:
            out.append(f"**Claim.** {claim}")

        paras = section.get("paragraphs")
        if isinstance(paras, str):
            paras = [paras]
        body: list[str] = []
        for para in paras or []:
            if isinstance(para, str) and para.strip():
                body.extend(cls._paragraphize(para, 4))
        support = cls._clean(argument.get("support"))
        if support and not body:
            body = cls._paragraphize(support, 4)
        out.extend(body)

        marker = cls._cites(section.get("citations", []))
        if marker and out:
            out[-1] = f"{out[-1]} {marker}".strip()

        counter = cls._clean(argument.get("counter"))
        rebuttal = cls._clean(argument.get("rebuttal"))
        if counter:
            line = f"> **Counterpoint.** {counter}"
            if rebuttal:
                line += f" **Rebuttal.** {rebuttal}"
            out.append(line)
        return "\n\n".join(out)

    @classmethod
    def _data_table(cls, data_points) -> str:
        if not isinstance(data_points, list):
            return ""
        rows = []
        for point in data_points:
            if not isinstance(point, dict):
                continue
            label, value = cls._cell(point.get("label")), cls._cell(point.get("value"))
            if not (label and value):
                continue
            year, unit = cls._cell(point.get("year")), cls._cell(point.get("unit"))
            value_cell = f"{value}{(' ' + unit) if unit else ''}"
            rows.append(f"| {label} | {year} | {value_cell} | {cls._cites(point.get('citations', []))} |")
        if not rows:
            return ""
        return "\n".join(["| Metric | Year | Value | Source |", "|---|---|---|---|", *rows])

    @classmethod
    def _render_document(cls, draft: dict) -> str:
        """Assemble the structured report body: thesis → summary → sections
        with arguments → data table → analysis → implications → conclusion."""
        if not isinstance(draft, dict):
            return ""
        blocks: list[str] = []

        def push(text, citations=None, max_sentences=4):
            paras = cls._paragraphize(text, max_sentences)
            if paras:
                marker = cls._cites(citations or [])
                blocks.append(("\n\n".join(paras) + (f" {marker}" if marker else "")).strip())

        title = cls._clean(draft.get("title"))
        if title:
            blocks.append(f"**{title}**")

        # Thesis — directly answers the question up front.
        push(draft.get("lead") or draft.get("answer"),
             draft.get("lead_citations") or draft.get("answer_citations"), 3)

        if cls._clean(draft.get("executive_summary")):
            blocks.append("## Executive Summary")
            push(draft.get("executive_summary"), draft.get("executive_summary_citations"), 4)

        sections = draft.get("sections") if isinstance(draft.get("sections"), list) else []
        for i, section in enumerate([s for s in sections if isinstance(s, dict)], 1):
            rendered = cls._render_section(i, section)
            if rendered:
                blocks.append(rendered)

        # Legacy draft shapes (findings instead of sections) still render as sections.
        if not sections:
            findings = draft.get("findings") if isinstance(draft.get("findings"), list) else []
            for i, finding in enumerate([f for f in findings if isinstance(f, dict)], 1):
                text = cls._clean(finding.get("text"))
                if text:
                    heading = cls._clean(finding.get("heading")) or f"Analysis {i}"
                    marker = cls._cites(finding.get("citations", []))
                    body = "\n\n".join(cls._paragraphize(text, 4)) + (f" {marker}" if marker else "")
                    blocks.append(f"## {heading}\n\n{body}")

        table = cls._data_table(draft.get("data_points"))
        if table:
            blocks.append("## Data & Metrics\n\n" + table)

        for key, heading in (("critical_analysis", "Critical Analysis"),
                             ("synthesis", "Analytical Synthesis"),
                             ("critical_aspects", "Critical Aspects")):
            if cls._clean(draft.get(key)):
                blocks.append(f"## {heading}")
                push(draft.get(key), draft.get(f"{key}_citations"), 4)

        implications = draft.get("implications")
        if isinstance(implications, list):
            bullets = []
            for x in implications:
                text = cls._clean(x.get("text") if isinstance(x, dict) else x)
                if text:
                    bullets.append(f"- {text}")
            if bullets:
                blocks.append("## Implications\n\n" + "\n".join(bullets))
        elif cls._clean(implications):
            blocks.append("## Implications")
            push(implications, draft.get("implications_citations"), 3)

        if cls._clean(draft.get("limitations")):
            blocks.append("## Limitations")
            push(draft.get("limitations"), draft.get("limitations_citations"), 3)

        if cls._clean(draft.get("caveat")):
            blocks.append(f"> ⚠️ {cls._clean(draft.get('caveat'))}")

        if cls._clean(draft.get("conclusion")):
            blocks.append("## Conclusion")
            push(draft.get("conclusion"), draft.get("conclusion_citations"), 4)

        return "\n\n".join(blocks).strip()

    # ---------- fallback ----------

    @classmethod
    def _grounded_fallback(cls, evidence: list) -> tuple[dict, str]:
        if not evidence:
            draft = {
                "lead": "",
                "findings": [], "data_points": [], "synthesis": "",
                "caveat": "",
            }
            return draft, ""

        narratives = [x for x in evidence if x.get("marker", "").startswith("[S")]
        figures = [x for x in evidence if x.get("marker", "").startswith("[F")]

        findings = []
        for item in narratives[:6]:
            text = cls._clean(item.get("text"))
            if text:
                findings.append({
                    "heading": f"Retrieved Evidence {len(findings) + 1}",
                    "text": text,
                    "citations": [item["marker"].strip("[]")],
                })

        data_points = [{
            "label": cls._cell(x.get("title")) or "Metric",
            "year": str(x.get("year", x.get("date", "")))[:4],
            "value": str(x.get("value", "")),
            "unit": str(x.get("unit", "")),
            "citations": [x["marker"].strip("[]")],
        } for x in figures[:10]]

        draft = {
            "lead": "",
            "findings": findings,
            "data_points": data_points,
            "synthesis": "",
            "caveat": "",
        }
        return draft, cls._render_document(draft)

    @staticmethod
    def _feedback(gate: dict) -> str:
        warnings = list(gate.get("warnings", [])[:8])
        warnings.extend([
            "Rewrite the entire response; do not patch individual sentences.",
            "Do not reuse any seven-word sequence from the evidence.",
            "Every section needs an arguable claim developed across full paragraphs — no bullet fragments.",
            "The synthesis must explain what the evidence means together; do not repeat it.",
            "Anchor data analysis on exact requested-year values; interpret only supported patterns.",
            "Match requested depth: a report develops arguments across paragraphs; a brief stays compact.",
        ])
        return " ".join(dict.fromkeys(warnings))

    @staticmethod
    def _decorate_evidence(passages, figures):
        evidence = []
        max_len = max(len(passages), len(figures))
        si = fi = 1
        for i in range(max_len):
            if i < len(figures):
                figure = figures[i]
                evidence.append({
                    "marker": f"[F{fi}]", "title": figure.label, "url": "", "date": figure.year,
                    "year": figure.year, "value": figure.value, "unit": figure.unit,
                    "text": f"{figure.label}: {figure.value} {figure.unit} ({figure.year})".strip(),
                    "passage_id": figure.id,
                })
                fi += 1
            if i < len(passages):
                passage = passages[i]
                evidence.append({
                    "marker": f"[S{si}]", "title": passage.title, "url": passage.url,
                    "date": passage.date, "text": passage.text, "passage_id": passage.id,
                })
                si += 1
        return evidence

    def _generate(self, question, evidence, plan, feedback=None):
        if feedback:
            try:
                return self.model.generate(question, evidence, plan, feedback=feedback)
            except TypeError:
                pass
        return self.model.generate(question, evidence, plan)

    # ---------- main pipeline ----------

    def run(self, question, citation_style="APA", output_format="brief", limit=10, long_form=False, selected_ids=None, include_graph=True):
        plan = self.query_engine.build(question).as_dict()
        plan["persona"] = "researcher"
        plan["format"] = output_format if output_format in ("brief", "report") else "brief"
        plan["long_form"] = bool(long_form) or plan["format"] == "report"
        plan["min_words"] = 900 if plan["long_form"] else 450
        plan["max_words"] = 2400 if plan["long_form"] else 1100
        plan["structure_required"] = True   # sections + arguments contract
        plan["paragraph_style"] = "mixed"   # developed analysis with scannable Markdown lists

        # --- retrieval: multi-query, broader than Desk ---
        queries = [question]
        for extra in (plan.get("sub_queries") or plan.get("expansions") or [])[:3]:
            if isinstance(extra, str) and extra.strip() and extra.strip() != question:
                queries.append(extra.strip())

        if plan["long_form"]:
            passage_limit, figure_limit = 12, 12
        elif plan.get("wants_data"):
            passage_limit, figure_limit = 6, 10
        else:
            passage_limit, figure_limit = min(limit, 8), 6

        passages, figures = [], []
        seen_p, seen_f = set(), set()
        for q in queries:
            for p in self.store.search(q, passage_limit, plan.get("start_year"), plan.get("end_year"), self.orgs):
                if p.id not in seen_p:
                    seen_p.add(p.id)
                    passages.append(p)
            for f in self.store.search_figures(q, figure_limit, plan.get("start_year"), plan.get("end_year")):
                if f.id not in seen_f:
                    seen_f.add(f.id)
                    figures.append(f)

        # User-selected library items are explicit evidence requests.
        selected_ids = selected_ids or []
        selected_passages = [self.store.get_passage(str(x), self.orgs) for x in selected_ids]
        selected_passages = [x for x in selected_passages if x is not None]
        for item_id in selected_ids:
            selected_passages.extend(self.store.get_document_passages(str(item_id), limit=4, orgs=self.orgs))
        selected_passages = list({p.id: p for p in selected_passages}.values())
        selected_figures = []
        for item_id in selected_ids:
            row = self.store.get_figure(str(item_id))
            if row:
                from apps.knowledge.retrieval import Figure
                selected_figures.append(Figure(
                    row["id"], row["label"], row["value"], row["year"], row["unit"],
                    row["doc_id"], tuple(row.get("keys", [])), row.get("note", ""), row.get("series_id", ""),
                ))
        passages = selected_passages + [x for x in passages if x.id not in {p.id for p in selected_passages}]
        figures = selected_figures + [x for x in figures if x.id not in {f.id for f in selected_figures}]
        evidence = self._decorate_evidence(passages, figures)

        # --- draft → critique → revise ---
        # Retrieval from the JSON knowledge base is mandatory context for LLM
        # synthesis. With no matched evidence, avoid asking the model to guess.
        draft = self._generate(question, evidence, plan) if evidence else None
        answer = self._render_document(draft) if draft else ""
        if draft and not answer.strip():
            draft, answer = None, ""
        gate = quality_gate(answer, evidence, question, plan)
        revisions = 0

        while draft and not gate.get("passed") and revisions < self.MAX_REVISIONS:
            revised = self._generate(question, evidence, {**plan, "revision": revisions + 1},
                                     feedback=self._feedback(gate))
            revisions += 1
            if revised:
                candidate = self._render_document(revised)
                candidate_gate = quality_gate(candidate, evidence, question, plan)
                if candidate_gate.get("score", 0) > gate.get("score", 0):
                    draft, answer, gate = revised, candidate, candidate_gate

        model_answer_used = bool(draft)
        if not draft:
            draft, answer = self._grounded_fallback(evidence)
            gate = quality_gate(answer, evidence, question, plan)
            gate["passed"] = False
            gate["grade"] = "Review"
        elif not gate.get("passed"):
            gate["grade"] = "Review"

        graph_output = GraphAgent().generate(question) if include_graph else {}
        sources = [Source(x["marker"], x["title"], x["url"], x["date"]) for x in evidence if x["marker"].startswith("[S")]
        refs = render_references(sources, citation_style)
        model_status = self.model.result_status(model_answer_used, len(evidence))

        return {
            "question": question,
            "answer": answer,
            "structured": draft,
            "references": refs,
            "markdown": render_markdown(question, answer, refs, citation_style, plan["format"]),
            "evidence": evidence,
            "figures": [e for e in evidence if e["marker"].startswith("[F")],
            "graph_agent": graph_output,
            "selected_evidence": selected_ids,
            "query_plan": plan,
            "quality": gate,
            "model": model_status,
            "query_engine": {"provider": "Pocket PhD" if plan.get("planner_source") == "pocket-phd" else "PrismSense Query Manager", "source": plan.get("planner_source")},
            "trace": [
                {"stage": "understand", "status": "complete", "provider": plan.get("planner_source")},
                {"stage": "query_management", "status": "complete", "intent": plan.get("intent"),
                 "queries": len(queries),
                 "year_filter": f"{plan.get('start_year')}-{plan.get('end_year')}" if plan.get("start_year") else "none"},
                {"stage": "retrieve", "status": "complete", "passages": len(passages), "figures": len(figures), "count": len(evidence)},
                {"stage": "model_synthesis", "status": model_status["request_status"], "model": model_status.get("model"), "error": model_status.get("error", "")},
                {"stage": "drafting", "status": "complete" if draft else "fallback", "revisions": revisions, "words": self._word_count(answer)},
                *([{"stage": "graph_agent", "status": "complete",
                    "plots": len(graph_output.get("plots", []))}] if include_graph else []),
                {"stage": "quality_gate", "status": "passed" if gate.get("passed") else "review", "score": gate.get("score", 0)},
            ],
        }


# Keeps existing `from ... import ResearchAgent` imports working
ResearchAgent = ResearchOrchestrator
