# PrismSense Synthesis, Anti-Leakage and Quality Gate

This build treats the configured OpenRouter model as a synthesis engine. It is not allowed to turn retrieved passages into the final answer by copying them.

## Anti-leakage pipeline

1. Retrieve paragraph-aware evidence.
2. Hide source titles, URLs, dates and metadata from the model.
3. Run a private evidence-abstraction pass that converts passages into short fact notes.
4. Run several independent synthesis attempts.
5. Reject candidates with long consecutive copied runs or metadata leakage.
6. Run a dedicated repair round using the quality warnings.
7. A passed candidate is labeled as validated. A draft that misses a threshold remains visible with a review status and its warnings in Issues / Run activity.
8. If the model does not return a usable draft, the UI shows only retrieved, cited knowledge-base facts and records that the model was not used.

## Quality Gate metrics

The right panel reports:

- Overall
- Grounding
- Citation integrity
- Relevance
- Coherence
- Completeness
- Source integrity
- Evidence leakage control
- Synthesis integrity

The headline score is intentionally penalized by the weakest metric. A response cannot receive a misleading 90%+ score when one critical dimension, such as leakage control, is poor.

## Publication rule

A response is considered validated only when all configured thresholds pass and there are no invalid markers or significant evidence-copy runs.

The frontend therefore distinguishes:

- **Validated synthesis** — safe to treat as the generated research answer.
- **Draft requires review** — the generated answer stays visible for inspection, with quality warnings separated into Issues / Run activity and sources available in Evidence.
- **Knowledge-base fallback** — if no usable model draft exists, only retrieved facts are shown; the run panel explains why model synthesis was unavailable.

## Final formatting

The model returns only the synthesis. Django creates the references from source metadata. The frontend renders synthesis, evidence, references and quality metrics as separate layers.
