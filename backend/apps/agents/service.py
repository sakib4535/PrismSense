from __future__ import annotations

import re

from apps.citations.engine import Source, render_references
from apps.formatting.renderer import render_markdown
from apps.graphs.agent import GraphAgent
from apps.knowledge.retrieval import get_store
from apps.model_router.router import ModelRouter
from apps.query_engine.engine import QueryEngine
from apps.quality.validator import quality_gate


class ResearchAgent:
    def __init__(self, orgs=frozenset({"public"})):
        self.orgs = frozenset(orgs)
        self.store = get_store()
        self.model = ModelRouter()
        self.query_engine = QueryEngine()


    @staticmethod
    def _flatten_draft(draft: dict) -> str:
        parts = []
        def cites(values):
            return " ".join(f"[{c}]" for c in values if re.fullmatch(r"[SF]\d+", str(c)))
    
        def add(text, citations=None):
            text = str(text or "").strip()
            if text:
                parts.append(f"{text} {cites(citations or [])}".strip())
    
        add(draft.get("lead"), draft.get("lead_citations", []))
        add(draft.get("executive_summary"), draft.get("executive_summary_citations", []))
    
        for point in draft.get("data_points", []):
            if not isinstance(point, dict):
                continue
            label = str(point.get("label", "")).strip()
            year = str(point.get("year", "")).strip()
            value = str(point.get("value", "")).strip()
            unit = str(point.get("unit", "")).strip()
            if label and value:
                line = f"{label} ({year}): {value}{(' ' + unit) if unit else ''}."
                add(line, point.get("citations", []))
    
        for i, finding in enumerate(draft.get("findings", []), 1):
            if not isinstance(finding, dict):
                continue
            heading = str(finding.get("heading", "")).strip() or f"Finding {i}"
            text = str(finding.get("text", "")).strip()
            citation_text = cites(finding.get("citations", []))
            if text:
                parts.append(f"{heading}: {text} {citation_text}".strip())
    
        add(draft.get("critical_analysis"), draft.get("critical_analysis_citations", []))
        add(draft.get("synthesis"), draft.get("synthesis_citations", []))
        add(draft.get("implications"), draft.get("implications_citations", []))
        add(draft.get("critical_aspects"), draft.get("critical_aspects_citations", []))
        add(draft.get("limitations"), draft.get("limitations_citations", []))
        add(draft.get("caveat"), draft.get("caveat_citations", []))
        add(draft.get("conclusion"), draft.get("conclusion_citations", []))
        return "\n\n".join(parts).strip()

    @staticmethod
    def _word_count(draft: dict) -> int:
        text = ResearchAgent._flatten_draft(draft)
        return len(re.findall(r"\b[\w’'-]+\b", text))

    @staticmethod
    def _grounded_fallback(question: str, evidence: list, plan: dict) -> tuple[dict, str]:
        if not evidence:
            draft = {"lead": "", "lead_citations": [], "findings": [], "synthesis": "", "synthesis_citations": [], "data_points": [], "caveat": "", "caveat_citations": []}
            return draft, ""

        # Conservative fallback: expose only explicitly retrieved facts and never invent a synthesis.
        data = [x for x in evidence if x.get("marker", "").startswith("[F")]
        narratives = [x for x in evidence if x.get("marker", "").startswith("[S")]
        findings = []
        for item in narratives[:2]:
            text = re.sub(r"\s+", " ", item.get("text", "")).strip()
            if len(text) > 360:
                text = text[:357].rsplit(" ", 1)[0].rstrip(" ,;:") + "…"
            if text:
                findings.append({"heading": f"Retrieved evidence {len(findings)+1}", "text": text, "citations": [item["marker"].strip("[]")]})
        data_points = []
        for item in data[:3]:
            data_points.append({
                "label": item.get("title", "Metric"),
                "year": str(item.get("year", item.get("date", "")))[:4],
                "value": str(item.get("value", "")),
                "unit": str(item.get("unit", "")),
                "citations": [item["marker"].strip("[]")],
            })
        draft = {"lead": "", "lead_citations": [], "findings": findings, "synthesis": "", "synthesis_citations": [], "data_points": data_points, "caveat": "", "caveat_citations": []}
        return draft, ResearchAgent._flatten_draft(draft)

    @staticmethod
    def _feedback(gate: dict) -> str:
        warnings = list(gate.get("warnings", [])[:8])
        warnings.extend([
            "Rewrite the entire response; do not patch individual source-like sentences.",
            "Do not reuse any seven-word sequence from the evidence.",
            "Lead with the answer, then organize the strongest findings by analytical importance.",
            "For data questions, use exact requested-year values first and interpret only supported patterns.",
            "Use citations arrays correctly; do not place citation markers in source metadata.",
        ])
        return " ".join(dict.fromkeys(warnings))

    @staticmethod
    def _decorate_evidence(passages, figures):
        evidence = []
        # Interleave narrative and quantitative evidence so the model sees both dimensions.
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

    def run(self, question, citation_style="APA", output_format="brief", limit=8, long_form=False, selected_ids=None, include_graph=True):
        plan = self.query_engine.build(question).as_dict()
        plan["persona"] = "researcher" if long_form else "desk"
        plan["long_form"] = bool(long_form)
        plan["min_words"] = 500 if long_form else 0
        plan["max_words"] = 2400 if long_form else 220
        # Use more quantitative evidence for data/analysis queries and fewer narrative passages.
        passage_limit = 12 if long_form else (6 if plan.get("wants_data") else limit)
        figure_limit = 14 if long_form else (10 if plan.get("wants_data") else 4)
        queries = [question]
        for extra in (plan.get("sub_queries") or plan.get("expansions") or [])[:3]:
            if isinstance(extra, str) and extra.strip() and extra.strip() != question:
                queries.append(extra.strip())
        passages, figures, seen_passages, seen_figures = [], [], set(), set()
        for search_query in queries:
            for passage in self.store.search(search_query, passage_limit, plan.get("start_year"), plan.get("end_year"), self.orgs):
                if passage.id not in seen_passages:
                    seen_passages.add(passage.id)
                    passages.append(passage)
            for figure in self.store.search_figures(search_query, figure_limit, plan.get("start_year"), plan.get("end_year")):
                if figure.id not in seen_figures:
                    seen_figures.add(figure.id)
                    figures.append(figure)
        passages = passages[:passage_limit * 2]
        figures = figures[:figure_limit * 2]

        # User-selected library items are explicit evidence requests. They are
        # added only when their IDs exist in the local evidence store; they do
        # not bypass the knowledge base or introduce external content.
        selected_ids = selected_ids or []
        selected_passages = [self.store.get_passage(str(x), self.orgs) for x in selected_ids]
        selected_passages = [x for x in selected_passages if x is not None]
        selected_doc_passages = []
        for item_id in selected_ids:
            selected_doc_passages.extend(self.store.get_document_passages(str(item_id), limit=4, orgs=self.orgs))
        selected_passages.extend(selected_doc_passages)
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

        # The JSON knowledge base is the evidence source; the configured model only
        # synthesizes when retrieval found evidence to ground the answer in.
        model_draft = self.model.generate(question, evidence, plan) if evidence else None
        draft = model_draft
        if draft and not long_form:
            # Agent Desk answers first and keeps supporting detail selective.
            draft = {**draft, "executive_summary": "", "critical_analysis": "",
                     "critical_analysis_citations": [], "synthesis": "", "synthesis_citations": [],
                     "implications": "", "implications_citations": [], "critical_aspects": "",
                     "critical_aspects_citations": [], "limitations": "", "limitations_citations": [],
                     "conclusion": "", "conclusion_citations": [],
                     "findings": draft.get("findings", [])[:2],
                     "data_points": draft.get("data_points", [])[:3]}
        if draft and not self._flatten_draft(draft):
            draft = None
        graph_output = GraphAgent().generate(question) if include_graph else {
            "plots": [], "available_series": [],
            "message": "Numeric analysis is handled by Agent Graph in the shared research workflow.",
        }
        answer = self._flatten_draft(draft) if draft else ""
        gate = quality_gate(answer, evidence, question, plan)
        model_answer_used = bool(draft and model_draft)
        if not draft:
            draft, answer = self._grounded_fallback(question, evidence, plan)
            gate = quality_gate(answer, evidence, question, plan)
            gate["passed"] = False
            gate["grade"] = "Review"
        elif not gate["passed"]:
            gate["grade"] = "Review"

        sources = [Source(x["marker"], x["title"], x["url"], x["date"]) for x in evidence if x["marker"].startswith("[S")]
        refs = render_references(sources, citation_style)
        model_status = self.model.result_status(model_answer_used, len(evidence))

        return {
            "question": question,
            "answer": answer,
            "structured": draft,
            "references": refs,
            "markdown": render_markdown(question, answer, refs, citation_style, output_format),
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
                {"stage": "query_management", "status": "complete", "intent": plan.get("intent"), "queries": len(queries), "year_filter": f"{plan.get('start_year')}-{plan.get('end_year')}" if plan.get('start_year') else "none"},
                {"stage": "retrieve", "status": "complete", "count": len(evidence)},
                {"stage": "evidence_packet", "status": "complete"},
                {"stage": "model_synthesis", "status": model_status["request_status"], "model": model_status.get("model"), "error": model_status.get("error", "")},
                {"stage": "graph_agent", "status": "complete" if include_graph else "skipped", "plots": len(graph_output.get("plots", []))},
                {"stage": "synthesis", "status": "model" if model_answer_used else "knowledge_base_fallback"},
                {"stage": "quality_gate", "status": "passed" if gate["passed"] else "review", "word_count": gate.get("word_count", 0)},
            ],
        }

