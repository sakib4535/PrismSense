from __future__ import annotations

import re

from apps.knowledge.retrieval import Figure, get_store


class GraphAgent:
    """Select evidence-grounded numeric series and preserve source provenance."""

    MAX_SERIES = 24
    GENERIC_UNITS = {"", "world bank series"}

    def __init__(self):
        self.store = get_store()

    @staticmethod
    def _year_scope(question):
        years = [int(x) for x in re.findall(r"(?<!\d)(19\d{2}|20\d{2}|21\d{2})(?!\d)", question or "")]
        return (min(years), max(years)) if years else (None, None)

    @staticmethod
    def _year(value):
        try:
            year = int(value)
            return year if 1800 <= year <= 2200 else None
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _number(value):
        match = re.search(r"(?<!\w)-?\d[\d,]*(?:\.\d+)?", str(value or ""))
        try:
            return float(match.group(0).replace(",", "")) if match else None
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _terms(store, question):
        noise = set("""bangladesh data dataset datasets trend trends change changed changing
            year years from to between show plot chart graph draw visualize visualise
            compare comparison please give make over during since until across value
            values numeric number numbers the for and with what how was were are is in
            of on me can you its their latest""".split())
        years = set(re.findall(r"(?<!\d)(?:19|20|21)\d{2}(?!\d)", question or ""))
        return [token for token in store._tokens(question or "") if token not in noise and token not in years]

    def _unit(self, base: Figure):
        unit = str(base.unit or "").strip()
        if unit.lower() not in self.GENERIC_UNITS:
            return unit
        sample, label = str(base.value or ""), str(base.label or "").lower()
        note = str(base.note or "").lower()
        context = label + " " + note
        if re.search(r"(?:\bUS\$|\bUSD)", sample, re.I):
            return "US$"
        rate = re.search(r"\bper\s+[\d,]+\s+[^,;]+", sample, re.I)
        if rate:
            return rate.group(0).strip()
        if "%" in sample or "percent" in sample.lower() or "percent" in context:
            return "%"
        if re.search(r"\byears?\b", sample, re.I) or "life expectancy" in label:
            return "years"
        if "gini" in label:
            return "index points"
        if "population, total" in label or label.strip() == "population":
            return "people"
        if "per capita" in label and ("current us" in context or "constant us" in context):
            return "US$"
        return unit or "source-reported units"

    def _source(self, base):
        doc = next((item for item in self.store.docs if str(item.get("id", "")) == str(base.doc_id)), {})
        return {
            "document_id": base.doc_id,
            "label": str(doc.get("title") or base.label),
            "url": str(doc.get("url") or ""),
            "note": base.note,
            "marker": "FIGURE_SOURCE",
        }

    def _series_candidates(self, question):
        terms = self._terms(self.store, question)
        query = set(terms)
        phrase = " ".join(terms)
        ranked = []
        for series_id, points in self.store.series.items():
            base = self.store._fig_by_id.get(series_id)
            if not base:
                continue
            label_tokens = set(self.store._tokens(" ".join([base.label, *base.keys])))
            overlap = query & label_tokens
            if query and not overlap:
                continue
            observations = []
            for point in points:
                year = self._year(point.get("year"))
                raw = str(point.get("value", ""))
                value = self._number(raw)
                if year is not None and value is not None:
                    observations.append({"year": year, "value": value, "raw_value": raw})
            if not observations:
                continue
            observations.sort(key=lambda item: item["year"])
            label_phrase = " ".join(self.store._tokens(base.label))
            coverage = len(overlap) / max(1, len(query))
            score = len(overlap) * 5 + coverage * 4 + (8 if phrase and phrase in label_phrase else 0)
            score += min(len(observations), 8) * .1
            ranked.append((score, base, observations, str(series_id), overlap))
        ranked.sort(key=lambda item: (-item[0], item[1].label.lower(), item[3]))
        return ranked[:self.MAX_SERIES]

    def generate(self, question, max_charts=3, selected_series=None, start_year=None, end_year=None):
        try:
            limit = max(1, min(12, int(max_charts)))
        except (TypeError, ValueError):
            limit = 3
        qstart, qend = self._year_scope(question)
        start, end = self._year(start_year), self._year(end_year)
        if start is None or end is None:
            start, end = qstart, qend
        elif start > end:
            start, end = end, start

        candidates = self._series_candidates(question)
        catalog, by_id = [], {}
        for score, base, data, series_id, _ in candidates:
            row = {
                "id": series_id, "series_id": series_id, "title": base.label,
                "unit": self._unit(base), "data": data, "source": self._source(base),
                "observation_count": len(data), "min_year": data[0]["year"],
                "max_year": data[-1]["year"], "selection_score": round(score, 2),
            }
            catalog.append(row)
            by_id[series_id] = row

        # Keep broader partial matches available for manual selection, but do
        # not preselect them alongside an indicator matching more query terms.
        matched = {row["series_id"]: next(item[4] for item in candidates if item[3] == row["series_id"]) for row in catalog}
        strongest = [row["series_id"] for row in catalog
                     if not any(matched[row["series_id"]] < terms for terms in matched.values())]
        suggested = (strongest or [row["series_id"] for row in catalog])[:limit]
        if selected_series is None:
            chosen = suggested
        elif isinstance(selected_series, list):
            requested = list(dict.fromkeys(str(value)[:160] for value in selected_series[:self.MAX_SERIES]))
            chosen = [value for value in requested if value in by_id]
        else:
            chosen = []

        plots = []
        for series_id in chosen:
            row = by_id[series_id]
            points = [point for point in row["data"]
                      if (start is None or point["year"] >= start) and (end is None or point["year"] <= end)]
            scope = "Source-reported observations only. Missing years are not interpolated."
            if start is not None and end is not None:
                years = str(start) if start == end else f"{start}–{end}"
                scope = f"Source-reported observations in {years}. Missing years are not interpolated."
            plots.append({**row, "id": "plot-" + series_id, "description": scope, "data": points})

        if not catalog:
            message = "No numeric evidence series matched. Try an indicator name such as GDP growth or population."
        elif not plots:
            message = "Choose one or more matching numeric series to display."
        else:
            message = "Showing source-reported observations. Missing years are left missing; values are not interpolated."
        return {
            "agent": "Agent Graph", "question": question,
            "year_scope": {"start": start, "end": end},
            "available_series": catalog, "suggested_series": suggested,
            "selected_series": chosen, "plots": plots, "message": message,
        }
