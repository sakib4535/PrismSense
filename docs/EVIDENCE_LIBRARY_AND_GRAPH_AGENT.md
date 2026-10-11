# Evidence Library + Agent Graph

## Evidence Library

The workspace now exposes the complete local evidence database through **Evidence Library** in the left navigation.

Users can:
- search documents, source text, themes, indicators and figures;
- inspect a source record and open its original URL;
- browse numeric figure records by year;
- select documents or individual data points for the next research run;
- see the current selection count from Agent Desk / Agent Research.

Selected library records are added to the research evidence packet. Document selections contribute the first source passages from that document; figure selections contribute the exact selected data point.

## Agent Graph

Agent Graph is a first-class evidence-grounded agent.

It uses the same knowledge store as the research engine, identifies numeric series relevant to the question, respects explicit year ranges, and returns chart-ready series. The UI renders these as clean interactive-style SVG plots with tooltips, legends and source-grounded labeling.

Agent Graph is available in two places:
1. **Agent Graph** in the sidebar for standalone visual research.
2. Automatically below Research Output, where plots are generated from the same question and evidence context.

Agent Graph never fabricates missing values. If no sufficiently relevant numeric series exists, it reports that no evidence-grounded plot can be generated.
