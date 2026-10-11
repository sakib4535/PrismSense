import React, {useEffect, useRef, useState} from 'react';
import {ArrowRight, BookOpen, Check, Database, FileText, LockKeyhole, ShieldCheck, Sparkles} from 'lucide-react';
import {api} from './api';
import {PrismLogo} from './components/PrismLogo';
import type {Mode} from './Workspace';
import './site-pages.css';

type SitePageProps = {onEnter: (mode: Mode, question?: string) => void};

function SiteNav({active = ''}: {active?: string}) {
  return <header className="site-nav"><a className="site-brand" href="#/"><PrismLogo size={30}/> PrismSense</a>
    <nav aria-label="Main navigation">
      <a href="#/docs" aria-current={active === 'docs' ? 'page' : undefined}>Docs</a>
      <a href="#/pricing" aria-current={active === 'pricing' ? 'page' : undefined}>Pricing</a>
      <a href="#/login">Sign in</a>
      <a className="site-nav-cta" href="#/demo">Start free demo <ArrowRight size={15}/></a>
    </nav>
  </header>;
}

function SiteFooter() {
  return <footer className="site-footer"><a className="site-brand" href="#/"><PrismLogo size={24}/> PrismSense</a>
    <span>Evidence-led research intelligence · <a href="#/docs">Technical documentation</a></span></footer>;
}

function jumpTo(id: string) { document.getElementById(id)?.scrollIntoView({behavior: 'smooth', block: 'start'}); }

export function DemoLoading({mode, error = '', localDevelopment = false, onRetry}: {mode: Mode; error?: string; localDevelopment?: boolean; onRetry?: () => void}) {
  const label = mode === 'progga' ? 'Progga' : mode === 'graphs' ? 'Agent Graph' : mode === 'library' ? 'Evidence Library' : mode === 'desk' ? 'Agent Desk' : mode === 'analyst' ? 'Agent Query' : 'Agent Research';
  return <main className="demo-loading-page"><div className="demo-loading-card">
    <div className="demo-loading-mark"><PrismLogo size={38}/><span className="spinner" aria-hidden="true"/></div>
    <p className="site-eyebrow">YOUR FREE RESEARCH SESSION</p>
    <h1>Preparing {label}</h1>
    <p className="demo-loading-lead">{localDevelopment ? <>Local development mode gives you <strong>unlimited access</strong> to Progga, Agent Desk, Agent Research, Agent Query, Agent Graph and the Evidence Library.</> : <>Your demo includes <strong>10 minutes of free access</strong> to Progga, Agent Desk, Agent Research, Agent Query, Agent Graph and the Evidence Library.</>}</p>
    <div className="demo-loading-track"><i/></div>
    {error ? <div className="site-inline-error demo-start-error" role="alert"><b>We couldn’t start your demo.</b><span>{error}</span>
      <div><button className="site-button site-button-primary" onClick={onRetry}>Try again</button><a className="site-button site-button-light" href="#/login">Sign in with Google</a></div></div> :
      <p className="demo-loading-note"><ShieldCheck size={16}/> {localDevelopment ? 'This local developer session has no expiry timer.' : 'Your session timer begins now. Sign in with Google for full access at any time.'}</p>}
  </div></main>;
}

export function AccessWall({expired = false, overlay = false}: {expired?: boolean; overlay?: boolean}) {
  return <section className={overlay ? 'access-wall access-wall-overlay' : 'access-wall'} role="dialog" aria-modal={overlay || undefined} aria-labelledby="access-wall-title">
    <div className="access-wall-card">
      <div className="access-wall-icon"><LockKeyhole size={24}/></div>
      <p className="site-eyebrow">{expired ? 'FREE DEMO COMPLETE' : 'SIGN IN TO CONTINUE'}</p>
      <h1 id="access-wall-title">{expired ? 'Your 10 minutes are up.' : 'Your session needs access.'}</h1>
      <p>{expired ? 'Progga and the research agents are paused. Choose a subscription or sign in with Google for full access.' : 'Start the free 10-minute demo or sign in with Google to open the research tools.'}</p>
      <div className="access-wall-actions"><a className="site-button site-button-primary" href={expired ? '#/pricing?expired=1' : '#/pricing'}>{expired ? 'Buy full access' : 'View plans'} <ArrowRight size={16}/></a>
        <a className="site-button site-button-light" href="#/login">Continue with Google</a>
      </div>
      <a className="access-wall-home" href="#/">Return to PrismSense home</a>
    </div>
  </section>;
}

function loadGoogleScript() {
  return new Promise<void>((resolve, reject) => {
    if ((window as any).google?.accounts?.id) { resolve(); return; }
    let script = document.getElementById('google-identity-script') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = 'google-identity-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.addEventListener('load', () => resolve(), {once: true});
      script.addEventListener('error', () => { script?.remove(); reject(new Error('Google sign-in could not load. Check your connection or content security policy.')); }, {once: true});
      document.head.appendChild(script);
      return;
    }
    script.addEventListener('load', () => resolve(), {once: true});
    script.addEventListener('error', () => reject(new Error('Google sign-in could not load. Check your connection or content security policy.')), {once: true});
  });
}

function GoogleSignIn({onSuccess}: {onSuccess: (user: {email: string; name?: string}) => void}) {
  const mount = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const [clientId, setClientId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api('/auth/config/').then((config: any) => {
      if (live) setClientId(config.google_client_id || '');
    }).catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!clientId || !mount.current) return;
    let live = true;
    loadGoogleScript().then(() => {
      if (!live || !mount.current) return;
      const google = (window as any).google;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: {credential?: string}) => {
          if (!response.credential || busyRef.current) return;
          busyRef.current = true; setBusy(true); setError('');
          try { onSuccess(await api('/auth/google/', {credential: response.credential})); }
          catch (e) { setError(e instanceof Error ? e.message : 'Google sign-in failed.'); }
          finally { busyRef.current = false; setBusy(false); }
        },
      });
      google.accounts.id.renderButton(mount.current, {theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: Math.min(340, mount.current.clientWidth || 340)});
    }).catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [clientId]);
  return <div className="google-signin-wrap">
    {clientId ? <div className={busy ? 'google-button is-busy' : 'google-button'} ref={mount} aria-label="Continue with Google"/> :
      <div className="google-unavailable"><LockKeyhole size={16}/><span>Google sign-in needs a Web OAuth client ID.</span></div>}
    {error && <p className="site-inline-error" role="alert">{error}</p>}
    {!clientId && <p className="site-config-hint">Set <code>GOOGLE_CLIENT_ID</code> in the backend environment and add this site as an authorized JavaScript origin in Google Cloud.</p>}
  </div>;
}

export function LoginPage({onSignedIn}: {onSignedIn: (user: {email: string; name?: string}) => void}) {
  return <div className="site-page"><SiteNav/>
    <main className="login-layout"><section className="login-card">
      <div className="login-icon"><ShieldCheck size={23}/></div>
      <p className="site-eyebrow">FULL ACCESS</p><h1>Continue with Google</h1>
      <p>Sign in with a verified Google account to unlock Progga, the four research agents and the Evidence Library.</p>
      <GoogleSignIn onSuccess={onSignedIn}/>
      <div className="login-divider"><span>or</span></div>
      <a className="site-button site-button-light site-button-block" href="#/demo">Try the free 10-minute demo</a>
      <small>Your Google password is never shared with PrismSense. Only a verified sign-in token is checked.</small>
    </section></main><SiteFooter/></div>;
}

type BillingConfig = {prices?: Record<string, string>; checkout_available?: Record<string, boolean>; sales_contact_url?: string};

export function PricingPage({onEnter, expired = false}: SitePageProps & {expired?: boolean}) {
  const [config, setConfig] = useState<BillingConfig>({});
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { api('/billing/plans/').then(setConfig).catch(() => setConfig({})); }, []);
  const plans = [
    {key: 'demo', eyebrow: 'Try PrismSense', title: 'Free Demo', price: 'Free', cadence: '10 minutes · all workspaces', copy: 'Explore the complete research workflow with a short, timed session.', features: ['Progga and all four agents', 'Evidence Library and numeric analysis', 'No credit card required'], action: 'Start free demo', featured: false},
    {key: 'researcher', eyebrow: 'For one researcher', title: 'Researcher', price: config.prices?.researcher || 'Monthly subscription', cadence: 'Billed through secure checkout', copy: 'A personal workspace for focused, evidence-led research.', features: ['Full access while signed in', 'Cited briefs and analytical reports', 'Numeric evidence and editable charts'], action: 'Subscribe', featured: false},
    {key: 'team', eyebrow: 'For collaborative work', title: 'Research Team', price: config.prices?.team || 'Monthly team subscription', cadence: 'Billed through secure checkout', copy: 'A shared research workflow for teams producing repeatable analysis.', features: ['Team-oriented research workflow', 'Reusable evidence and chart tools', 'Priority onboarding'], action: 'Choose team plan', featured: true},
    {key: 'organization', eyebrow: 'For institutions', title: 'Organization', price: config.prices?.organization || 'Annual or monthly subscription', cadence: 'Billed through secure checkout', copy: 'Organization-level access for NGOs, think tanks, and research groups.', features: ['Organization onboarding', 'Configured access and support', 'Deployment planning'], action: 'Choose organization plan', featured: false},
    {key: 'custom', eyebrow: 'Private deployment', title: 'Custom In-House AI', price: 'Custom proposal', cadence: 'Scoped to your organization', copy: 'A private research model built around your data, workflows, and infrastructure.', features: ['Private evidence and model setup', 'Custom retrieval and governance', 'Deployment, evaluation, and support'], action: 'Discuss a custom build', featured: false},
  ];
  async function choose(plan: typeof plans[number]) {
    if (plan.key === 'demo') { onEnter('orchestrator'); return; }
    setNotice('');
    if (plan.key === 'custom') {
      const contact = config.sales_contact_url;
      if (contact && /^(https:|mailto:)/i.test(contact)) window.location.assign(contact);
      else setNotice('Custom AI inquiries are not connected yet. Configure SALES_CONTACT_URL in the backend environment.');
      return;
    }
    if (!config.checkout_available?.[plan.key]) {
      setNotice('Subscription checkout is not connected for this plan yet. Configure its Stripe Payment Link, or sign in with Google for full access.');
      return;
    }
    setBusy(plan.key);
    try {
      const result = await api<{checkout_url: string}>('/billing/checkout/', {plan: plan.key});
      window.location.assign(result.checkout_url);
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Checkout could not be opened.'); }
    finally { setBusy(''); }
  }
  return <div className="site-page"><SiteNav active="pricing"/>
    <main className="site-main pricing-main">
      {expired && <div className="site-alert"><LockKeyhole size={18}/><div><b>Your free demo has ended.</b><span>Choose a subscription or sign in with Google for full access.</span></div></div>}
      <div className="site-heading"><p className="site-eyebrow">PRICING & ACCESS</p><h1>Choose the research setup that fits.</h1><p>Start with a 10-minute demo, subscribe through secure checkout, or scope a private in-house AI deployment.</p></div>
      <div className="pricing-grid">{plans.map(plan => <article key={plan.key} className={`price-card ${plan.featured ? 'price-card-featured' : ''} ${plan.key === 'custom' ? 'price-card-custom' : ''}`}>
        {plan.featured && <span className="price-popular">TEAM FAVORITE</span>}
        <p className="site-eyebrow">{plan.eyebrow}</p><h2>{plan.title}</h2>
        <div className="price-amount">{plan.price}</div><p className="price-cadence">{plan.cadence}</p>
        <p className="price-copy">{plan.copy}</p>
        <ul>{plan.features.map(feature => <li key={feature}><Check size={16}/>{feature}</li>)}</ul>
        <button className={plan.featured ? 'site-button site-button-primary site-button-block' : 'site-button site-button-light site-button-block'} onClick={() => choose(plan)} disabled={busy === plan.key}>
          {busy === plan.key ? 'Opening checkout…' : plan.action}<ArrowRight size={15}/>
        </button>
      </article>)}</div>
      {notice && <div className="site-alert site-alert-note" role="status">{notice} <a href="#/login">Continue with Google</a></div>}
      <p className="pricing-note">Subscription amounts are managed by the connected checkout links. No card is required for the free demo. <a href="#/login">Google sign-in grants full access</a>.</p>
    </main><SiteFooter/></div>;
}

const apiExample = `POST /api/ask/\nContent-Type: application/json\n\n{\n  "question": "How did poverty change over time?",\n  "citation_style": "APA",\n  "selected_evidence": []\n}`;

export function DocsPage({onEnter}: SitePageProps) {
  const [modelCheck, setModelCheck] = useState<{state: 'idle' | 'loading' | 'success' | 'error'; message: string}>({state: 'idle', message: ''});
  async function checkOpenRouter() {
    setModelCheck({state: 'loading', message: 'Sending a small live request to OpenRouter…'});
    try {
      const result = await api<{ok: boolean; reply?: string; error?: string}>('/model-check/', {});
      setModelCheck({state: result.ok ? 'success' : 'error', message: result.ok ? `Connected to ${result.reply || 'the configured model'}.` : result.error || 'The model check failed.'});
    } catch (error) {
      setModelCheck({state: 'error', message: error instanceof Error ? error.message : 'The model check failed.'});
    }
  }
  return <div className="site-page"><SiteNav active="docs"/>
    <main className="site-main docs-main">
      <div className="docs-hero"><p className="site-eyebrow">PRISMSENSE DOCUMENTATION</p><h1>From a question to evidence you can inspect.</h1><p>Use the workspaces step by step, or integrate the research API into your own application.</p>
        <button className="site-button site-button-primary" onClick={() => onEnter('progga')}>Open Progga <ArrowRight size={16}/></button></div>
      <div className="docs-layout"><aside className="docs-toc"><b>On this page</b><button type="button" onClick={() => jumpTo('getting-started')}>Quick start</button><button type="button" onClick={() => jumpTo('workflow')}>Research workflow</button><button type="button" onClick={() => jumpTo('technical')}>Technical model</button><button type="button" onClick={() => jumpTo('graph-agent')}>Agent Graph</button><button type="button" onClick={() => jumpTo('api')}>API reference</button><button type="button" onClick={() => jumpTo('deployment')}>Deployment and access</button></aside>
        <div className="docs-content">
          <section id="getting-started" className="doc-section"><p className="site-eyebrow">01 · HOW TO USE IT</p><h2>Quick start</h2>
            <div className="doc-steps">
              <article><b>1</b><div><h3>Choose a workspace</h3><p>Ask Progga to bring Agent Query, Agent Desk, Agent Research and Agent Graph together. The Library lets you inspect and pin the evidence they use.</p></div></article>
              <article><b>2</b><div><h3>Ask a bounded question</h3><p>Name the population, place, measure, and time period when they matter. For example: “How did Bangladesh’s poverty rate change from 2010 to 2022?”</p></div></article>
              <article><b>3</b><div><h3>Inspect evidence and quality</h3><p>Open Evidence and References to see what supports the answer. Use Issues / Run activity to check whether the model was used and review any quality warnings or evidence limits.</p></div></article>
              <article><b>4</b><div><h3>Refine or export</h3><p>Pin selected evidence from the Library, choose a citation style, and use Agent Graph to select measures, date ranges, overlays, annotations, and chart colors.</p></div></article>
            </div>
          </section>
          <section id="workflow" className="doc-section"><p className="site-eyebrow">02 · RESEARCH WORKFLOW</p><h2>How PrismSense produces an answer</h2>
            <div className="doc-pipeline"><span><FileText/>Question</span><i>→</i><span><Database/>Evidence retrieval</span><i>→</i><span><Sparkles/>Synthesis</span><i>→</i><span><ShieldCheck/>Quality checks</span></div>
            <p>The API builds a query plan, retrieves matching passages and numeric records from the configured evidence corpus, and passes a bounded evidence packet to the selected research agent. The response keeps evidence markers, source metadata, model status, and quality results attached to the report.</p>
            <div className="doc-callout"><b>Evidence discipline</b><p>PrismSense can only support claims found in the available corpus. A configured language model does not replace source review; inspect citations and limitations before relying on an answer.</p></div>
          </section>
          <section id="technical" className="doc-section"><p className="site-eyebrow">03 · TECHNICAL MODEL</p><h2>Model routing and validation</h2>
            <p>The backend searches the JSON knowledge base first, then sends the matching source passages and numeric facts to OpenRouter's <code>apodex/apodex-1.1-mini:free</code> model for synthesis. A quality warning keeps the generated draft visible with a review status; model errors, evidence limits, and quality warnings appear in Issues / Run activity. If no usable model draft is returned, the workspace shows retrieved facts and clearly records that the model was not used. The local key is configured in the private backend-only <code>config/local_secrets.py</code> file; hosted deployments use their private secret settings. OpenRouter attribution uses the <code>PrismSense-current</code> app title. <code>PPRC_LLM = "grounded"</code> disables external model calls. No local model or GPU is required.</p>
            <div className="doc-callout"><b>Check the live model connection</b><p>This sends a short request using the backend's configured OpenRouter key and model.</p><button className="site-button site-button-light" type="button" onClick={checkOpenRouter} disabled={modelCheck.state === 'loading'}>{modelCheck.state === 'loading' ? 'Checking…' : 'Test OpenRouter'}</button>{modelCheck.state !== 'idle' && <p role="status" aria-live="polite">{modelCheck.message}</p>}</div>
            <ul className="doc-list"><li><b>Agent Query:</b> frames the request and highlights scope.</li><li><b>Agent Desk:</b> prepares a concise answer from the evidence library.</li><li><b>Agent Research:</b> adds critical analysis, implications, limitations, and a conclusion.</li><li><b>Agent Graph:</b> finds numeric series that match the question.</li><li><b>Quality gate:</b> checks grounding, citations, relevance, coherence, completeness, and source integrity; details appear in Issues / Run activity.</li><li><b>References:</b> available as structured source details and selected citation styles.</li></ul>
          </section>
          <section id="graph-agent" className="doc-section"><p className="site-eyebrow">04 · NUMERIC ANALYSIS</p><h2>Use Agent Graph</h2>
            <p>Ask for a numeric indicator, then select among the returned series. Set the date range and chart type. Add a moving average, trendline, mean, median, or target line with a natural-language command; remove series and annotations from the chart controls.</p>
            <p>Each plotted point comes from a source observation. The workspace includes year-on-year changes, indexed values, descriptive statistics, ranking, source details, color controls, manual annotations, SVG export, and CSV data export where the selected data supports them.</p>
          </section>
          <section id="api" className="doc-section"><p className="site-eyebrow">05 · API REFERENCE</p><h2>Research API</h2>
            <p>All routes are served under <code>/api</code>. Browser requests use the same-origin session cookie. A verified Google session has full access; anonymous requests need a live demo session.</p>
            <div className="doc-table-wrap"><table className="doc-table"><thead><tr><th>Method</th><th>Route</th><th>Purpose</th></tr></thead><tbody>
              <tr><td>GET</td><td><code>/access/status/</code></td><td>Check signed-in or demo access</td></tr><tr><td>POST</td><td><code>/demo/start/</code></td><td>Start the 10-minute demo</td></tr><tr><td>POST</td><td><code>/model-check/</code></td><td>Send a short live request to the configured model</td></tr><tr><td>POST</td><td><code>/progga/</code></td><td>Automatically select relevant agents; pass <code>agent_mode: all</code> to run the full team</td></tr><tr><td>POST</td><td><code>/ask/</code></td><td>Concise Agent Desk answer</td></tr><tr><td>POST</td><td><code>/orchestrate/</code></td><td>Detailed Agent Research report</td></tr><tr><td>POST</td><td><code>/graph-agent/</code></td><td>Find numeric series and graph data</td></tr><tr><td>GET</td><td><code>/library/</code></td><td>Search evidence and figure catalogs</td></tr><tr><td>POST</td><td><code>/auth/google/</code></td><td>Verify a Google ID token and create a session</td></tr>
            </tbody></table></div>
            <pre className="doc-code"><code>{apiExample}</code></pre>
          </section>
          <section id="deployment" className="doc-section"><p className="site-eyebrow">06 · DEPLOYMENT</p><h2>Production access and configuration</h2>
            <ul className="doc-list"><li>For local Windows use, extract the project and double-click <code>Start-PrismSense.bat</code>. It prepares dependencies, asks for your OpenRouter key privately, then opens the application. Use <code>Stop-PrismSense.bat</code> to close both servers.</li><li>For one-service deployment, push the project to GitHub and connect the included <code>render.yaml</code> Blueprint in Render. The root Dockerfile builds the frontend and Django API together; your PC does not need Docker Desktop.</li><li>Store <code>OPENROUTER_API_KEY</code> in Render's secret prompt, keep <code>PPRC_LLM=openrouter</code>, and choose an available OpenRouter model slug. The default is <code>apodex/apodex-1.1-mini:free</code>. Never put model secrets in browser or <code>VITE_*</code> variables.</li><li>Render generates <code>DJANGO_SECRET_KEY</code> for you. The 10-minute demo works without Redis using a signed browser cookie; clearing that browser's cookies can start another demo. Add shared Redis only if you need server-side trial records across visitors or instances.</li><li>Google sign-in and Stripe checkout remain optional integrations. Configure their client ID, payment links, and matching HTTPS origins in the provider's private settings when you want to enable them.</li></ul>
            <div className="doc-callout"><b>Tenant data</b><p>Before loading confidential evidence for multiple organizations, configure tenant isolation and access policy for the corpus. Do not expose private organization data through a public demo corpus.</p></div>
          </section>
        </div>
      </div>
    </main><SiteFooter/></div>;
}

export function WorkspaceLoading() {
  return <main className="access-checking"><div className="spinner"/><p>Checking PrismSense access…</p></main>;
}
