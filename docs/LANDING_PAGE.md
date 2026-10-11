# PrismSense Landing Page

The supplied Argon landing design remains the visual foundation. The hero now includes a dedicated PrismSense product visualization so the page immediately communicates that this is a social research intelligence system rather than a generic template.

The visual represents the actual product workflow: evidence retrieval, the Evidence Library, synthesis, the Quality Gate, and Agent Graph. It is a local SVG asset at `frontend/public/argon/assets/img/prism/prismsense-network.svg`, so the landing page does not depend on an external image service.

The existing Argon illustration remains in the platform section. The landing page opens the Progga hub and the Agent Desk, Agent Research, Agent Query, Agent Graph, and Evidence Library workspaces.

## Update: unified landing and workspace

The landing page is now a single React component (`LandingPage` in `frontend/src/main.tsx`, styles in `landing.css`, scoped to `.ps-page`). It no longer depends on the Argon stylesheet. The shared logo lives in `src/components/PrismLogo.tsx` and is used on the landing page and in the workspace sidebar.

Routing is hash-based, so the browser Back button and deep links work:

- `#/` landing page
- `#/app/desk`, `#/app/orchestrator`, `#/app/library`, `#/app/graphs` workspace views

"Request a demo" opens `#/app/orchestrator` with the demo question loaded. If the Django API is not running, the workspace shows a dismissible banner instead of a browser alert.
