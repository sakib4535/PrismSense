# Rebuild Fixes — Evidence and OpenRouter Synthesis

## Problems fixed

The prototype could display the beginning of a fixed-size retrieval chunk as the final answer. Because chunks were created at fixed word offsets, a passage could start in the middle of a sentence. The grounded fallback now avoids presenting raw retrieved chunks as a synthesized answer.

## Changes in this build

1. **Paragraph-aware retrieval**
   - Documents are split on paragraph boundaries.
   - Very long paragraphs are split at sentence boundaries.
   - Evidence keeps a document ID and passage ID.

2. **Evidence Packet**
   - Each source receives `[S#]` and each figure receives `[F#]`.
   - The model receives compact excerpts plus source metadata separately.
   - The main answer never needs to display the raw evidence packet.

3. **OpenRouter synthesis**
   - The selected OpenRouter model receives a stricter grounded-synthesis system prompt.
   - It must paraphrase, cite factual claims, and return only the answer.
   - Temperature is reduced for more stable research output.
   - The backend reports whether OpenRouter is configured and whether the last synthesis request succeeded.

4. **Safe deterministic fallback**
   - If OpenRouter is unavailable, the application does not concatenate raw evidence chunks.
   - It selects complete sentences from retrieved passages and attaches source markers.
   - The UI explicitly reports `Grounded fallback`.

5. **Quality Gate**
   - Checks invalid citation markers.
   - Detects raw source metadata in the answer.
   - Detects likely sentence fragments at the beginning of the answer.
   - Requires complete sentence punctuation and evidence.

6. **Frontend separation**
   - Research Output shows synthesis only.
   - Evidence remains in the Evidence panel.
   - References remain in the References section.
   - Source markers are visually styled as inline citations.

## Model setting

Default local setting in `backend/config/local_secrets.py`:

```python
PPRC_LLM = "grounded"
```

OpenRouter mode:

```python
PPRC_LLM = "openrouter"
OPENROUTER_API_KEY = "your-active-inference-key"
OPENROUTER_MODEL = "apodex/apodex-1.1-mini:free"
```

OpenRouter runs the selected model remotely. The architecture keeps provider calls behind one router so model settings can be changed without rewriting the research engine.
