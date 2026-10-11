import React, {useState} from 'react';
import {ArrowRight, BarChart3, BrainCircuit, Database, FileText, ShieldCheck, Sparkles, Search, Layers, Check, ChevronRight, Menu, X, GitBranch} from 'lucide-react';
import './landing.css';
import {PrismLogo} from './components/PrismLogo';
import type {Mode} from './Workspace';

export default function Landing({onEnter}:{onEnter:(mode:Mode,question?:string)=>void}){
 const [mobileNavOpen, setMobileNavOpen] = useState(false);
 const publicAsset=(path:string)=>`${import.meta.env.BASE_URL}${path}`;
 const demoQuestion="Has Bangladesh's development model produced inclusive economic progress, or has headline economic growth masked deeper inequalities?";
 const scrollTo=(id:string)=>{
  setMobileNavOpen(false);
  document.getElementById(id)?.scrollIntoView({behavior:'smooth'});
 };
 const demo=()=>{
  setMobileNavOpen(false);
  onEnter('progga',demoQuestion);
 };
 
 const steps: [string, string, string, React.ReactNode][] = [
  ['Question','Write what you want to know in plain language. Agent Query identifies the focus and useful comparisons.','Agent Query', <Search size={18}/>],
  ['Evidence','Matching passages and data points are retrieved from the local Evidence Library.','Evidence Library', <Database size={18}/>],
  ['Synthesis','Agent Research writes a structured, cited analysis from a bounded evidence packet.','Agent Research', <Sparkles size={18}/>],
  ['Validation','The Quality Gate scores grounding, citation integrity and source integrity before anything counts as validated.','Quality Gate', <ShieldCheck size={18}/>],
  ['Visuals','Supported numeric series become plots. Values are never invented.','Agent Graph', <BarChart3 size={18}/>]
 ];

 const features: [string, string, string, string, Mode, string, React.ReactNode][] = [
  ['var(--coral)','Sources stay in view','Search the full corpus, inspect the record behind any passage, and choose exactly which evidence a study should use.','Open the Evidence Library','library','1', <Database size={20}/>],
  ['var(--violet)','Brief or long-form, always cited','Ask Agent Desk for a concise response, or use Agent Research for critical analysis, implications and limitations.','Open Agent Desk','desk','2', <FileText size={20}/>],
  ['var(--indigo)','Plots grounded in evidence','Agent Graph compares numeric series from the same evidence base so you can see where sources agree and diverge.','Open Agent Graph','graphs','3', <BarChart3 size={20}/>],
  ['var(--green)','A quality gate you can inspect','Every answer carries scores for grounding, citations and relevance. Drafts that miss the bar stay marked for review, with issues listed separately.','Run the demo','orchestrator','4', <ShieldCheck size={20}/>]
 ];

 const agents: [string, string, string, Mode, string, React.ReactNode][] = [
  ['CENTRAL AGENT','Progga','Bring one question. Progga selects the right specialists from your request and context; ask for all four when you want a full-team review.','progga','Ask Progga', <Sparkles size={20}/>],
  ['QUESTION DESIGN','Agent Query','Shape a rough thought into focused research questions, then explore theory, context and methodology.','analyst','Open Agent Query', <BrainCircuit size={20}/>],
  ['FAST EVIDENCE BRIEF','Agent Desk','Ask a focused question and get a concise answer grounded in the evidence library, with sources close at hand.','desk','Open Agent Desk', <Search size={20}/>],
  ['LONG-FORM SYNTHESIS','Agent Research','Run a multi-stage analysis that retrieves evidence, synthesizes perspectives and checks answer quality.','orchestrator','Open Agent Research', <GitBranch size={20}/>],
  ['NUMERIC EVIDENCE','Agent Graph','Compare supported data series, explore trends and inspect the source observations behind each chart.','graphs','Open Agent Graph', <BarChart3 size={20}/>],
 ];

 return <div className="ps-page">
  {/* Ambient Mesh Backgrounds */}
  <div className="ps-ambient-blob ps-blob-1" aria-hidden="true"/>
  <div className="ps-ambient-blob ps-blob-2" aria-hidden="true"/>
  <div className="ps-ambient-blob ps-blob-3" aria-hidden="true"/>

  <header className="ps-nav">
   <div className="ps-wrap ps-nav-container">
    <button className="ps-brand" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})} aria-label="PrismSense home">
      <div className="ps-brand-mark"><PrismLogo size={26}/></div>
      <div className="ps-brand-text">
        <span>PrismSense</span>
        <small>Research OS</small>
      </div>
    </button>

    <nav className="ps-links" aria-label="Primary navigation">
     <button className="ps-link ps-page-link" onClick={()=>window.location.hash='#/docs'}>Docs</button>
     <button className="ps-link ps-page-link" onClick={()=>window.location.hash='#/pricing'}>Pricing</button>
     <button className="ps-link ps-page-link" onClick={()=>window.location.hash='#/login'}>Sign in</button>
     <button className="ps-link ps-anchor-link" onClick={()=>scrollTo('how-it-works')}>How it works</button>
     <button className="ps-link ps-anchor-link" onClick={()=>scrollTo('capabilities')}>Capabilities</button>
     <button className="ps-link ps-anchor-link" onClick={()=>scrollTo('agents')}>Agents</button>
     <button className="ps-link ps-anchor-link" onClick={()=>scrollTo('audience')}>Who it's for</button>
    </nav>

    <div className="ps-nav-end">
      <button className="ps-btn ps-btn-primary ps-btn-nav" onClick={demo}>
        <span>Open the demo</span>
        <ArrowRight size={14}/>
      </button>
      <button className="ps-mobile-toggle" onClick={()=>setMobileNavOpen(!mobileNavOpen)} aria-label="Toggle navigation">
        {mobileNavOpen ? <X size={20}/> : <Menu size={20}/>}
      </button>
    </div>
   </div>

   {/* Mobile Floating Drawer */}
   {mobileNavOpen && (
     <div className="ps-mobile-menu">
       <div className="ps-mobile-links">
         <button className="ps-mobile-item" onClick={()=>{setMobileNavOpen(false); window.location.hash='#/docs';}}>Docs</button>
         <button className="ps-mobile-item" onClick={()=>{setMobileNavOpen(false); window.location.hash='#/pricing';}}>Pricing</button>
         <button className="ps-mobile-item" onClick={()=>{setMobileNavOpen(false); window.location.hash='#/login';}}>Sign in</button>
         <button className="ps-mobile-item" onClick={()=>scrollTo('how-it-works')}>How it works</button>
         <button className="ps-mobile-item" onClick={()=>scrollTo('capabilities')}>Capabilities</button>
         <button className="ps-mobile-item" onClick={()=>scrollTo('agents')}>Agents</button>
         <button className="ps-mobile-item" onClick={()=>scrollTo('audience')}>Who it's for</button>
         <div className="ps-mobile-cta">
           <button className="ps-btn ps-btn-primary" onClick={demo}>Open the demo <ArrowRight size={15}/></button>
         </div>
       </div>
     </div>
   )}
  </header>

  <section className="ps-hero">
   <div className="ps-wrap ps-split">
    <div className="ps-hero-content">
     <div className="ps-badge">
       <span className="ps-badge-dot"/>
       <span>Custom solutions for NGOs · Think Tanks · R&amp;D</span>
     </div>
     <h1>Premium research intelligence, built around your evidence.</h1>
     <p className="ps-lead">PrismSense is a research-oriented intelligence environment built for organizations who need rigorous proofs. Every answer is grounded in your evidence base, cited, and checked by an inspectable quality gate.</p>
     <div className="ps-actions">
      <button className="ps-btn ps-btn-primary ps-btn-hero" onClick={demo}>
        <span>Open the demo</span>
        <ArrowRight size={16}/>
      </button>
      <button className="ps-btn ps-btn-ghost ps-btn-hero" onClick={()=>onEnter('progga')}>
        <span>Ask Progga</span>
      </button>
     </div>
     <ul className="ps-chips" aria-label="What PrismSense works with">
      <li><div className="ps-chip-icon"><FileText size={14}/></div>Documents</li>
      <li><div className="ps-chip-icon"><Database size={14}/></div>Data series</li>
      <li><div className="ps-chip-icon"><ShieldCheck size={14}/></div>Quality-checked</li>
      <li><div className="ps-chip-icon"><BarChart3 size={14}/></div>Charts</li>
     </ul>
    </div>

    <div className="ps-showcase-wrap">
      <div className="ps-showcase-frame">
        <div className="ps-showcase-notch">
          <span className="ps-notch-pill"/>
        </div>
        <div className="ps-showcase-screen">
          <picture>
            <source srcSet={publicAsset('argon/assets/img/prism/prismsense-network.webp')} type="image/webp"/>
            <img className="ps-art" src={publicAsset('argon/assets/img/prism/prismsense-network.svg')} width={1200} height={800} alt="PrismSense at the center, connecting source documents, a search panel, a trend chart and a validation report."/>
          </picture>
        </div>
        <div className="ps-showcase-overlay-card">
          <div className="ps-overlay-icon"><ShieldCheck size={16}/></div>
          <div>
            <b>Evidence integrity checked</b>
            <span>Sources stay linked to findings</span>
          </div>
        </div>
      </div>
    </div>
   </div>
  </section>

  <section className="ps-section ps-tint" id="how-it-works">
   <div className="ps-wrap">
    <div className="ps-section-header">
      <span className="ps-section-eyebrow">WORKFLOW ARCHITECTURE</span>
      <h2>From question to validated answer</h2>
      <p className="ps-intro">Five stages in continuous pipeline. You can inspect the source trail behind every sentence.</p>
    </div>
    <ol className="ps-steps">
      {steps.map(([t,d,m,icon], i)=>(
        <li key={t} className="ps-step-card">
          <div className="ps-step-top">
            <span className="ps-step-number">{i + 1}</span>
            <div className="ps-step-icon">{icon}</div>
          </div>
          <h3>{t}</h3>
          <p>{d}</p>
          <small>{m}</small>
        </li>
      ))}
    </ol>
   </div>
  </section>

  <section className="ps-section ps-agent-section" id="agents">
   <div className="ps-wrap">
    <div className="ps-section-header">
     <span className="ps-section-eyebrow">A TEAM OF RESEARCH AGENTS</span>
     <h2>Choose the right agent for your next step</h2>
     <p className="ps-intro">Move from an early idea to evidence, analysis and clear visuals with focused tools for each part of the research process.</p>
    </div>
    <div className="ps-agent-grid">
     {agents.map(([label,title,description,mode,action,icon])=>(
      <article className="ps-agent-card" key={mode}>
       <div className="ps-agent-card-top"><span className="ps-agent-icon">{icon}</span><span className="ps-agent-label">{label}</span></div>
       <h3>{title}</h3>
       <p>{description}</p>
       <button className="ps-agent-open" onClick={()=>onEnter(mode)}><span>{action}</span><ArrowRight size={15}/></button>
      </article>
     ))}
    </div>
   </div>
  </section>

  <section className="ps-section" id="capabilities">
   <div className="ps-wrap ps-cols">
    <div className="ps-capabilities-header">
      <span className="ps-section-eyebrow">INTELLIGENCE SUITE</span>
      <h2>Built around the evidence, not around the chat</h2>
      <p className="ps-intro" style={{marginBottom:0}}>Most tools stop at an answer. PrismSense keeps the raw sources, numeric comparisons, and verification checks right alongside it.</p>
    </div>
    <ul className="ps-features">
      {features.map(([c,t,d,l,m,k,icon])=>(
        <li key={k} style={{['--c' as any]:c}} className="ps-feature-card">
          <div className="ps-feature-icon" style={{color: c}}>{icon}</div>
          <div className="ps-feature-body">
            <h3>{t}</h3>
            <p>{d}</p>
            <button className="ps-more" onClick={()=>m==='orchestrator'?demo():onEnter(m)}>
              <span>{l}</span>
              <ChevronRight size={14}/>
            </button>
          </div>
        </li>
      ))}
    </ul>
   </div>
  </section>

  <section className="ps-section ps-tint" id="audience">
   <div className="ps-wrap ps-split ps-audience-split">
    <div className="ps-audience-content">
     <span className="ps-section-eyebrow">TRUST & AUDIENCE</span>
     <h2>For people who have to show their work</h2>
     <p className="ps-audience-lead">If your conclusions get questioned, PrismSense gives you the audit trail to defend them with citation certainty.</p>
     <ul className="ps-checks">
       <li>
         <div className="ps-check-badge"><Check size={14}/></div>
         <span><strong>NGOs and development organizations</strong> proving programme impact and outcomes</span>
       </li>
       <li>
         <div className="ps-check-badge"><Check size={14}/></div>
         <span><strong>Research institutes &amp; academia</strong> managing rich multi-decade corpus databases</span>
       </li>
       <li>
         <div className="ps-check-badge"><Check size={14}/></div>
         <span><strong>Policy think tanks</strong> producing briefs decision makers and ministers can trust</span>
       </li>
       <li>
         <div className="ps-check-badge"><Check size={14}/></div>
         <span><strong>Enterprise R&amp;D teams</strong> demanding private, air-gapped domain models</span>
       </li>
     </ul>
    </div>
    <div className="ps-ill-wrap">
      <div className="ps-ill-card">
        <img className="ps-ill" src={publicAsset('argon/assets/img/ill/ill.png')} width={971} height={982} loading="lazy" alt="A researcher standing in front of a desk with a laptop, holding a tablet."/>
      </div>
    </div>
   </div>
  </section>

  <section className="ps-section">
   <div className="ps-wrap">
    <div className="ps-cta">
     <div className="ps-cta-glow" aria-hidden="true"/>
     <div className="ps-cta-inner">
       <div className="ps-cta-tag"><Sparkles size={14}/> ENTERPRISE READINESS</div>
       <h2>Need a model built around your organization?</h2>
       <p>Try Progga now, or talk to our engineering team about a custom PrismSense solution deployed to your private infrastructure.</p>
       <div className="ps-cta-actions">
         <button className="ps-btn ps-btn-white ps-btn-hero" onClick={demo}>
           <span>Open the demo</span>
           <ArrowRight size={16}/>
         </button>
       </div>
     </div>
    </div>
   </div>
  </section>

  <footer className="ps-footer">
   <div className="ps-wrap ps-footer-container">
    <div className="ps-footer-brand">
      <div className="ps-footer-brand-title">
        <PrismLogo size={20}/>
        <b>PrismSense</b>
      </div>
      <span>© 2026 PrismSense · Premium Research Intelligence</span>
      <b className="ps-made">Made by DEN Agentic AI x Relogic Labs</b>
    </div>
    <div className="ps-footer-links">
      <button className="ps-link" onClick={()=>onEnter('progga')}>Progga</button>
      <button className="ps-link" onClick={()=>onEnter('desk')}>Agent Desk</button>
      <button className="ps-link" onClick={()=>onEnter('library')}>Evidence Library</button>
      <button className="ps-link" onClick={()=>onEnter('analyst')}>Agent Query</button>
      <button className="ps-link" onClick={()=>onEnter('graphs')}>Agent Graph</button>
      <button className="ps-link" onClick={()=>window.location.hash='#/docs'}>Docs</button>
      <button className="ps-link" onClick={()=>window.location.hash='#/pricing'}>Pricing</button>
    </div>
   </div>
  </footer>
 </div>;
}
