from __future__ import annotations

import json
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings

STOP = set(
    "the a an and or of to in for on with from by is are was were be this that as at it its into about how what why which who where when a an the"
    .split()
)
TOKEN = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9%.-]*")


@dataclass(frozen=True)
class Passage:
    id: str
    doc_id: str
    title: str
    url: str
    date: str
    theme: str
    text: str
    paragraph_index: int = 0
    owner: str = "public"


@dataclass(frozen=True)
class Figure:
    id: str
    label: str
    value: str
    year: str
    unit: str
    doc_id: str
    keys: tuple[str, ...]
    note: str = ""
    series_id: str = ""


class EvidenceStore:
    """Local evidence index.

    The previous version sliced every document at a fixed word offset. That could
    start an evidence item in the middle of a sentence. This version indexes
    paragraph-aware passages so retrieved evidence remains readable and traceable.
    """

    def __init__(self):
        root = Path(settings.PPRC_DATA_DIR)
        self.docs: list[dict] = []
        self.figures: list[Figure] = []
        self.series: dict[str, list[dict]] = {}
        self.chunks: list[Passage] = []
        self._df = Counter()
        self._tf: list[Counter] = []
        self._title_tok: list[set] = []
        self._inv: dict[str, list[int]] = {}
        self._lower: list[str] = []
        self._years: list[set] = []
        self._by_id: dict[str, Passage] = {}
        self._fig_by_id: dict[str, Figure] = {}
        self._load(root)
        self._build_stats()

    @staticmethod
    def _clean_text(text: str) -> str:
        text = re.sub(r"\s+", " ", text or "").strip()
        return text

    def _paragraphs(self, text: str) -> list[str]:
        raw = re.split(r"\n\s*\n+", text or "")
        paragraphs = []
        for item in raw:
            cleaned = self._clean_text(item)
            if len(cleaned) < 35:
                continue
            # Preserve sentence boundaries while preventing enormous evidence blocks.
            sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z\"“‘])", cleaned)
            current = ""
            for sentence in sentences:
                sentence = sentence.strip()
                if not sentence:
                    continue
                if current and len(current) + len(sentence) + 1 > 1800:
                    paragraphs.append(current.strip())
                    current = sentence
                else:
                    current = f"{current} {sentence}".strip()
            if current:
                paragraphs.append(current.strip())
        return paragraphs

    def _load(self, root: Path):
        crawl = root / "crawled.json"
        if crawl.exists():
            data = json.loads(crawl.read_text(encoding="utf-8"))
            for d in data.get("documents", []):
                d.setdefault("owner", "PPRC")  # crawled from pprc-bd.org: private to PPRC
                self.docs.append(d)

        supp = root / "supplements.json"
        if supp.exists():
            try:
                for d in json.loads(supp.read_text(encoding="utf-8")):
                    d.setdefault("owner", "PPRC")
                    self.docs.append(d)
            except Exception:
                pass

        wb = root / "worldbank.json"
        if wb.exists():
            try:
                data = json.loads(wb.read_text(encoding="utf-8"))
                if isinstance(data, list):
                    self.docs.extend(data)
                elif isinstance(data, dict):
                    self.docs.extend(data.get("documents", []))
                    self.series = data.get("series", {}) or {}
                    for f in data.get("figures", []) or []:
                        self.figures.append(Figure(
                            str(f.get("id", "")), str(f.get("label", "")), str(f.get("value", "")),
                            str(f.get("year", "")), str(f.get("unit", "")), str(f.get("docId", "")),
                            tuple(f.get("keys", [])), str(f.get("note", "")), str(f.get("id", "")),
                        ))
            except Exception:
                pass

        for doc in self.docs:
            doc_id = str(doc.get("id", "doc"))
            paragraphs = self._paragraphs(doc.get("text", ""))
            for index, paragraph in enumerate(paragraphs):
                self.chunks.append(
                    Passage(
                        f"{doc_id}-p{index + 1}",
                        doc_id,
                        doc.get("title", "Untitled"),
                        doc.get("url", ""),
                        doc.get("date", ""),
                        doc.get("theme", "Research"),
                        paragraph,
                        index + 1,
                        str(doc.get("owner", "public")),
                    )
                )

        fp = root / "figures.json"
        if fp.exists():
            try:
                for f in json.loads(fp.read_text(encoding="utf-8")):
                    self.figures.append(
                        Figure(
                            str(f["id"]),
                            str(f.get("label", "")),
                            str(f.get("value", "")),
                            str(f.get("year", "")),
                            str(f.get("unit", "")),
                            str(f.get("docId", "")),
                            tuple(f.get("keys", [])),
                            str(f.get("note", "")),
                            str(f.get("id", "")),
                        )
                    )
            except Exception:
                pass

    def _tokens(self, text: str) -> list[str]:
        return [x.lower() for x in TOKEN.findall(text) if x.lower() not in STOP and len(x) > 1]

    def _build_stats(self):
        """Tokenise once at start-up so every search is an inverted-index lookup."""
        for i, chunk in enumerate(self.chunks):
            toks = self._tokens(chunk.text)
            tf = Counter(toks)
            tt = set(self._tokens(chunk.title))
            self._tf.append(tf); self._title_tok.append(tt)
            self._lower.append(chunk.text.lower())
            self._years.append(self._years_in(chunk.text))
            self._by_id[chunk.id] = chunk
            self._df.update(tf.keys())
            for t in set(tf) | tt:
                self._inv.setdefault(t, []).append(i)
        self.N = max(1, len(self.chunks))
        self._fig_by_id = {f.id: f for f in self.figures}

    @staticmethod
    def _years_in(text: str) -> set[int]:
        return {int(x) for x in re.findall(r"(?<!\d)(19\d{2}|20\d{2}|21\d{2})(?!\d)", text or "")}

    @classmethod
    def _year_match(cls, passage: Passage, start_year: int | None, end_year: int | None) -> bool:
        if start_year is None:
            return True
        years = cls._years_in(passage.text)
        if not years:
            try:
                years.add(int(str(passage.date)[:4]))
            except (ValueError, TypeError):
                pass
        return any(start_year <= year <= (end_year or start_year) for year in years)

    def search(self, query: str, limit: int = 8, start_year: int | None = None, end_year: int | None = None, orgs=frozenset({"public"})) -> list[Passage]:
        q_tokens = self._tokens(query)
        q = set(q_tokens)
        if not q:
            return []

        scored = []
        query_lower = query.lower().strip()
        cand = set()
        for t in q:
            cand.update(self._inv.get(t, ()))
        for i in cand:
            passage = self.chunks[i]
            if passage.owner not in orgs:
                continue
            if start_year is not None:
                years = self._years[i] or set()
                if not years:
                    try: years = {int(str(passage.date)[:4])}
                    except (ValueError, TypeError): years = set()
                if not any(start_year <= y <= (end_year or start_year) for y in years):
                    continue
            tf = self._tf[i]
            score = 0.0
            for token in q:
                if token in tf:
                    score += (1 + math.log(tf[token])) * math.log(
                        (self.N + 1) / (self._df[token] + 1)
                    )

            title_tokens = self._title_tok[i]
            score += 1.5 * len(q & title_tokens)
            if query_lower and query_lower in self._lower[i]:
                score += 8.0
            if start_year is not None:
                years = self._years[i]
                target = set(range(start_year, (end_year or start_year) + 1))
                score += 3.0 * len(years & target)

            if score:
                scored.append((score, passage))

        scored.sort(key=lambda item: item[0], reverse=True)
        return [passage for _, passage in scored[:limit]]

    def search_figures(self, query: str, limit: int = 8, start_year: int | None = None, end_year: int | None = None) -> list[Figure]:
        q = set(self._tokens(query))
        candidates: list[tuple[float, Figure]] = []
        base_by_id = self._fig_by_id
        for series_id, points in self.series.items():
            base = base_by_id.get(series_id)
            if not base:
                continue
            for point in points:
                year = str(point.get("year", ""))
                try:
                    yi = int(year)
                except (ValueError, TypeError):
                    continue
                if start_year is not None and not (start_year <= yi <= (end_year or start_year)):
                    continue
                text = " ".join([base.label, year, str(point.get("value", "")), base.unit, *base.keys, base.note])
                overlap = len(q & set(self._tokens(text)))
                if overlap == 0:
                    # Only a pure year/data query may request all series. Otherwise keep the
                    # result semantically tied to the requested topic.
                    if q:
                        continue
                    overlap = 0.25
                score = float(overlap)
                if start_year is not None:
                    score += 2.0
                candidates.append((score, Figure(
                    id=f"{series_id}-{year}", label=base.label, value=str(point.get("value", "")),
                    year=year, unit=base.unit, doc_id=base.doc_id, keys=base.keys,
                    note=base.note, series_id=series_id,
                )))

        # Backward-compatible latest figure search when no series match exists.
        if not candidates:
            for figure in self.figures:
                try:
                    yi = int(figure.year)
                except (ValueError, TypeError):
                    continue
                if start_year is not None and not (start_year <= yi <= (end_year or start_year)):
                    continue
                text = " ".join([figure.label, figure.value, figure.year, figure.unit, *figure.keys, figure.note])
                overlap = len(q & set(self._tokens(text)))
                if overlap:
                    candidates.append((float(overlap), figure))
        candidates.sort(key=lambda item: (-item[0], -int(item[1].year or 0)))
        return [figure for _, figure in candidates[:limit]]


    def document_catalog(self, query: str = "", limit: int = 200, orgs=frozenset({"public"})):
        q = set(self._tokens(query)) if query else set()
        rows = []
        for doc in self.docs:
            if str(doc.get("owner", "public")) not in orgs:
                continue
            title = str(doc.get("title", "Untitled"))
            text = str(doc.get("text", ""))
            hay = set(self._tokens(title + " " + text + " " + str(doc.get("theme", ""))))
            score = len(q & hay) if q else 0
            if q and score == 0:
                continue
            rows.append({
                "id": str(doc.get("id", "")), "title": title, "url": str(doc.get("url", "")),
                "date": str(doc.get("date", "")), "theme": str(doc.get("theme", "Research")),
                "kind": str(doc.get("kind", "document")), "private": str(doc.get("owner", "public")) != "public", "preview": self._clean_text(text)[:420],
                "score": score,
            })
        rows.sort(key=lambda x: (-x["score"], x["title"]))
        return rows[:limit]

    def figure_catalog(self, query: str = "", limit: int = 300, start_year=None, end_year=None):
        q = set(self._tokens(query)) if query else set()
        rows = []
        seen = set()
        for series_id, points in self.series.items():
            base = self._fig_by_id.get(series_id)
            if not base:
                continue
            for point in points:
                year = str(point.get("year", ""))
                try: yi = int(year)
                except Exception: continue
                if start_year is not None and not (start_year <= yi <= (end_year or start_year)): continue
                text = " ".join([base.label, base.unit, base.note, *base.keys])
                score = len(q & set(self._tokens(text))) if q else 0
                if q and score == 0: continue
                key = f"{series_id}-{year}"
                if key in seen: continue
                seen.add(key)
                rows.append({
                    "id": key, "series_id": series_id, "label": base.label,
                    "value": str(point.get("value", "")), "year": year, "unit": base.unit,
                    "doc_id": base.doc_id, "note": base.note, "keys": list(base.keys), "score": score,
                })
        rows.sort(key=lambda x: (-x["score"], -int(x["year"] or 0), x["label"]))
        return rows[:limit]

    def get_passage(self, passage_id: str, orgs=frozenset({"public"})):
        p = self._by_id.get(passage_id)
        return p if p and p.owner in orgs else None

    def get_document_passages(self, doc_id: str, limit: int = 4, orgs=frozenset({"public"})):
        return [p for p in self.chunks if p.doc_id == str(doc_id) and p.owner in orgs][:limit]

    def get_figure(self, figure_id: str):
        sid, _, year = str(figure_id).rpartition("-")
        for point in self.series.get(sid, []):
            if str(point.get("year")) == year and sid in self._fig_by_id:
                b = self._fig_by_id[sid]
                return {"id": figure_id, "series_id": sid, "label": b.label, "value": str(point.get("value", "")), "year": year,
                        "unit": b.unit, "doc_id": b.doc_id, "note": b.note, "keys": list(b.keys)}
        return None


STORE = None


def get_store():
    global STORE
    if STORE is None:
        STORE = EvidenceStore()
    return STORE
