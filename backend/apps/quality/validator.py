from __future__ import annotations

import re

STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "into", "about", "what", "which",
    "where", "when", "how", "why", "does", "are", "was", "were", "been", "being", "have",
    "has", "had", "will", "would", "could", "should", "can", "may", "might", "a", "an",
    "of", "to", "in", "on", "at", "by", "as", "is", "it", "its", "or", "be", "than",
    "their", "they", "them", "these", "those", "there", "also", "not", "do", "did", "does",
    "the", "user", "question", "answer", "evidence",
}


def _tokens(text: str) -> list[str]:
    return [
        token for token in re.findall(r"[a-zA-Z0-9]+", text.lower())
        if len(token) > 2 and token not in STOPWORDS
    ]


def _sentences(text: str) -> list[str]:
    # Zero-width split after punctuation. Citation markers stay attached to the
    # preceding claim, while decimals such as 18.7% are not split.
    pattern = r"(?<=[.!?])(?=\s*(?:\[(?:S|F)\d+\]\s*)*[A-Z\"“‘])"
    raw_units = [s.strip() for s in re.split(pattern, (text or "").strip()) if s.strip()]
    units: list[str] = []
    citation_prefix = re.compile(r"^(?:\[(?:S|F)\d+\]\s*)+")
    for unit in raw_units:
        match = citation_prefix.match(unit)
        if match and units:
            units[-1] = f"{units[-1]} {match.group(0).strip()}".strip()
            remainder = unit[match.end():].strip()
            if remainder:
                units.append(remainder)
        else:
            units.append(unit)
    return units


def _clamp(value: float) -> int:
    return max(0, min(100, round(value)))


def _max_common_run(answer_tokens: list[str], evidence_tokens: list[str]) -> int:
    """Return the longest consecutive token sequence copied from evidence."""
    if not answer_tokens or not evidence_tokens:
        return 0
    best = 0
    prev = [0] * (len(evidence_tokens) + 1)
    for a in answer_tokens:
        cur = [0]
        for j, e in enumerate(evidence_tokens, 1):
            value = prev[j - 1] + 1 if a == e else 0
            cur.append(value)
            best = max(best, value)
        prev = cur
    return best


def _leakage_score(answer: str, evidence: list[dict]) -> tuple[int, int]:
    answer_tokens = _tokens(answer)
    if not answer_tokens:
        return 0, 0
    longest = 0
    for item in evidence:
        # Repeating a numeric observation from a figure is legitimate grounding,
        # not source leakage. Leakage detection is therefore applied to narrative
        # passages, where verbatim copying is the real risk.
        if item.get("marker", "").startswith("[F"):
            continue
        longest = max(longest, _max_common_run(answer_tokens, _tokens(item.get("text", ""))))

    # Long verbatim runs are strong evidence that the model copied a passage.
    penalty = 0
    if longest >= 14:
        penalty = 65
    elif longest >= 10:
        penalty = 45
    elif longest >= 7:
        penalty = 25
    elif longest >= 5:
        penalty = 10
    return _clamp(100 - penalty), longest


def quality_gate(answer, evidence, question="", plan=None):
    answer = (answer or "").strip()
    word_count = len(re.findall(r"\b[\w’'-]+\b", answer))
    long_form = bool((plan or {}).get("long_form"))
    min_words = int((plan or {}).get("min_words") or 0)
    markers = set(re.findall(r"\[(?:S|F)\d+\]", answer))
    valid = {x["marker"] for x in evidence}
    invalid = sorted(markers - valid)
    sentences = _sentences(answer)

    source_dump = bool(re.search(
        r"(?im)(?:^|\n)\s*(?:world bank report|document date|document type|type:|abstract as published:|evidence packet|source material|sources?:|references?:|title:|url:)\b",
        answer,
    ))
    fragment_start = bool(answer and re.match(r"^[a-z][^.!?]{0,100}\s", answer))
    incomplete_sentences = sum(1 for s in sentences if not re.search(r"[.!?](?:\s|$)", s))
    complete_sentence_ratio = (
        (len(sentences) - incomplete_sentences) / len(sentences) * 100 if sentences else 0
    )

    substantive = [s for s in sentences if len(_tokens(s)) >= 5]
    cited_substantive = [s for s in substantive if re.search(r"\[(?:S|F)\d+\]", s)]
    grounding = _clamp((len(cited_substantive) / len(substantive) * 100) if substantive else 0)

    citation = 100 if not markers else _clamp((len(markers & valid) / len(markers)) * 100)
    if not markers and evidence:
        citation = 25

    evidence_leakage, longest_copy = _leakage_score(answer, evidence)
    source_integrity = 100
    if source_dump:
        source_integrity -= 55
    if fragment_start:
        source_integrity -= 30
    if invalid:
        source_integrity -= min(45, 15 * len(invalid))
    source_integrity = _clamp(source_integrity)

    completeness = _clamp(complete_sentence_ratio)
    if long_form and min_words:
        if word_count < min_words:
            completeness = min(completeness, _clamp((word_count / min_words) * 100))
    if len(answer) < 120:
        completeness = min(completeness, 65)
    if len(substantive) < 2 and evidence:
        completeness = min(completeness, 70)
    if not answer:
        completeness = 0

    if sentences:
        lengths = [len(_tokens(s)) for s in sentences]
        readable = sum(1 for n in lengths if 4 <= n <= 55) / len(lengths)
        # Reward modest variation and penalize repeated sentence openings.
        starts = [" ".join(_tokens(s)[:3]) for s in sentences if _tokens(s)]
        repeated_starts = len(starts) - len(set(starts))
        coherence = readable * 100 - min(20, repeated_starts * 8)
        if fragment_start:
            coherence -= 30
        if source_dump:
            coherence -= 25
        coherence = _clamp(coherence)
    else:
        coherence = 0

    # Relevance should measure topical coverage, not whether the answer repeats
    # source/provider names or intent words such as "analysis". Use the query
    # manager's focused keywords when available.
    q_tokens = set(_tokens(question))
    if plan:
        plan_keywords = set(_tokens(" ".join(str(x) for x in plan.get("keywords", []))))
        q_tokens = plan_keywords or q_tokens
    q_tokens -= {"analysis", "analyze", "assessment", "assess", "world", "bank", "report", "data", "dataset", "datasets"}
    a_tokens = set(_tokens(answer))
    if not q_tokens:
        relevance = 80 if answer else 0
    else:
        overlap = len(q_tokens & a_tokens) / len(q_tokens)
        relevance = _clamp(70 + overlap * 30) if overlap >= 0.5 else _clamp(overlap * 100)

    # Synthesis integrity is deliberately separate from grounding: an answer can cite
    # everything and still be a poor research synthesis if it copies the sources.

    # Strict year compliance: when the query manager selected a year/range, the final
    # answer must not introduce a different year. This protects data questions from
    # accidentally surfacing historical values that were present in source notes.
    year_compliance = 100
    out_of_range_years = []
    if plan and plan.get("start_year") is not None:
        start_year = int(plan["start_year"])
        end_year = int(plan.get("end_year") or start_year)
        years_in_answer = {int(x) for x in re.findall(r"(?<!\d)(19\d{2}|20\d{2}|21\d{2})(?!\d)", answer or "")}
        out_of_range_years = sorted(y for y in years_in_answer if not (start_year <= y <= end_year))
        if out_of_range_years:
            year_compliance = max(0, 100 - 35 * len(out_of_range_years))

    synthesis_integrity = _clamp(
        evidence_leakage * 0.45
        + coherence * 0.30
        + source_integrity * 0.25
    )

    base_overall = (
        grounding * 0.16
        + citation * 0.10
        + relevance * 0.14
        + coherence * 0.13
        + completeness * 0.10
        + source_integrity * 0.10
        + evidence_leakage * 0.14
        + synthesis_integrity * 0.12
        + year_compliance * 0.05
    )
    # A single severe failure must visibly lower the headline score. This prevents a
    # highly grounded but copied answer from appearing as a 90%+ publication-ready result.
    weakest = min(grounding, citation, relevance, coherence, completeness, source_integrity, evidence_leakage, synthesis_integrity)
    overall = _clamp(base_overall * 0.72 + weakest * 0.28)

    warnings = []
    if not evidence:
        warnings.append("No evidence was retrieved.")
    if invalid:
        warnings.append(f"Invalid source markers: {invalid}")
    if source_dump:
        warnings.append("The answer contains raw source metadata or evidence labels.")
    if fragment_start:
        warnings.append("The answer begins with a sentence fragment.")
    if longest_copy >= 7:
        warnings.append(f"Evidence leakage detected: longest copied run is {longest_copy} words/tokens.")
    if grounding < 80:
        warnings.append("Citation coverage is below the research threshold.")
    if relevance < 65:
        warnings.append("The answer may not be sufficiently focused on the research question.")
    if coherence < 80:
        warnings.append("The answer needs a coherence/synthesis review.")
    if completeness < 80:
        warnings.append("The answer appears incomplete or too short for a research response.")
    if synthesis_integrity < 80:
        warnings.append("Synthesis integrity is below the acceptance threshold.")
    if out_of_range_years:
        warnings.append(f"Year filter violation: the answer mentions out-of-range years {out_of_range_years}.")

    metrics = {
        "overall": overall,
        "grounding": grounding,
        "citation": citation,
        "relevance": relevance,
        "coherence": coherence,
        "completeness": completeness,
        "source_integrity": source_integrity,
        "evidence_leakage_control": evidence_leakage,
        "synthesis_integrity": synthesis_integrity,
        "year_compliance": year_compliance,
    }

    thresholds = {
        "overall": 82,
        "grounding": 80,
        "citation": 90,
        "relevance": 65,
        "coherence": 80,
        "completeness": 80,
        "source_integrity": 90,
        "evidence_leakage_control": 90,
        "synthesis_integrity": 80,
        "year_compliance": 95,
    }

    if long_form and word_count < min_words:
        warnings.append(f"Agent Research requires at least {min_words} words; current draft has {word_count}.")

    passed = (
        bool(evidence)
        and bool(answer)
        and all(metrics[key] >= threshold for key, threshold in thresholds.items())
        and not invalid
        and longest_copy < 7
        and year_compliance >= 95
        and (not long_form or word_count >= min_words)
    )

    if overall >= 92 and passed:
        grade = "Excellent"
    elif overall >= 82 and passed:
        grade = "Pass"
    elif overall >= 65:
        grade = "Review"
    else:
        grade = "Fail"

    return {
        "passed": passed,
        "grade": grade,
        "score": overall,
        "evidence_count": len(evidence),
        "markers": sorted(markers),
        "invalid_markers": invalid,
        "warnings": warnings,
        "metrics": metrics,
        "thresholds": thresholds,
        "leakage": {"longest_copy_run": longest_copy},
        "word_count": word_count,
        "minimum_words": min_words,
        "year_filter": {"compliant": year_compliance >= 95, "score": year_compliance, "out_of_range_years": out_of_range_years},
    }
