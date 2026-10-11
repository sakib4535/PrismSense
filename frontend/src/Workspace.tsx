import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Activity, ArrowLeft, ArrowUpRight, BarChart3, BookOpen, BrainCircuit, CheckCircle2, Database, Download, FileText, GitBranch, House, Lock, Plus, Search, Send, ShieldCheck, Sparkles, Trash2, X} from 'lucide-react';
import {api} from './api';
import {PrismLogo} from './components/PrismLogo';
import {QueryAnalyst} from './components/QueryAnalyst';
import {AccessWall, WorkspaceLoading} from './SitePages';
import {Overlay, PlotData, Pt, VIEWS, ViewId, index100, movAvg, overlayPoints, pts, summary, yoy} from './graphviews';

export type Mode = 'home' | 'progga' | 'desk' | 'orchestrator' | 'analyst' | 'library' | 'graphs';
const go = (h: string) => { window.location.hash = h; window.scrollTo({top: 0}); };
const Cite = ({ids}: {ids?: string[]}) => <>{(ids || []).map(c => <sup className="cite" key={c}>{c}</sup>)}</>;

function InlineText({text}: {text: string}) {
  const parts = String(text || '').split(/(\[[SF]\d+\]|\*\*.+?\*\*|\*[^*]+\*|\x60[^\x60]+\x60|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
  return <>{parts.map((part, index) => {
    if (/^\[[SF]\d+\]$/.test(part)) return <sup className="cite" key={index}>{part.slice(1, -1)}</sup>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}><InlineText text={part.slice(2, -2)}/></strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}><InlineText text={part.slice(1, -1)}/></em>;
    if (part.startsWith('\x60') && part.endsWith('\x60')) return <code className="inline-code" key={index}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/i);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    return <React.Fragment key={index}>{part}</React.Fragment>;
  })}</>;
}

const tableCells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
const isTableDivider = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
const isBlockStart = (line: string) =>
  /^#{1,6}\s/.test(line) || /^\s*([-*+]|\d+[.)])\s+/.test(line) ||
  /^\s*>\s?/.test(line) || /^\s*\x60{3}/.test(line) ||
  /^\s*(---+|___+|\*\*\*+)\s*$/.test(line);

function FormattedText({text}: {text: string}) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index++; continue; }
    if (line.startsWith('\x60\x60\x60')) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index++;
      while (index < lines.length && !lines[index].trim().startsWith('\x60\x60\x60')) code.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push(<pre className="formatted-code" key={blocks.length} data-language={language || undefined}><code>{code.join('\n')}</code></pre>);
      continue;
    }
    if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headings = tableCells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) rows.push(tableCells(lines[index++]));
      blocks.push(<div className="formatted-table-wrap" key={blocks.length}><table className="formatted-table">
        <thead><tr>{headings.map((cell, cellIndex) => <th key={cellIndex}><InlineText text={cell}/></th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headings.map((_, cellIndex) =>
          <td key={cellIndex}><InlineText text={row[cellIndex] || ''}/></td>)}</tr>)}</tbody>
      </table></div>);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(4, Math.max(3, heading[1].length + 1));
      const content = <InlineText text={heading[2]}/>;
      blocks.push(level === 3 ? <h3 key={blocks.length}>{content}</h3> : <h4 key={blocks.length}>{content}</h4>);
      index++; continue;
    }
    if (/^(---+|___+|\*\*\*+)$/.test(line)) { blocks.push(<hr key={blocks.length}/>); index++; continue; }
    if (/^\s*>\s?/.test(lines[index])) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={blocks.length}><InlineText text={quote.join(' ')}/></blockquote>);
      continue;
    }
    const marker = lines[index].match(/^\s*([-*+]|\d+[.)])\s+/);
    if (marker) {
      const ordered = /^\d/.test(marker[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        items.push(item[2]); index++;
      }
      const list = items.map((item, itemIndex) => <li key={itemIndex}><InlineText text={item}/></li>);
      blocks.push(ordered ? <ol key={blocks.length}>{list}</ol> : <ul key={blocks.length}>{list}</ul>);
      continue;
    }
    const paragraph = [lines[index++].trim()];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index]) &&
           !(lines[index].includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1]))) {
      paragraph.push(lines[index++].trim());
    }
    blocks.push(<p key={blocks.length}><InlineText text={paragraph.join(' ')}/></p>);
  }
  return <div className="formatted-text">{blocks}</div>;
}

const fmt = (n: number | null | undefined, u = '') => n == null ? '—' : n.toLocaleString(undefined, {maximumFractionDigits: 2}) + u;

/* ---------- editable numeric charts ---------- */
type ChartKind = 'line' | 'bar' | 'points';
type ManualAnnotation = {id: string; year: number; text: string; value?: number};
type GraphSeries = PlotData & {series_id?: string; source?: {label?: string; url?: string; document_id?: string}};

function Chart({series, kind, unit, color, overlays = [], annotations = [], svgRef}: {
  series: {label: string; data: Pt[]; dashed?: boolean}[];
  kind: ChartKind; unit: string; color: string; overlays?: Overlay[];
  annotations?: ManualAnnotation[]; svgRef?: React.Ref<SVGSVGElement>;
}) {
  const all = series.flatMap(item => item.data);
  if (!all.length) return <div className="empty">No observations are available for this view and date range.</div>;
  const W = 720, H = 270, p = {l: 66, r: 18, t: 24, b: 34};
  const colors = [color, '#f07b58', '#2d9b6f', '#8e5bdd'];
  const years = Array.from(new Set(all.map(point => point.year))).sort((a, b) => a - b);
  const minYear = years[0], maxYear = years[years.length - 1], yearSpan = maxYear - minYear;
  const x = (year: number) => yearSpan ? p.l + (year - minYear) / yearSpan * (W - p.l - p.r) : (p.l + W - p.r) / 2;
  const annotationValues = annotations.filter(item => item.value != null && item.year >= years[0] && item.year <= years[years.length - 1]).map(item => item.value as number);
  let low = Math.min(...all.map(point => point.value), ...annotationValues), high = Math.max(...all.map(point => point.value), ...annotationValues);
  if (kind === 'bar') { low = Math.min(0, low); high = Math.max(0, high); }
  const valueSpan = high - low || 1;
  const y = (value: number) => H - p.b - (value - low) / valueSpan * (H - p.t - p.b);
  const step = yearSpan ? (W - p.l - p.r) / yearSpan : 28;
  const ticks = Array.from({length: 5}, (_, index) => low + valueSpan * index / 4);
  const skip = Math.max(1, Math.ceil(years.length / 9));
  const shortUnit = unit === '%' ? '%' : unit === 'US$' ? ' US$' : '';

  return <><svg ref={svgRef} viewBox={'0 0 ' + W + ' ' + H} className="chart" role="img" aria-label="Editable numeric graph">
    {ticks.map((value, index) => <g key={index}><line x1={p.l} x2={W - p.r} y1={y(value)} y2={y(value)} className="grid"/>
      <text x={p.l - 9} y={y(value) + 4} textAnchor="end" className="tick">{fmt(value, shortUnit)}</text></g>)}
    {kind === 'bar' && <line x1={p.l} x2={W - p.r} y1={y(0)} y2={y(0)} className="zero"/>}
    {series.map((item, seriesIndex) => {
      const stroke = colors[seriesIndex % colors.length];
      if (kind === 'bar') return <g key={seriesIndex}>{item.data.map(point => {
        const width = Math.min(34, Math.max(5, step * .62 / series.length));
        const offset = (seriesIndex - (series.length - 1) / 2) * width;
        return <rect key={point.year} x={x(point.year) + offset - width / 2} width={width}
          y={Math.min(y(point.value), y(0))} height={Math.max(.5, Math.abs(y(point.value) - y(0)))}
          rx="2" fill={stroke}><title>{point.year + ': ' + (point.raw_value || fmt(point.value))}</title></rect>;
      })}</g>;
      return <g key={seriesIndex}>
        {kind === 'line' && item.data.length > 1 && <polyline fill="none" stroke={stroke} strokeWidth="2.5"
          strokeDasharray={item.dashed ? '6 4' : undefined} strokeLinejoin="round"
          points={item.data.map(point => x(point.year) + ',' + y(point.value)).join(' ')}/>}
        {item.data.map(point => <circle key={point.year} cx={x(point.year)} cy={y(point.value)} r="3.5"
          fill="#fff" stroke={stroke} strokeWidth="2"><title>{point.year + ': ' + (point.raw_value || fmt(point.value))}</title></circle>)}
      </g>;
    })}
    {annotations.filter(item => item.year >= minYear && item.year <= maxYear).map((item, index) => {
      const point = all.reduce((best, row) => Math.abs(row.year - item.year) < Math.abs(best.year - item.year) ? row : best, all[0]);
      const value = item.value == null ? point.value : item.value;
      const labelY = Math.max(p.t + 12, y(value) - 8 - (index % 3) * 13);
      return <g key={item.id}><line x1={x(item.year)} x2={x(item.year)} y1={p.t} y2={H - p.b} className="annotation-line"/>
        <circle cx={x(item.year)} cy={y(value)} r="4" className="annotation-dot"/>
        <text x={x(item.year) + 5} y={labelY} className="annotation-label">{item.text}</text></g>;
    })}
    {years.map((year, index) => index % skip === 0 && <text key={year} x={x(year)} y={H - 10} textAnchor="middle" className="tick">{year}</text>)}
  </svg>
  {series.length > 1 && <div className="legend">{series.map((item, index) =>
    <span key={index}><i style={{background: colors[index % colors.length]}}/>{item.label}</span>)}</div>}
  {overlays.length > 0 && <div className="legend">{overlays.map(item =>
    <span key={item.id}><i className="overlay-key"/> {item.label}</span>)}</div>}
  </>;
}

function downloadEditableSvg(svg: SVGSVGElement | null, title: string) {
  if (!svg) return;
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = '.grid{stroke:#e6eaf4}.zero{stroke:#8b95a7;stroke-width:1}.tick{font:11px Arial,sans-serif;fill:#526078}.annotation-line{stroke:#cf4a42;stroke-dasharray:4 4}.annotation-dot{fill:#cf4a42}.annotation-label{font:12px Arial,sans-serif;fill:#9b2c28}.legend{font:12px Arial,sans-serif}';
  copy.insertBefore(style, copy.firstChild);
  const blob = new Blob([new XMLSerializer().serializeToString(copy)], {type: 'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url;
  link.download = (title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'graph') + '.svg';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PlotCard({plot, view, chartKind, overlays, annotations, color, onRemove, onColor, onAnnotations}: {
  plot: GraphSeries; view: ViewId; chartKind: ChartKind; overlays: Overlay[];
  annotations: ManualAnnotation[]; color: string; onRemove: () => void;
  onColor: (color: string) => void; onAnnotations: (items: ManualAnnotation[]) => void;
}) {
  const data = pts(plot), unit = plot.unit || '', svgRef = useRef<SVGSVGElement>(null);
  const [annotationYear, setAnnotationYear] = useState(String(data[data.length - 1]?.year || ''));
  const [annotationText, setAnnotationText] = useState('');
  const [annotationValue, setAnnotationValue] = useState('');

  let chartSeries: {label: string; data: Pt[]; dashed?: boolean}[] = [];
  if (view === 'trend') {
    chartSeries = [{label: plot.title, data}, ...overlays.map(item => ({
      label: item.label, data: overlayPoints(data, item), dashed: true,
    }))];
  } else if (view === 'yoy') chartSeries = [{label: 'Year-on-year %', data: yoy(data)}];
  else if (view === 'index') chartSeries = [{label: 'Index (base 100)', data: index100(data)}];
  else if (view === 'ma') chartSeries = [{label: 'Observed', data}, {label: '3-observation average', data: movAvg(data), dashed: true}];

  const stats = summary(data);
  const chartUnit = view === 'yoy' ? '%' : view === 'index' ? '' : unit;
  const addAnnotation = (event: React.FormEvent) => {
    event.preventDefault();
    const year = Number(annotationYear), label = annotationText.trim();
    if (!label || !Number.isFinite(year)) return;
    const value = annotationValue.trim() === '' ? undefined : Number(annotationValue);
    onAnnotations([...annotations, {id: String(Date.now()) + '-' + annotations.length, year, text: label,
      value: value !== undefined && Number.isFinite(value) ? value : undefined}]);
    setAnnotationText(''); setAnnotationValue('');
  };
  const updateAnnotation = (id: string, update: Partial<ManualAnnotation>) =>
    onAnnotations(annotations.map(item => item.id === id ? {...item, ...update} : item));

  const chartView = view !== 'stats';
  return <article className="card plot">
    <header className="plot-head"><div><h3>{plot.title}</h3><p className="muted small">{plot.description} {unit && <b>Unit: {unit}</b>}</p></div>
      <div className="plot-actions"><label title="Choose graph color"><input type="color" value={color} aria-label="Graph color" onChange={event => onColor(event.target.value)}/></label>
        {chartView && <button className="btn-ghost" type="button" disabled={!chartSeries.some(item => item.data.length)}
          onClick={() => downloadEditableSvg(svgRef.current, plot.title)}><Download size={14}/> Editable SVG</button>}
        <button className="btn-ghost remove-plot" type="button" onClick={onRemove}><Trash2 size={14}/> Remove</button>
      </div>
    </header>
    {view === 'stats' && stats
      ? <div className="stat-grid">{([
        ['Observations', String(stats.n)], ['Latest', fmt(stats.latest, unit ? ' ' + unit : '') + ' (' + stats.latestYear + ')'],
        ['First', fmt(stats.first, unit ? ' ' + unit : '') + ' (' + stats.firstYear + ')'],
        ['Change', fmt(stats.change, unit ? ' ' + unit : '')], ['Change %', fmt(stats.changePct, '%')],
        ['CAGR', fmt(stats.cagr, '%')], ['Mean', fmt(stats.mean, unit ? ' ' + unit : '')],
        ['Median', fmt(stats.median, unit ? ' ' + unit : '')], ['Std dev', fmt(stats.sd, unit ? ' ' + unit : '')],
        ['Min', fmt(stats.min, unit ? ' ' + unit : '')], ['Max', fmt(stats.max, unit ? ' ' + unit : '')],
      ] as [string, string][]).map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
      : <Chart series={chartSeries} kind={chartKind} unit={chartUnit} color={color}
          overlays={view === 'trend' ? overlays : []}
          annotations={view === 'trend' || view === 'ma' ? annotations : []} svgRef={svgRef}/>}
    <div className="source-line"><span>Source: {plot.source?.label || plot.source?.document_id || 'evidence library'}
      {plot.source?.document_id ? ' · ' + plot.source.document_id : ''}</span>
      {plot.source?.url && <a href={plot.source.url} target="_blank" rel="noopener noreferrer">Open source ↗</a>}
    </div>
    <details className="annotation-editor"><summary>Manual annotations ({annotations.length})</summary>
      <form className="annotation-form" onSubmit={addAnnotation}>
        <input type="number" value={annotationYear} onChange={event => setAnnotationYear(event.target.value)} aria-label="Annotation year" placeholder="Year" required/>
        <input value={annotationText} onChange={event => setAnnotationText(event.target.value)} aria-label="Annotation text" placeholder="Label this point or event" required/>
        <input type="number" step="any" value={annotationValue} onChange={event => setAnnotationValue(event.target.value)} aria-label="Annotation value" placeholder="Value (optional)"/>
        <button className="btn-ghost" type="submit"><Plus size={14}/> Add note</button>
      </form>
      {annotations.map(item => <div className="annotation-row" key={item.id}>
        <input value={item.text} aria-label="Edit annotation label" onChange={event => updateAnnotation(item.id, {text: event.target.value})}/>
        <input type="number" value={item.year} aria-label="Edit annotation year" onChange={event => updateAnnotation(item.id, {year: Number(event.target.value)})}/>
        <button className="btn-ghost" type="button" aria-label="Delete annotation"
          onClick={() => onAnnotations(annotations.filter(row => row.id !== item.id))}><Trash2 size={14}/></button>
      </div>)}
    </details>
    <details className="observations"><summary>Exact source observations ({data.length})</summary>
      <div className="tablewrap"><table><thead><tr><th>Year</th><th>Value as stored</th><th>Unit</th></tr></thead>
        <tbody>{data.map((point, index) => <tr key={point.year + '-' + index}>
          <td>{point.year}</td><td><b>{point.raw_value || String(point.value)}</b></td><td>{unit || '—'}</td>
        </tr>)}</tbody></table></div>
    </details>
  </article>;
}

function RankView({plots}: {plots: GraphSeries[]}) {
  return <div className="card rank-card"><h3>Latest value versus each series’ own peak</h3>
    <p className="muted small">Each bar uses its series’ scale; different units are not compared on one axis.</p>
    {plots.map(plot => { const stat = summary(pts(plot)); if (!stat) return null;
      const pct = stat.max > 0 ? Math.max(0, Math.min(100, stat.latest / stat.max * 100)) : null;
      return <div className="rank-row" key={plot.id}><span>{plot.title}</span><div className="bar"><i style={{width: pct == null ? '0%' : pct + '%'}}/></div>
        <b>{fmt(stat.latest, plot.unit ? ' ' + plot.unit : '')} <small>({stat.latestYear})</small></b></div>;
    })}
  </div>;
}

const seriesKey = (row: GraphSeries) => row.series_id || row.id;

function GraphAgent({question, initial}: {question: string; initial?: any}) {
  const [data, setData] = useState<any>(initial), [q, setQ] = useState(question);
  const [view, setView] = useState<ViewId>('trend'), [chartKind, setChartKind] = useState<ChartKind>('line');
  const [busy, setBusy] = useState(false), [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fromYear, setFromYear] = useState(''), [toYear, setToYear] = useState('');
  const [command, setCommand] = useState(''), [commandMessage, setCommandMessage] = useState('');
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [annotations, setAnnotations] = useState<Record<string, ManualAnnotation[]>>({});

  async function run(text = q) {
    if (!text.trim()) return;
    setBusy(true);
    try { setData(await api('/graph-agent/', {question: text, max_charts: 12})); }
    catch (error: any) { setData({available_series: [], plots: [], message: error.message}); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (!initial && question) run(question); }, []);

  const candidates: GraphSeries[] = data?.available_series || data?.plots || [];
  useEffect(() => {
    if (!data) return;
    const defaults = data.suggested_series || data.selected_series ||
      (data.plots || []).map((row: GraphSeries) => seriesKey(row));
    setSelectedIds(defaults.slice(0, 12));
    const years = candidates.flatMap(row => pts(row).map(point => point.year));
    const scope = data.year_scope || {};
    setFromYear(scope.start == null ? String(years.length ? Math.min(...years) : '') : String(scope.start));
    setToYear(scope.end == null ? String(years.length ? Math.max(...years) : '') : String(scope.end));
    setOverlays([]); setAnnotations({}); setCommandMessage('');
  }, [data]);

  const yearList = candidates.flatMap(row => pts(row).map(point => point.year));
  const minYear = yearList.length ? Math.min(...yearList) : undefined, maxYear = yearList.length ? Math.max(...yearList) : undefined;
  const start = fromYear === '' ? minYear : Number(fromYear), end = toYear === '' ? maxYear : Number(toYear);
  const validRange = start == null || end == null || start <= end;
  const plots = candidates.filter(row => selectedIds.includes(seriesKey(row))).map(row => ({
    ...row, id: 'plot-' + seriesKey(row),
    data: validRange ? pts(row).filter(point => (start == null || point.year >= start) &&
      (end == null || point.year <= end)) : [],
  }));
  const toggleSeries = (id: string, checked: boolean) => setSelectedIds(current =>
    checked ? (current.length >= 12 || current.includes(id) ? current : [...current, id]) : current.filter(item => item !== id));
  const removeSeries = (id: string) => setSelectedIds(current => current.filter(item => item !== id));

  function applyCommand(event: React.FormEvent) {
    event.preventDefault();
    const text = command.trim(), lower = text.toLowerCase();
    if (!text) return;
    if (/^(clear all|remove all(?: graphs)?|delete all(?: graphs| charts)?|delete everything)$/.test(lower)) {
      setSelectedIds([]); setOverlays([]); setAnnotations({});
      setCommandMessage('Cleared all displayed graphs, overlays, and annotations. You can select series again.');
      setCommand(''); return;
    }
    if (/^(remove|delete|hide)\s+/.test(lower)) {
      const target = lower.replace(/^(remove|delete|hide)\s+(?:graph\s+)?/, '').trim();
      if (target.includes('annotation')) {
        setAnnotations({}); setCommandMessage('Removed all manual annotations.'); setCommand(''); return;
      }
      const kept = overlays.filter(item => !item.label.toLowerCase().includes(target) && !target.includes(item.kind.replace('_', ' ')));
      if (kept.length !== overlays.length) {
        setOverlays(kept); setCommandMessage('Removed the matching statistical overlay.'); setCommand(''); return;
      }
      const matches = candidates.filter(row => selectedIds.includes(seriesKey(row)) &&
        (row.title.toLowerCase().includes(target) || target.includes(row.title.toLowerCase())));
      if (matches.length) {
        setSelectedIds(current => current.filter(id => !matches.some(row => seriesKey(row) === id)));
        setCommandMessage('Removed ' + matches.map(row => row.title).join(', ') + ' from the chart view. Source data is still available to reselect.');
      } else setCommandMessage('No selected graph matched “' + target + '”. Use its title or choose Remove on the graph.');
      setCommand(''); return;
    }
    const colorCommand = lower.match(/^(?:set|change|make)\s+(?:graph\s+)?colou?r(?:s)?\s+(?:to|as)\s+(.+)$/);
    if (colorCommand) {
      const names: Record<string, string> = {blue: '#2563eb', indigo: '#5e72e4', red: '#dc2626', green: '#16824b',
        orange: '#ea580c', purple: '#7c3aed', teal: '#0f766e', black: '#111827', pink: '#db2777'};
      const requested = colorCommand[1].trim();
      const chosen = /^#[0-9a-f]{6}$/i.test(requested) ? requested : names[requested];
      if (chosen) {
        setColors(current => ({...current, ...Object.fromEntries(selectedIds.map(id => [id, chosen]))}));
        setCommandMessage('Changed the selected graph colors to ' + requested + '.');
      } else setCommandMessage('Use a color name (blue, red, green, purple, orange, teal, pink, indigo, black) or a six-digit hex value such as #2563eb.');
      setCommand(''); return;
    }
    let overlay: Overlay | null = null;
    const moving = lower.match(/(\d{1,2})[\s-]*(?:year|point|observation|period)?[\s-]*(?:moving|rolling)\s*(?:average|avg)/);
    if (moving || /moving average|rolling average/.test(lower)) {
      const windowSize = Math.max(1, Math.min(50, Number(moving?.[1] || 3)));
      overlay = {id: String(Date.now()), kind: 'moving_average', window: windowSize,
        label: String(windowSize) + '-observation moving average'};
    } else if (/trend\s*line|trendline|regression/.test(lower)) {
      overlay = {id: String(Date.now()), kind: 'trendline', label: 'Linear trendline'};
    } else if (/\bmedian\b/.test(lower)) {
      overlay = {id: String(Date.now()), kind: 'median', label: 'Median reference'};
    } else if (/\bmean\b|\baverage line\b/.test(lower)) {
      overlay = {id: String(Date.now()), kind: 'mean', label: 'Mean reference'};
    } else if (/\b(target|reference|horizontal)\b/.test(lower)) {
      const number = lower.match(/-?\d+(?:\.\d+)?/);
      if (!number) { setCommandMessage('For a target/reference line, include its numeric value, for example: add target line at 5.'); return; }
      overlay = {id: String(Date.now()), kind: 'reference', value: Number(number[0]), label: 'Reference at ' + number[0]};
    }
    if (overlay) {
      setOverlays(current => [...current, overlay!]); setView('trend');
      setCommandMessage('Added ' + overlay.label + ' to the selected graph series.'); setCommand(''); return;
    }
    if (/year.on.year|\byoy\b/.test(lower)) { setView('yoy'); setCommandMessage('Showing year-on-year changes for consecutive years only.'); setCommand(''); return; }
    if (/\bindex(?:ed)?\b/.test(lower)) { setView('index'); setCommandMessage('Showing indexed values (first positive observation = 100).'); setCommand(''); return; }
    if (/summary|statistics|descriptive stats/.test(lower)) { setView('stats'); setCommandMessage('Showing descriptive statistics for the selected date range.'); setCommand(''); return; }
    setCommandMessage('I can remove a graph or annotation, add a moving average, linear trendline, mean, median, target line, or switch to YoY/index/statistics.');
  }

  const resetControls = () => {
    const scope = data?.year_scope || {};
    setSelectedIds((data?.suggested_series || candidates.slice(0, 6).map(seriesKey)).slice(0, 12));
    setFromYear(scope.start == null ? String(minYear ?? '') : String(scope.start));
    setToYear(scope.end == null ? String(maxYear ?? '') : String(scope.end));
    setView('trend'); setChartKind('line'); setOverlays([]); setAnnotations({}); setCommandMessage('');
  };
  const saveCsv = () => {
    const rows: unknown[][] = [['series_id','series','year','numeric_value','source_value','unit','source_id']];
    plots.forEach(plot => pts(plot).forEach(point => rows.push([
      seriesKey(plot), plot.title, point.year, point.value, point.raw_value || String(point.value),
      plot.unit || '', plot.source?.document_id || '',
    ])));
    const csv = rows.map(row => row.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = 'prismsense-graph-data.csv'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section className="graph-agent">
    <div className="gh"><div><div className="kicker">GRAPH AGENT</div><h2>Command your numeric analysis</h2></div>
      <form className="inline-form" onSubmit={event => { event.preventDefault(); run(); }}>
        <input value={q} onChange={event => setQ(event.target.value)} placeholder="e.g. Bangladesh GDP growth, 2018–2025"/>
        <button className="btn-primary" disabled={busy || !q.trim()}><BarChart3 size={15}/>{busy ? 'Finding data…' : 'Find series'}</button>
      </form>
    </div>
    <p className="muted small">Evidence-grounded values only. Select measures, edit the view, and keep every source observation inspectable.</p>
    {candidates.length > 0 && <>
      <div className="graph-controls card">
        <div className="graph-control-head"><div><div className="kicker">DATA & COMMANDS</div>
          <b>{selectedIds.length} selected</b><span className="muted small"> · maximum 12 · {candidates.length} matching series</span></div>
          <div className="graph-actions"><button className="btn-ghost" type="button" onClick={resetControls}>Reset</button>
            <button className="btn-primary" type="button" disabled={!plots.some(plot => pts(plot).length)} onClick={saveCsv}><Download size={14}/> CSV data</button></div>
        </div>
        <div className="graph-control-grid">
          <fieldset className="series-picker"><legend>Choose numeric series</legend><div className="series-options">{candidates.map(row => {
            const id = seriesKey(row), checked = selectedIds.includes(id), disabled = !checked && selectedIds.length >= 12;
            const rows = pts(row);
            return <label key={id} className={disabled ? 'series-option disabled' : 'series-option'}>
              <input type="checkbox" checked={checked} disabled={disabled} onChange={event => toggleSeries(id, event.target.checked)}/>
              <span><b>{row.title}</b><small>{row.unit || 'unit not stated'} · {row.min_year || rows[0]?.year || '—'}–{row.max_year || rows[rows.length - 1]?.year || '—'} · {row.observation_count ?? rows.length} observations</small></span>
            </label>;
          })}</div></fieldset>
          <div className="graph-options">
            <label className="graph-field"><span>From year</span><input type="number" min={minYear} max={maxYear} value={fromYear} onChange={event => setFromYear(event.target.value)}/></label>
            <label className="graph-field"><span>To year</span><input type="number" min={minYear} max={maxYear} value={toYear} onChange={event => setToYear(event.target.value)}/></label>
            <label className="graph-field"><span>Chart style</span><select value={chartKind} onChange={event => setChartKind(event.target.value as ChartKind)}>
              <option value="line">Line</option><option value="bar">Bars</option><option value="points">Points</option></select></label>
            <p className="muted small range-note">{validRange ? 'Only years present in your selected evidence are plotted.' : 'Start year must not exceed end year.'}</p>
          </div>
        </div>
        <form className="agent-command" onSubmit={applyCommand}>
          <label htmlFor="graph-command">Agent Graph command</label>
          <div><input id="graph-command" value={command} onChange={event => setCommand(event.target.value)}
            placeholder="Try: remove GDP per capita · add 5-year moving average · add linear trendline · add target at 5"/>
            <button className="btn-primary" type="submit"><Sparkles size={14}/> Apply</button></div>
          <small>Commands edit this view locally. You can add moving averages, trendlines, mean/median references, target lines, or switch statistical views.</small>
          {commandMessage && <p className="command-message" role="status">{commandMessage}</p>}
        </form>
        {overlays.length > 0 && <div className="overlay-chips"><b>Overlays</b>{overlays.map(item =>
          <button key={item.id} type="button" className="chip on" onClick={() => setOverlays(current => current.filter(row => row.id !== item.id))}>
            {item.label} <X size={12}/></button>)}</div>}
      </div>
      <div className="viewbar" role="tablist" aria-label="Statistical view">{VIEWS.map(item =>
        <button key={item.id} role="tab" aria-selected={item.id === view} className={item.id === view ? 'chip on' : 'chip'}
          onClick={() => setView(item.id)} title={item.hint}>{item.label}</button>)}</div>
      <p className="muted small">{VIEWS.find(item => item.id === view)?.hint} · Calculated from visible observations.</p>
      {plots.length && view === 'rank' ? <RankView plots={plots}/> :
        plots.length ? <div className="plot-grid">{plots.map(plot => {
          const key = seriesKey(plot);
          return <PlotCard key={key + view + chartKind} plot={plot} view={view} chartKind={chartKind}
            overlays={overlays} annotations={annotations[key] || []} color={colors[key] || '#5e72e4'}
            onRemove={() => removeSeries(key)}
            onColor={value => setColors(current => ({...current, [key]: value}))}
            onAnnotations={value => setAnnotations(current => ({...current, [key]: value}))}/>;
        })}</div> : <div className="empty">{validRange ? 'Select a series with observations in this year range.' : 'Start year must not exceed end year.'}</div>}
    </>}
    {!candidates.length && <div className="empty">{busy ? 'Finding numeric series…' : data?.message || 'Ask for a numeric indicator to explore the evidence library.'}</div>}
  </section>;
}


/* ---------- report ---------- */
function Metric({label, value = 0, t}: {label: string; value?: number; t?: number}) {
  const v = Math.max(0, Math.min(100, Math.round(value))), good = v >= (t ?? 80);
  return <div className="metric"><div><span>{label}</span><b className={good ? 'good' : 'bad'}>{v}%</b></div><div className="meter"><i className={good ? 'good' : 'bad'} style={{width: `${v}%`}}/></div></div>;
}

function isStatusNotice(text: string) {
  return /automated synthesis did not meet|generated draft failed the quality gate|interpretive (?:analysis|synthesis) was withheld|knowledge base returned directly relevant evidence|directly relevant evidence was retrieved, but|current research corpus does not contain sufficient verified evidence/i.test(text);
}

function TypingCaret() { return <span className="typing-caret" aria-hidden="true"/>; }

function Report({r, mode, style}: {r: any; mode: Mode; style: string}) {
  const [tab, setTab] = useState<'report' | 'evidence' | 'quality' | 'issues' | 'refs'>('report'), s = r.structured || {}, qa = r.quality || {}, orch = mode === 'orchestrator';
  const M = qa.metrics || {}, T = qa.thresholds || {};
  const reportLead = isStatusNotice(String(s.lead || '')) ? '' : String(s.lead || '');
  const textSegments = useMemo(() => {
    const rows: {key: string; text: string}[] = [];
    const add = (key: string, value: unknown) => { const text = String(value || '').trim(); if (text) rows.push({key, text}); };
    add('lead', reportLead);
    if (orch) add('executive_summary', s.executive_summary);
    (Array.isArray(s.findings) ? s.findings : []).forEach((finding: any, index: number) => {
      add(`finding-${index}-heading`, finding?.heading);
      add(`finding-${index}-text`, finding?.text);
    });
    if (orch) add('critical_analysis', s.critical_analysis);
    add('synthesis', s.synthesis);
    if (orch) {
      add('implications', s.implications);
      add('critical_aspects', s.critical_aspects);
      add('limitations', s.limitations);
      add('conclusion', s.conclusion);
    }
    return rows;
  }, [reportLead, s, orch]);
  const offsets = useMemo(() => {
    let total = 0;
    const byKey: Record<string, number> = {};
    textSegments.forEach(segment => { byKey[segment.key] = total; total += segment.text.length + 1; });
    return {byKey, total};
  }, [textSegments]);
  const [typingState, setTypingState] = useState<{result: any; visible: number}>({result: null, visible: 0});
  const visibleChars = typingState.result === r ? typingState.visible : 0;
  useEffect(() => {
    let frame = 0;
    setTypingState({result: r, visible: 0});
    if (!offsets.total) return;
    const started = performance.now(), duration = Math.min(6800, Math.max(900, offsets.total * 2.4));
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      setTypingState({result: r, visible: Math.floor(offsets.total * progress)});
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [r, offsets.total]);
  const reveal = (key: string, raw: unknown) => {
    const text = String(raw || '').trim(), start = offsets.byKey[key];
    if (!text || start === undefined) return {text: '', complete: true, active: false};
    const count = Math.max(0, Math.min(text.length, visibleChars - start));
    return {text: text.slice(0, count), complete: count === text.length, active: visibleChars >= start && count < text.length};
  };
  const reportSection = (key: string, title: string, text: unknown, cites?: string[]) => {
    const part = reveal(key, text);
    if (!String(text || '').trim() || (!part.text && !part.active)) return null;
    return <section className="rsec" key={key}><div className="kicker">{title}</div><FormattedText text={part.text}/>{part.complete && <Cite ids={cites} />}{part.active && <TypingCaret/>}</section>;
  };
  const issues = useMemo(() => {
    const rows: {title: string; detail: string; kind: 'error' | 'warning' | 'note'}[] = [];
    const seen = new Set<string>();
    const add = (title: string, detail: unknown, kind: 'error' | 'warning' | 'note' = 'warning') => {
      const text = String(detail || '').trim();
      if (text && !seen.has(text)) { seen.add(text); rows.push({title, detail: text, kind}); }
    };
    if (r.model?.error) add('Model activity', r.model.error, r.model.request_status === 'failed' ? 'error' : 'note');
    if (r.model?.request_status === 'disabled' && !r.model?.error) add('Model activity', 'OpenRouter was not called because grounded mode is selected.', 'note');
    if (r.model?.request_status === 'not_attempted_no_evidence' && !r.model?.error) add('Model activity', 'No relevant knowledge-base evidence was retrieved, so synthesis was not sent to the model.', 'warning');
    if (s.lead && isStatusNotice(String(s.lead))) add('Synthesis status', s.lead, 'warning');
    const warnings = Array.isArray(qa.warnings) ? qa.warnings : [];
    warnings.slice(0, 12).forEach((warning: string) => add('Quality review', warning, 'warning'));
    if (!qa.passed && warnings.length === 0) add('Quality review', 'The draft did not pass the publication quality threshold and should be reviewed against its evidence.', 'warning');
    if (s.caveat) add('Evidence limitation', s.caveat, 'note');
    return rows;
  }, [r.model, qa.passed, qa.warnings, s.lead, s.caveat]);
  const tabs: [typeof tab, string][] = [['report', 'Report'], ['evidence', `Evidence (${r.evidence?.length || 0})`], ['quality', 'Quality'], ['issues', issues.length ? `Issues (${issues.length})` : 'Run activity'], ['refs', 'References']];
  const typing = offsets.total > 0 && visibleChars < offsets.total;
  const modelState = r.model?.used_for_answer ? 'Used with the knowledge base' : r.model?.request_status === 'failed' ? 'Not used · request failed' : r.model?.request_status === 'not_attempted_no_evidence' ? 'Not called · no matching evidence' : r.model?.request_status === 'disabled' ? 'Not called · grounded mode' : 'Status unavailable';
  const traceLabels: Record<string, string> = {understand: 'Understand question', query_management: 'Plan search', retrieve: 'Search knowledge base', evidence_packet: 'Prepare evidence for model', model_synthesis: 'LLM synthesis', drafting: 'Draft answer', synthesis: 'Synthesis', graph_agent: 'Agent Graph analysis', agent_query: 'Agent Query review', agent_desk: 'Agent Desk brief', agent_research: 'Agent Research', quality_gate: 'Check answer quality'};
  return <article className="card report">
    <header className="rhead"><div><div className="kicker">{orch ? 'AGENT RESEARCH' : 'AGENT DESK'}</div><h2>{r.question}</h2></div>
      <div className="report-head-actions">{typing && <span className="typing-status"><i/>Writing answer</span>}<div className={qa.passed ? 'badge good' : 'badge warn'}><ShieldCheck size={14}/>{qa.passed ? `Validated · ${Math.round(qa.score || 0)}%` : 'Needs review'}</div></div></header>
    <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : k === 'issues' && issues.length ? 'has-issues' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'report' && <div className="rbody">
      {reportLead && (() => { const part = reveal('lead', reportLead); return part.text || part.active ? <div className="lead"><FormattedText text={part.text}/>{part.complete && <Cite ids={s.lead_citations} />}{part.active && <TypingCaret/>}</div> : null; })()}
      {orch && reportSection('executive_summary', 'EXECUTIVE FRAMING', s.executive_summary, s.executive_summary_citations)}
      {s.findings?.length > 0 && <section className="rsec"><div className="kicker">KEY FINDINGS</div><div className="findings">{s.findings.map((f: any, i: number) => {
        const heading = reveal(`finding-${i}-heading`, f.heading), text = reveal(`finding-${i}-text`, f.text);
        if (!heading.text && !text.text && !heading.active && !text.active) return null;
        return <div className="finding" key={i}><span className="num">{i + 1}</span><div><h3>{heading.text}{heading.active && <TypingCaret/>}</h3><div className="finding-copy"><FormattedText text={text.text}/>{text.complete && <Cite ids={f.citations} />}{text.active && <TypingCaret/>}</div></div></div>;
      })}</div></section>}
      {s.data_points?.length > 0 && <section className="rsec"><div className="kicker">DATA SNAPSHOT</div><div className="tablewrap"><table><thead><tr><th>Measure</th><th>Year</th><th>Value</th><th>Src</th></tr></thead><tbody>{s.data_points.map((d: any, i: number) => <tr key={i}><td>{d.label || '—'}</td><td>{d.year || '—'}</td><td><b>{d.value || '—'}</b> {d.unit && d.unit !== 'world bank series' ? d.unit : ''}</td><td><Cite ids={d.citations}/></td></tr>)}</tbody></table></div></section>}
      {orch && reportSection('critical_analysis', 'CRITICAL ANALYSIS', s.critical_analysis, s.critical_analysis_citations)}
      {reportSection('synthesis', 'ANALYSIS', s.synthesis, s.synthesis_citations)}
      {orch && <>{reportSection('implications', 'IMPLICATIONS', s.implications, s.implications_citations)}{reportSection('critical_aspects', 'CRITICAL ASPECTS & GAPS', s.critical_aspects, s.critical_aspects_citations)}{reportSection('limitations', 'LIMITATIONS', s.limitations, s.limitations_citations)}{reportSection('conclusion', 'CONCLUSION', s.conclusion, s.conclusion_citations)}</>}
    </div>}
    {tab === 'evidence' && <div className="rbody">{r.evidence?.map((e: any) => <div className="ev" key={e.marker}><b>{e.marker.replace(/[\[\]]/g, '')}</b><div><strong>{e.title}</strong><p>{e.text.slice(0, 380)}{e.text.length > 380 ? '…' : ''}</p></div></div>)}</div>}
    {tab === 'quality' && <div className="rbody metrics">{([['Grounding', 'grounding'], ['Citation integrity', 'citation'], ['Relevance', 'relevance'], ['Coherence', 'coherence'], ['Completeness', 'completeness'], ['Source integrity', 'source_integrity'], ['Leakage control', 'evidence_leakage_control'], ['Synthesis integrity', 'synthesis_integrity']] as [string, string][]).map(([l, k]) => <Metric key={k} label={l} value={M[k]} t={T[k]}/>)}
      <p className="muted small">Answer source: {r.model?.used_for_answer ? 'knowledge base + LLM' : 'knowledge base'} · {qa.evidence_count || 0} evidence items · {r.query_plan?.intent}</p></div>}
    {tab === 'issues' && <div className="rbody issue-content">
      <div className="run-overview">
        <div className="run-stat"><span>Knowledge base</span><b>{r.evidence?.length || 0} evidence items</b><small>Retrieved records and numeric facts are listed in the Evidence tab.</small></div>
        <div className="run-stat"><span>Model synthesis</span><b>{modelState}</b><small>{r.model?.model || (r.model?.mode === 'grounded' ? 'Grounded mode' : 'Configured model unavailable')}</small></div>
        <div className="run-stat"><span>Quality gate</span><b>{qa.passed ? `Passed · ${Math.round(qa.score || 0)}%` : `Needs review · ${Math.round(qa.score || 0)}%`}</b><small>Open the Quality tab for individual scores.</small></div>
      </div>
      <div className="issue-section"><div className="kicker">ISSUES & EVIDENCE NOTES</div>{issues.length ? <div className="issue-list">{issues.map((issue, index) => <article className={`issue-item issue-${issue.kind}`} key={`${issue.title}-${index}`}><b>{issue.title}</b><FormattedText text={issue.detail}/>{issue.title === 'Evidence limitation' && <Cite ids={s.caveat_citations}/>}</article>)}</div> : <p className="all-clear"><ShieldCheck size={16}/> No model or quality issues were reported for this run.</p>}</div>
      <div className="issue-section"><div className="kicker">RUN ACTIVITY</div>{r.trace?.length ? <ol className="activity-list">{r.trace.map((item: any, index: number) => <li key={`${item.stage}-${index}`}><span className="activity-dot"/><div><b>{traceLabels[item.stage] || item.stage}</b><small>{item.detail || item.error || (item.count != null ? `${item.count} evidence items` : item.score != null ? `Score ${Math.round(item.score)}%` : item.status || 'complete')}</small></div><span className="activity-result">{String(item.status || 'complete').replace(/_/g, ' ')}</span></li>)}</ol> : <p className="muted small">No detailed activity trace was returned.</p>}</div>
    </div>}
    {tab === 'refs' && <div className="rbody"><div className="kicker">REFERENCES · {style}</div><pre className="refs">{r.references || 'No references.'}</pre></div>}
  </article>;
}

function ThinkingChannel({mode, seconds}: {mode: Mode; seconds: number}) {
  return <section className="thinking-channel" role="status" aria-live="polite">
    <div className="thinking-mark"><Sparkles size={17}/></div>
    <div className="thinking-copy"><div><b>Thinking through the evidence</b><span className="thinking-dots"><i/><i/><i/></span><small>{seconds}s</small></div>
      <p>Searching the project’s JSON knowledge base, preparing the matched evidence for model synthesis, and checking the answer and citations.</p>
      <div className="thinking-meter"><i/></div>
      <span className="thinking-mode">{mode === 'orchestrator' ? 'Building a detailed research report' : 'Preparing a concise research brief'}</span>
    </div>
  </section>;
}

/* ---------- library ---------- */
type ProggaMessage = {id: string; role: 'user' | 'assistant'; question: string; result?: any; error?: string; pending?: boolean};

const proggaAgents = [
  {key: 'query', name: 'Agent Query', icon: <BrainCircuit size={15}/>, action: 'Shapes the request'},
  {key: 'desk', name: 'Agent Desk', icon: <Sparkles size={15}/>, action: 'Drafts a concise answer'},
  {key: 'research', name: 'Agent Research', icon: <GitBranch size={15}/>, action: 'Builds the cited report'},
  {key: 'graph', name: 'Agent Graph', icon: <BarChart3 size={15}/>, action: 'Finds numeric evidence'},
] as const;

function ProggaTeam({result}: {result: any}) {
  const agents = result?.agents || {};
  const deskAnswer = agents.desk?.answer;
  const queryNote = agents.query?.note;
  const activeAgents = proggaAgents.filter(agent => Object.prototype.hasOwnProperty.call(agents, agent.key));
  return <section className="progga-team" aria-label="Progga agent activity">
    <div className="progga-team-head"><div><div className="kicker">AGENT ROUTING</div><h3>Selected for this request</h3></div><span className="progga-team-live"><i/> Run complete</span></div>
    <div className="progga-agent-grid">{activeAgents.map(agent => {
      const state = agents[agent.key] || {};
      const complete = state.status === 'complete';
      const graphText = state.plots ? `${state.plots} chart${state.plots === 1 ? '' : 's'} · ${state.series || 0} series` : state.status === 'no_data' ? 'No matching numeric series' : '';
      const detailText = state.status === 'failed' ? 'Could not complete' : agent.key === 'graph' && state.status === 'no_data' ? graphText : complete ? agent.key === 'graph' ? graphText || agent.action : agent.action : agent.action;
      const note = agent.key === 'query' ? queryNote : agent.key === 'desk' ? deskAnswer : '';
      return <details className={`progga-agent progga-agent-${agent.key}`} key={agent.key}>
        <summary><span className="progga-agent-icon">{agent.icon}</span><span className="progga-agent-copy"><b>{agent.name}</b><small>{detailText}</small></span><span className={`progga-agent-state ${complete ? 'is-done' : state.status === 'failed' ? 'is-error' : ''}`}>{complete ? 'Done' : state.status === 'failed' ? 'Issue' : state.status === 'no_data' ? 'Checked' : 'Ready'}</span></summary>
        {note && <div className="progga-agent-note"><FormattedText text={note}/></div>}
        {agent.key === 'research' && <div className="progga-agent-note">The evidence-led report, sources and quality review are below.</div>}
        {agent.key === 'graph' && state.status !== 'no_data' && <div className="progga-agent-note">Numeric findings from Agent Graph appear below when matching data is available.</div>}
      </details>;
    })}</div>
  </section>;
}

function ProggaQueryResult({query}: {query: any}) {
  const questions = Array.isArray(query?.questions) ? query.questions.filter((item: any) => typeof item === 'string' && item.trim()) : [];
  return <section className="progga-query-result">
    <div className="kicker">AGENT QUERY · QUESTION DESIGN</div>
    {query?.summary && <h3>{query.summary}</h3>}
    {(query?.chat_message || query?.error) && <p>{query.chat_message || query.error}</p>}
    {questions.length > 0 && <ol>{questions.map((question: string, index: number) => <li key={`${index}-${question}`}>{question}</li>)}</ol>}
  </section>;
}

function ProggaWorkspace({draft, setDraft, messages, setMessages, selectedEvidence, citationStyle, setCitationStyle, agentMode, setAgentMode, busy, setBusy, seconds, setSeconds}: {draft: string; setDraft: (value: string) => void; messages: ProggaMessage[]; setMessages: React.Dispatch<React.SetStateAction<ProggaMessage[]>>; selectedEvidence: string[]; citationStyle: string; setCitationStyle: (value: string) => void; agentMode: 'auto' | 'all'; setAgentMode: (value: 'auto' | 'all') => void; busy: boolean; setBusy: (value: boolean) => void; seconds: number; setSeconds: (value: number | ((current: number) => number)) => void}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'}); }, [messages, busy]);
  useEffect(() => { if (messages.length) inputRef.current?.focus(); }, [messages.length]);
  async function submit(question = draft) {
    const text = question.trim();
    if (!text || busy) return;
    const id = `progga-${Date.now()}`;
    const context = messages.slice(-8).map(message => {
      if (message.role === 'user') return `User: ${message.question}`;
      const response = message.result?.answer || message.result?.query_agent?.summary || message.result?.query_agent?.chat_message;
      return response ? `Progga: ${String(response).slice(0, 600)}` : '';
    }).filter(Boolean).join('\n').slice(-2400);
    setDraft('');
    setBusy(true);
    setSeconds(0);
    setMessages(previous => [...previous, {id: `${id}-user`, role: 'user', question: text}, {id, role: 'assistant', question: text, pending: true}]);
    try {
      const result = await api<any>('/progga/', {question: text, context, agent_mode: agentMode, citation_style: citationStyle, selected_evidence: selectedEvidence});
      setMessages(previous => previous.map(message => message.id === id ? {...message, result, pending: false} : message));
    } catch (error: any) {
      setMessages(previous => previous.map(message => message.id === id ? {...message, error: error?.message || 'Progga could not complete the research run.', pending: false} : message));
    } finally {
      setBusy(false);
    }
  }

  return <section className={`progga-screen ${messages.length ? 'has-messages' : 'is-empty'}`}>
    <div className="progga-thread" aria-live="polite">
      {!messages.length ? <div className="progga-welcome">
        <div className="progga-orb"><PrismLogo size={34}/><span><i/><i/><i/><i/></span></div>
        <div className="kicker">YOUR RESEARCH TEAM</div>
        <h1>What would you like to know?</h1>
        <p>Ask in your own words. Progga reads the request and conversation, then selects the specialists that fit. You can also ask for all four.</p>
        <div className="progga-routing-hint"><Sparkles size={15}/> Automatic specialist selection · Run all four anytime</div>
        <div className="progga-prompts" aria-label="Suggested questions">
          <button onClick={() => setDraft('How has poverty in Bangladesh changed over time, and what evidence explains the trend?')}>Explore a trend <ArrowUpRight size={14}/></button>
          <button onClick={() => setDraft('What evidence supports or challenges the claim that economic growth has been inclusive?')}>Compare evidence <ArrowUpRight size={14}/></button>
          <button onClick={() => setDraft('Summarize the strongest findings on climate resilience and identify the main gaps.')}>Find research gaps <ArrowUpRight size={14}/></button>
        </div>
      </div> : <div className="progga-messages">{messages.map(message => message.role === 'user' ? <div className="progga-user-message" key={message.id}><span className="progga-user-avatar">You</span><p>{message.question}</p></div> : <article className="progga-assistant-message" key={message.id}>
        <div className="progga-assistant-heading"><span className="progga-assistant-avatar"><PrismLogo size={18}/></span><div><b>Progga</b><small>{message.result ? proggaAgents.filter(agent => message.result.agents?.[agent.key]).map(agent => agent.name).join(' · ') : 'Choosing the right specialists for your request'}</small></div></div>
        {message.pending && <div className="progga-progress" role="status"><div className="progga-progress-title"><Sparkles size={16}/><b>{agentMode === 'all' ? 'All four specialists are working together' : 'Progga is selecting the right specialists'}</b><span>{seconds}s</span></div>{agentMode === 'all' && <div className="progga-progress-agents">{proggaAgents.map(agent => <span key={agent.key}><i/>{agent.name}</span>)}</div>}<p>{agentMode === 'all' ? 'The full team is checking your request against the evidence.' : 'Reading your request and conversation context, then checking the relevant evidence.'}</p></div>}
        {message.error && <div className="msg msg-err" role="alert">{message.error}</div>}
        {message.result && <><ProggaTeam result={message.result}/>{message.result.primary_agent === 'query' && <ProggaQueryResult query={message.result.query_agent} />}{message.result.primary_agent !== 'query' && message.result.answer && <Report r={message.result} mode={message.result.agents?.research?.status === 'failed' || message.result.primary_agent === 'desk' ? 'desk' : 'orchestrator'} style={citationStyle} />}{message.result.agents?.graph && <GraphAgent question={message.question} initial={message.result.graph_agent}/>}</>}
      </article>)}</div>}
      <div ref={bottomRef}/>
    </div>
    <div className="progga-composer-wrap"><div className="progga-composer">
      <textarea ref={inputRef} value={draft} maxLength={600} onChange={event => setDraft(event.target.value)} placeholder="Ask Progga anything about your research…" aria-label="Message Progga" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }}/>
      <div className="progga-composer-footer"><div className="progga-composer-tools"><button type="button" className="progga-add-evidence" onClick={() => go('#/app/library')}><Plus size={17}/><span>{selectedEvidence.length ? `${selectedEvidence.length} sources selected` : 'Add evidence'}</span></button><label className="progga-agent-mode"><span>Agents</span><select value={agentMode} onChange={event => setAgentMode(event.target.value as 'auto' | 'all')} aria-label="Agent selection"><option value="auto">Auto-select</option><option value="all">Run all four</option></select></label><label className="progga-citation"><span>Citations</span><select value={citationStyle} onChange={event => setCitationStyle(event.target.value)} aria-label="Citation style"><option>APA</option><option>MLA</option><option>Chicago</option><option>Harvard</option></select></label><span className="progga-shortcut">↵ to send · Shift + ↵ for a new line</span></div><button className="progga-send" type="button" onClick={() => void submit()} disabled={!draft.trim() || busy} aria-label="Send to Progga">{busy ? <Activity size={17}/> : <Send size={17}/>}</button></div>
    </div><p className="progga-footnote">Progga works from your evidence library. Review sources and quality notes before relying on a finding.</p></div>
  </section>;
}

function Library({selected, setSelected}: {selected: string[]; setSelected: (v: string[]) => void}) {
  const [q, setQ] = useState(''), [tab, setTab] = useState<'documents' | 'figures'>('documents'), [data, setData] = useState<any>({documents: [], figures: [], counts: {}}), [busy, setBusy] = useState(false), [detail, setDetail] = useState<any>(null);
  async function search() { setBusy(true); try { setData(await api(`/library/?q=${encodeURIComponent(q)}&limit=60`)); } catch { setData({documents: [], figures: [], counts: {}}); } finally { setBusy(false); } }
  useEffect(() => { search(); }, []);
  const on = (id: string) => selected.includes(id), tog = (id: string) => setSelected(on(id) ? selected.filter(x => x !== id) : [...selected, id]);
  return <div className="page"><div className="kicker">EVIDENCE DATABASE</div><h1>Evidence Library</h1><p className="muted">{data.counts?.documents || 0} documents you can access · {data.counts?.figures || 0} data series. Select items to pin them into your next research run.</p>
    <form className="inline-form big" onSubmit={e => { e.preventDefault(); search(); }}><Search size={16}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search documents, indicators, themes…"/><button className="btn-primary" disabled={busy}>{busy ? '…' : 'Search'}</button></form>
    <div className="viewbar"><button className={tab === 'documents' ? 'chip on' : 'chip'} onClick={() => setTab('documents')}>Documents</button><button className={tab === 'figures' ? 'chip on' : 'chip'} onClick={() => setTab('figures')}>Data points</button><span className="muted small">{selected.length} selected</span></div>
    <div className="list">{tab === 'documents' ? data.documents.map((d: any) => <div className="card item" key={d.id}><div className="meta"><span>{d.kind}</span><span>{d.theme}</span><span>{d.date || 'undated'}</span>{d.private && <span className="lock"><Lock size={11}/> private</span>}</div><h3>{d.title}</h3><p>{d.preview}</p><div className="actions"><button className="btn-ghost" onClick={() => setDetail(d)}>Inspect</button><button className={on(d.id) ? 'btn-primary' : 'btn-ghost'} onClick={() => tog(d.id)}>{on(d.id) ? 'Selected' : 'Select'}</button></div></div>)
      : data.figures.map((f: any) => <div className="card item row" key={f.id}><div><div className="meta"><span>{f.year}</span></div><h3>{f.label}</h3><p>{f.note}</p></div><b className="big-val">{f.value}</b><button className={on(f.id) ? 'btn-primary' : 'btn-ghost'} onClick={() => tog(f.id)}>{on(f.id) ? 'Selected' : 'Select'}</button></div>)}
      {!(tab === 'documents' ? data.documents : data.figures).length && <div className="empty">Nothing matches.</div>}</div>
    {detail && <div className="modal-bg" onClick={() => setDetail(null)}><div className="modal" role="dialog" aria-modal onClick={e => e.stopPropagation()}><button className="x" onClick={() => setDetail(null)} aria-label="Close"><X size={16}/></button><div className="kicker">SOURCE RECORD</div><h2>{detail.title}</h2><p>{detail.preview}</p>{detail.url && <a href={detail.url} target="_blank" rel="noopener noreferrer">Open original ↗</a>}</div></div>}</div>;
}

function HomeDashboard({name}: {name: string}) {
  const modules: {mode: Mode; title: string; description: string; icon: React.ReactNode; tone: string; action: string}[] = [
    {mode: 'desk', title: 'Agent Desk', description: 'Ask a focused question and get a concise, cited answer from your evidence.', icon: <Sparkles size={19}/>, tone: 'blue', action: 'Open Agent Desk'},
    {mode: 'orchestrator', title: 'Agent Research', description: 'Explore complex questions through evidence retrieval, synthesis and review.', icon: <GitBranch size={19}/>, tone: 'violet', action: 'Start an analysis'},
    {mode: 'analyst', title: 'Agent Query', description: 'Turn early ideas into focused research questions, then explore theory and methods.', icon: <BrainCircuit size={19}/>, tone: 'amber', action: 'Shape your inquiry'},
    {mode: 'library', title: 'Evidence Library', description: 'Search source documents and data points. Pin evidence for your next run.', icon: <BookOpen size={19}/>, tone: 'cyan', action: 'Browse evidence'},
    {mode: 'graphs', title: 'Agent Graph', description: 'Compare supported numeric series and inspect their source observations.', icon: <BarChart3 size={19}/>, tone: 'indigo', action: 'Explore data'},
  ];
  return <div className="page home-page">
    <section className="home-welcome card">
      <div className="home-welcome-copy"><div className="kicker">YOUR RESEARCH WORKSPACE</div><h1>Welcome back, {name || 'researcher'}.</h1><p>Explore trusted evidence, investigate a question and turn what you find into a clear, reviewable answer.</p>
        <button className="btn-primary" onClick={() => go('#/app/progga')}>Open Progga <ArrowUpRight size={16}/></button>
      </div>
      <div className="home-welcome-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="prism-core"><PrismLogo size={48}/></div><span className="orbit-node node-a"><BookOpen size={16}/></span><span className="orbit-node node-b"><BarChart3 size={16}/></span><span className="orbit-node node-c"><Sparkles size={16}/></span></div>
    </section>
    <section className="progga-launch card"><div className="progga-launch-mark"><Sparkles size={22}/></div><div><div className="kicker">ONE QUESTION · THE RIGHT SPECIALISTS</div><h2>Meet Progga</h2><p>Progga reads the request and context, then selects the specialists that fit. Ask for all four whenever you want a full-team review.</p></div><button className="btn-primary" onClick={() => go('#/app/progga')}>Start with Progga <ArrowUpRight size={16}/></button></section>
    <section className="home-section"><div className="home-section-head"><div><div className="kicker">SPECIALIST WORKSPACES</div><h2>Choose a workspace</h2></div><span className="home-trust"><ShieldCheck size={15}/> Evidence first · model assisted</span></div>
      <div className="module-grid">{modules.map(item => <article className={`module-card module-${item.tone}`} key={item.mode}><div className="module-icon">{item.icon}</div><h3>{item.title}</h3><p>{item.description}</p><button onClick={() => go(`#/app/${item.mode}`)}>{item.action}<ArrowUpRight size={15}/></button></article>)}</div>
    </section>
    <section className="home-workflow card"><div className="workflow-mark"><Database size={19}/></div><div><div className="kicker">ONE TRACEABLE WORKFLOW</div><h2>From source to insight, in one place.</h2><p>PrismSense retrieves from the project knowledge base, uses the configured model for synthesis when available, and keeps evidence, references and quality notes beside the result.</p></div><div className="workflow-steps"><span><i>1</i> Retrieve</span><span><i>2</i> Synthesize</span><span><i>3</i> Review</span></div></section>
  </div>;
}

/* ---------- shell ---------- */
export default function Workspace({mode, initialQ}: {mode: Mode; initialQ: string}) {
  const [q, setQ] = useState(initialQ), [style, setStyle] = useState('APA'), [r, setR] = useState<any>(null), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [sel, setSel] = useState<string[]>([]), [secs, setSecs] = useState(0);
  const [proggaMessages, setProggaMessages] = useState<ProggaMessage[]>([]), [proggaDraft, setProggaDraft] = useState(mode === 'progga' ? initialQ || '' : ''), [proggaAgentMode, setProggaAgentMode] = useState<'auto' | 'all'>('auto'), [proggaBusy, setProggaBusy] = useState(false), [proggaSeconds, setProggaSeconds] = useState(0);
  const [showRunError, setShowRunError] = useState(false);
  const [access, setAccess] = useState<any>(null), [remaining, setRemaining] = useState<number | null>(null), [accessError, setAccessError] = useState('');
  const timer = useRef<number>();
  useEffect(() => {
    let live = true;
    const onSearchShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey &&
          !target?.closest('input, textarea, select, [contenteditable="true"]')) {
        event.preventDefault();
        go('#/app/library');
      }
    };
    window.addEventListener('keydown', onSearchShortcut);
    api('/access/status/').then(status => {
      if (!live) return;
      setAccess(status);
      setRemaining(typeof status.seconds_remaining === 'number' ? status.seconds_remaining : null);
    }).catch((error: Error) => { if (live) setAccessError(error.message); });
    const tick = window.setInterval(() => setRemaining(value => value === null ? null : Math.max(0, value - 1)), 1000);
    const onAccessRequired = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      setAccess({authenticated: false, active: false, expired: detail.code === 'DEMO_EXPIRED'});
      if (detail.code === 'DEMO_EXPIRED') setRemaining(0);
    };
    window.addEventListener('prism:access-required', onAccessRequired);
    return () => { live = false; window.clearInterval(tick); window.removeEventListener('prism:access-required', onAccessRequired); window.removeEventListener('keydown', onSearchShortcut); };
  }, []);
  useEffect(() => {
    if (!proggaBusy) return;
    const timer = window.setInterval(() => setProggaSeconds(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [proggaBusy]);
  async function run() {
    if (!q.trim() || busy) return; setBusy(true); setErr(''); setShowRunError(false); setR(null); setSecs(0); timer.current = window.setInterval(() => setSecs(s => s + 1), 1000);
    try { setR(await api(mode === 'orchestrator' ? '/orchestrate/' : '/ask/', {question: q, citation_style: style, selected_evidence: sel})); }
    catch (e: any) { setR(null); setErr(e.message); }
    finally { window.clearInterval(timer.current); setBusy(false); }
  }
  const workspaceNav: [Mode, string, React.ReactNode][] = [['home', 'Home', <House size={16}/>], ['progga', 'Progga', <Sparkles size={16}/>]];
  const agentNav: [Mode, string, React.ReactNode][] = [['desk', 'Agent Desk', <FileText size={16}/>], ['orchestrator', 'Agent Research', <GitBranch size={16}/>], ['analyst', 'Agent Query', <BrainCircuit size={16}/>], ['graphs', 'Agent Graph', <BarChart3 size={16}/>]];
  const expired = Boolean(access?.expired || (access?.active && remaining === 0));
  if (!access) return accessError ? <main className="access-checking"><p>{accessError}</p><a href="#/login">Sign in with Google</a><a href="#/">Return home</a></main> : <WorkspaceLoading/>;
  if (!access.authenticated && (!access.active || expired)) return <AccessWall expired={expired}/>;
  const timerText = remaining == null ? '' : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  async function signOut() { try { await api('/auth/logout/', {}); } finally { window.location.hash = '#/'; } }
  const title = mode === 'home' ? 'Home' : mode === 'progga' ? 'Progga' : mode === 'desk' ? 'Agent Desk' : mode === 'orchestrator' ? 'Agent Research' : mode === 'analyst' ? 'Agent Query' : mode === 'library' ? 'Evidence Library' : 'Agent Graph';
  const displayName = access.name || access.email?.split('@')[0] || 'Researcher';
  return <div className="app"><aside className="app-sidebar"><button className="brand" onClick={() => go('#/app/home')}><PrismLogo size={30}/><div><b>PrismSense</b><small>Research intelligence</small></div></button>
    <div className="sidebar-label">WORKSPACE</div><nav className="app-nav">{workspaceNav.map(([m, l, i]) => <button key={m} className={mode === m ? 'active' : ''} onClick={() => go(`#/app/${m}`)}>{i}<span>{l}</span></button>)}</nav>
    <div className="sidebar-label sidebar-label-agents">AGENTS</div><nav className="app-nav agent-nav">{agentNav.map(([m, l, i]) => <button key={m} className={mode === m ? 'active' : ''} onClick={() => go(`#/app/${m}`)}>{i}<span>{l}</span></button>)}</nav>
    <div className="sidebar-label sidebar-label-secondary">RESOURCES</div><div className="side-pages"><button className={mode === 'library' ? 'active' : ''} onClick={() => go('#/app/library')}><BookOpen size={15}/> Evidence Library</button><a href="#/docs"><BookOpen size={15}/> Documentation</a><a href="#/pricing"><ShieldCheck size={15}/> Plans & access</a></div>
    <div className="side-bottom"><div className="usercard"><div className="usercard-title"><span className="avatar-mini">{access.authenticated ? displayName.slice(0,1).toUpperCase() : 'P'}</span><div><b>{access.authenticated ? displayName : 'Free demo'}</b><span>{access.authenticated ? 'Verified account' : 'Demo workspace'}</span></div></div>
      <span>{access.authenticated ? 'Google verified · full access' : access.local_development ? 'Local development · no expiry' : 'All tools unlocked for 10 minutes'}</span>
      {!access.authenticated && !access.local_development && <strong className={remaining != null && remaining < 60 ? 'demo-clock demo-clock-low' : 'demo-clock'}>{timerText} remaining</strong>}
      {access.authenticated ? <button onClick={signOut}>Sign out</button> : <button onClick={() => go('#/login')}>Sign in for full access</button>}
      </div>
      <div className="madeby">Made by<br/><b>DEN Agentic AI x Relogic Labs</b></div></div></aside>
    <main className="app-main"><header className="workspace-topbar"><div className="topbar-location"><span>Workspace</span><i>/</i><b>{title}</b></div><button className="topbar-search" onClick={() => go('#/app/library')}><Search size={16}/><span>Search your evidence library</span><kbd>/</kbd></button><div className="topbar-actions"><span className="topbar-status"><i/>{access.authenticated ? 'Account active' : 'Demo active'}</span><button className="topbar-user" onClick={access.authenticated ? signOut : () => go('#/login')} title={access.authenticated ? 'Sign out' : 'Sign in'}><span className="topbar-avatar">{access.authenticated ? displayName.slice(0,1).toUpperCase() : 'P'}</span><span><b>{displayName}</b><small>{access.authenticated ? 'Sign out' : 'Sign in'}</small></span></button></div></header>
    <div className="workspace-content">{mode === 'home' ? <HomeDashboard name={displayName}/> : mode === 'progga' ? <ProggaWorkspace draft={proggaDraft} setDraft={setProggaDraft} messages={proggaMessages} setMessages={setProggaMessages} selectedEvidence={sel} citationStyle={style} setCitationStyle={setStyle} agentMode={proggaAgentMode} setAgentMode={setProggaAgentMode} busy={proggaBusy} setBusy={setProggaBusy} seconds={proggaSeconds} setSeconds={setProggaSeconds}/> : mode === 'analyst' ? <QueryAnalyst onSendToDesk={(question) => { setQ(question); go('#/app/desk'); }} onSendToOrchestrator={(question) => { setQ(question); go('#/app/orchestrator'); }}/> : mode === 'library' ? <Library selected={sel} setSelected={setSel}/> : mode === 'graphs' ? <div className="page"><div className="page-heading"><div className="kicker">VISUAL RESEARCH</div><h1>Agent Graph</h1><p className="muted">Compare numeric evidence, discover patterns and inspect every plotted value.</p></div><GraphAgent question={q} key="g"/></div> :
      <div className="page"><div className="page-heading"><div className="kicker">RESEARCH WORKSPACE</div><h1>{mode === 'desk' ? 'Agent Desk' : 'Agent Research'}</h1>
        <p className="muted">{mode === 'desk' ? 'Fast, cited briefs from your evidence base.' : 'Long-form critical analysis with implications and limitations.'}</p>
      </div>
        {err && <div className="run-error-area"><button className="issue-button" type="button" aria-expanded={showRunError} onClick={() => setShowRunError(value => !value)}>Request issue (1) <span>{showRunError ? 'Hide' : 'View details'}</span></button>{showRunError && <div className="msg msg-err" role="alert">{err}</div>}</div>}
        <div className="card composer"><textarea value={q} maxLength={600} onChange={e => setQ(e.target.value)} placeholder="Ask a research question…" onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); }}/>
          <div className="controls"><span className="muted small">{sel.length} pinned · {q.length}/600</span><select value={style} onChange={e => setStyle(e.target.value)} aria-label="Citation style"><option>APA</option><option>MLA</option><option>Chicago</option><option>Harvard</option></select>
            <button className="btn-primary" onClick={run} disabled={busy}>{busy ? `Researching… ${secs}s` : <>Run research <Send size={15}/></>}</button></div></div>
        {busy && <ThinkingChannel mode={mode} seconds={secs}/>}
        {r ? <><Report r={r} mode={mode} style={style}/><GraphAgent key={r.question} question={r.question} initial={r.graph_agent}/></> : <div className="tips"><div><b>1</b> Ask a focused question.</div><div><b>2</b> Optionally pin evidence in the Library.</div><div><b>3</b> Get a cited, quality-checked answer with charts.</div></div>}</div>}</div></main></div>;
}
