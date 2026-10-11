# Agent Research — Long-Form Research Output

Agent Research uses a dedicated long-form synthesis contract. It targets at least 500 words (normally 600–900 when the evidence supports it), while Agent Desk remains concise. Both agents are available together from the Progga workspace.

The report is structured as executive framing, distinct findings, data/trend interpretation when applicable, critical analysis, implications, critical aspects/evidence gaps, limitations, and conclusion.

The configured OpenRouter model is instructed to reason only from the bounded knowledge-base evidence packet. The model may connect evidence, compare supported patterns, explain implications, and develop analytical arguments, but it must not invent facts, causality, dates, statistics, actors, or policy effects.

The quality gate enforces the minimum word count for orchestrator runs, while retaining citation, leakage, relevance, coherence, source-integrity, and year-compliance checks. If a draft is too short or fails validation, the orchestrator requests a targeted expansion before it can pass.
