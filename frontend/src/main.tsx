import React, {Suspense, lazy, useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './app.css';
import Landing from './Landing';
import type {Mode} from './Workspace';
import {api} from './api';
import {DemoLoading, DocsPage, LoginPage, PricingPage} from './SitePages';

const Workspace = lazy(() => import('./Workspace'));
const MODES: Mode[] = ['home', 'progga', 'desk', 'orchestrator', 'analyst', 'library', 'graphs'];
const route = () => (window.location.hash.replace(/^#\/?/, '').split('?')[0]) || '';
const DEMO_Q = "Has Bangladesh's development model produced inclusive economic progress, or has headline economic growth masked deeper inequalities?";
const pause = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

function App() {
  const [r, setR] = useState(route()), [q, setQ] = useState('');
  const [pending, setPending] = useState<{mode: Mode; question?: string} | null>(null);
  const [launchError, setLaunchError] = useState('');
  const [localDevelopment, setLocalDevelopment] = useState(false);
  const handledDemoRoute = useRef(false);
  useEffect(() => { const f = () => { setR(route()); window.scrollTo({top: 0}); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const enter = async (m: Mode, question?: string) => {
    setPending({mode: m, question}); setLaunchError(''); setLocalDevelopment(false);
    const started = Date.now();
    try {
      const access = await api<any>('/demo/start/', {});
      if (!access.authenticated && !access.active) throw new Error('The demo session is not active. Please sign in or try again.');
      setLocalDevelopment(Boolean(access.local_development));
      await pause(Math.max(900 - (Date.now() - started), 0));
      if (question) setQ(question);
      else if (m === 'progga') setQ('');
      setPending(null);
      window.location.hash = `#/app/${m}`;
    } catch (error: any) {
      await pause(Math.max(900 - (Date.now() - started), 0));
      if (error?.code === 'DEMO_EXPIRED') {
        setPending(null);
        window.location.hash = '#/pricing?expired=1';
      } else {
        setLaunchError(error instanceof Error ? error.message : 'Demo access could not be started.');
      }
    }
  };
  useEffect(() => {
    if (r !== 'demo') { handledDemoRoute.current = false; return; }
    if (!handledDemoRoute.current) { handledDemoRoute.current = true; void enter('progga', DEMO_Q); }
  }, [r]);
  const signedIn = (user: {email: string; name?: string}) => {
    setQ(DEMO_Q);
    setR('app/progga');
    window.location.hash = '#/app/progga';
  };
  if (pending) return <DemoLoading mode={pending.mode} error={launchError} localDevelopment={localDevelopment} onRetry={() => void enter(pending.mode, pending.question)}/>;
  if (r === 'docs') return <DocsPage onEnter={enter}/>;
  if (r === 'pricing') return <PricingPage onEnter={enter} expired={window.location.hash.includes('expired=1')}/>;
  if (r === 'login') return <LoginPage onSignedIn={signedIn}/>;
  const mode = MODES.find(m => m === /^app\/(\w+)$/.exec(r)?.[1]);
  if (mode) return <Suspense fallback={<div className="boot">Loading workspace…</div>}><Workspace mode={mode} initialQ={q || (mode === 'progga' ? '' : DEMO_Q)}/></Suspense>;
  return <Landing onEnter={(m, question) => { void enter(m, question); }}/>;
}
createRoot(document.getElementById('root')!).render(<App/>);
