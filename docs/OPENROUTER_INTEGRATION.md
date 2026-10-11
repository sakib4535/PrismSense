# OpenRouter integration

PrismSense sends synthesis requests from the Django backend to OpenRouter's OpenAI-compatible Chat Completions API. The default model is Apodex 1.1 Mini's free variant. The primary attempt enables reasoning; if it returns no user-facing text, one retry disables reasoning and increases the output budget. Model availability and provider quotas can change over time.

## Runtime architecture

Research question → query planning → JSON knowledge-base retrieval → bounded evidence packet → OpenRouter cloud model → citation and quality validation → research output

The JSON knowledge base is the source of project facts. Retrieval, numeric extraction, citation formatting, and the quality gate remain in the application. The question-matched passages and figures are sent to the model as bounded context; the full corpus is not sent on every request. The model must answer only from that evidence packet.

A usable model draft remains visible even when a quality threshold is missed, with a review status. Its warnings and evidence limits appear in the separate Issues / Run activity area. If no relevant evidence is found, the model is not asked to guess. If OpenRouter returns no usable structured answer, the application presents the retrieved facts and records that the model was not used.

## Configuration

For local development, copy `backend/config/local_secrets.example.py` to `backend/config/local_secrets.py`, then set:

```python
PPRC_LLM = "openrouter"
OPENROUTER_API_KEY = "your-active-inference-key"
OPENROUTER_MODEL = "apodex/apodex-1.1-mini:free"
```

`local_secrets.py` is ignored by Git and is not required to contain values beyond the key and model options. `OPENROUTER_APP_NAME` is the optional app attribution title sent in the `X-Title` header; it is not a key or a billing workspace selector. For hosted deployments, configure secrets in the host's private settings instead of committing `local_secrets.py`. Never expose `OPENROUTER_API_KEY` in frontend code or a `VITE_*` variable. No local model download, Ollama server, or GPU is needed.

To use another model, replace the configured slug with that model's current OpenRouter ID. PrismSense asks the model for JSON and parses the final answer. Its free availability and rate limits are controlled by OpenRouter and may change.

## Safe fallback

Use `PPRC_LLM = "grounded"` in `local_secrets.py` to disable outbound model calls locally. If OpenRouter is not configured, unavailable, rate-limited, or returns invalid JSON, the research workflow shows explicitly cited knowledge-base facts and records the model status for review. An empty assistant response is retried once with reasoning disabled and a larger output limit. Repeated failures appear in Issues / Run activity with the finish reason, model, and provider when available.
