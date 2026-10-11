import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API = import.meta.env.VITE_API_BASE || '';
function App() {
  const [mode, setMode] = useState('desk');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault(); if (!question.trim() || busy) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch(`${API}/api/${mode === 'desk' ? 'ask' : 'orchestrate'}/`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({question: question.trim()}) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`); setResult(data);
    } catch (err) { setError(err.message || 'Unable to reach PrismSense. Check that the API is running.'); }
    finally { setBusy(false); }
  }
  return <main className="shell">
    <header><a className="brand" href="#"><span className="mark">P</span> PrismSense</a><span className="status"><i/> Evidence-led research</span></header>
    <section className="hero"><div className="eyebrow">RESEARCH INTELLIGENCE WORKSPACE</div><h1>Ask clearly.<br/><em>Understand deeply.</em></h1><p>Grounded answers for the questions that matter, with source evidence attached.</p></section>
    <section className="workbench">
      <div className="tabs"><button className={mode==='desk'?'active':''} onClick={()=>setMode('desk')}><b>Agent Desk</b><small>Concise, direct answers</small></button><button className={mode==='research'?'active':''} onClick={()=>setMode('research')}><b>Agent Research</b><small>Detailed analytical reports</small></button></div>
      <form onSubmit={submit}><label htmlFor="question">Your research question</label><textarea id="question" maxLength="600" rows="4" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="e.g. What does the evidence show about poverty trends in Bangladesh?"/><div className="formfoot"><span>{question.length}/600</span><button className="submit" disabled={busy || !question.trim()}>{busy ? 'Researching…' : mode==='desk' ? 'Get answer  →' : 'Start research  →'}</button></div></form>
      {error && <div className="error" role="alert">{error}</div>}
      {result && <article className="result"><div className="resulthead"><div><div className="eyebrow">{mode==='desk'?'DESK ANSWER':'RESEARCH REPORT'}</div><h2>{result.question}</h2></div><span className={`grade ${result.quality?.grade==='Excellent'?'good':''}`}>{result.quality?.grade || 'Evidence grounded'}</span></div><div className="answer" dangerouslySetInnerHTML={{__html:markdown(result.answer || '')}}/>
        {result.references && <details><summary>References</summary><pre>{result.references}</pre></details>}
        {result.evidence?.length>0 && <details><summary>Evidence used ({result.evidence.length})</summary><ul>{result.evidence.map((x,i)=><li key={x.marker||i}><b>{x.marker}</b> {x.title}{x.year?` · ${x.year}`:''}<p>{x.text}</p></li>)}</ul></details>}
        {result.quality?.warnings?.length>0 && <p className="note">Quality review: {result.quality.warnings.join(' ')}</p>}
      </article>}
    </section><footer>PrismSense <span>Answers are limited by the available evidence. Check cited sources before relying on findings.</span></footer>
  </main>
}
function markdown(s) {
  const inline = (value) => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\[(S\d+|F\d+)\]/g,'<sup>[$1]</sup>');
  return s.split(/\n\s*\n/).map(block => {
    const lines = block.split('\n').filter(Boolean);
    if (lines.every(line => /^\s*\|/.test(line)) && lines.length >= 2) {
      const rows = lines.filter(line => !/^\s*\|[-| :]+\|?\s*$/.test(line)).map(line => line.split('|').slice(1,-1).map(cell => cell.trim()));
      if (rows.length) return `<div class="tablewrap"><table><thead><tr>${rows[0].map(cell=>`<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(row=>`<tr>${row.map(cell=>`<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    return lines.map(line => {
      const heading=line.match(/^#{1,4}\s+(.+)/);
      if (heading) return `<h3>${inline(heading[1])}</h3>`;
      if (/^>\s?/.test(line)) return `<blockquote>${inline(line.replace(/^>\s?/,''))}</blockquote>`;
      if (/^\s*[-*]\s+/.test(line)) return `<div class="bullet">• ${inline(line.replace(/^\s*[-*]\s+/,''))}</div>`;
      return `<p>${inline(line)}</p>`;
    }).join('');
  }).join('');
}

createRoot(document.getElementById('root')).render(<App/>);
