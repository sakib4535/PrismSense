export type Pt = {year: number; value: number; raw_value?: string};
export type SourceMeta = {document_id?: string; label?: string; url?: string; note?: string; marker?: string};
export type PlotData = {
  id: string; series_id?: string; title: string; unit?: string; description?: string;
  data?: Pt[]; source?: SourceMeta; min_year?: number; max_year?: number;
  observation_count?: number; selection_score?: number;
  series?: {id: string; label: string; unit?: string; data: Pt[]}[];
};
export type Overlay = {
  id: string;
  kind: 'moving_average' | 'trendline' | 'mean' | 'median' | 'reference';
  label: string;
  window?: number;
  value?: number;
};
export type ViewId = 'trend' | 'yoy' | 'index' | 'ma' | 'stats' | 'rank';

export const VIEWS: {id: ViewId; label: string; hint: string}[] = [
  {id: 'trend', label: 'Trend', hint: 'Source values over time'},
  {id: 'yoy', label: 'Year-on-year %', hint: 'Percent change only where consecutive calendar years exist'},
  {id: 'index', label: 'Indexed (base = 100)', hint: 'Relative change from a positive first observation'},
  {id: 'ma', label: '3-observation average', hint: 'Trailing average across the last three observations'},
  {id: 'stats', label: 'Summary stats', hint: 'Mean, median, spread, CAGR and change'},
  {id: 'rank', label: 'Latest vs peak', hint: 'Latest value compared with each series’ own peak'},
];

export const pts = (plot: PlotData): Pt[] =>
  (plot.data || plot.series?.[0]?.data || []).slice().sort((a, b) => a.year - b.year);
const r2 = (value: number) => Math.round(value * 100) / 100;

export const yoy = (data: Pt[]): Pt[] => {
  const result: Pt[] = [];
  for (let index = 1; index < data.length; index++) {
    const previous = data[index - 1], current = data[index];
    if (current.year !== previous.year + 1 || previous.value === 0) continue;
    result.push({year: current.year, value: r2((current.value - previous.value) / Math.abs(previous.value) * 100)});
  }
  return result;
};

export const index100 = (data: Pt[]): Pt[] =>
  data.length && data[0].value > 0
    ? data.map(point => ({year: point.year, value: r2(point.value / data[0].value * 100)}))
    : [];

export const movAvg = (data: Pt[], windowSize = 3): Pt[] =>
  data.map((point, index) => {
    const observations = data.slice(Math.max(0, index - windowSize + 1), index + 1);
    return {year: point.year, value: r2(observations.reduce((sum, row) => sum + row.value, 0) / observations.length)};
  });

export function summary(data: Pt[]) {
  if (!data.length) return null;
  const values = data.map(point => point.value), n = values.length, mean = values.reduce((a, b) => a + b, 0) / n;
  const sorted = values.slice().sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n);
  const first = data[0], latest = data[n - 1], span = latest.year - first.year;
  const cagr = first.value > 0 && latest.value > 0 && span > 0
    ? (Math.pow(latest.value / first.value, 1 / span) - 1) * 100 : null;
  return {
    n, latest: latest.value, latestYear: latest.year, first: first.value, firstYear: first.year,
    min: sorted[0], max: sorted[n - 1], mean: r2(mean), median: r2(median), sd: r2(sd),
    change: r2(latest.value - first.value),
    changePct: first.value !== 0 ? r2((latest.value - first.value) / Math.abs(first.value) * 100) : null,
    cagr: cagr === null ? null : r2(cagr),
  };
}

export function overlayPoints(data: Pt[], overlay: Overlay): Pt[] {
  if (!data.length) return [];
  if (overlay.kind === 'moving_average') return movAvg(data, Math.max(1, overlay.window || 3));
  if (overlay.kind === 'trendline') {
    const meanYear = data.reduce((sum, point) => sum + point.year, 0) / data.length;
    const meanValue = data.reduce((sum, point) => sum + point.value, 0) / data.length;
    const denominator = data.reduce((sum, point) => sum + (point.year - meanYear) ** 2, 0);
    const slope = denominator ? data.reduce((sum, point) =>
      sum + (point.year - meanYear) * (point.value - meanValue), 0) / denominator : 0;
    return data.map(point => ({year: point.year, value: r2(meanValue + slope * (point.year - meanYear))}));
  }
  let level = overlay.value || 0;
  if (overlay.kind === 'mean') level = data.reduce((sum, point) => sum + point.value, 0) / data.length;
  if (overlay.kind === 'median') {
    const values = data.map(point => point.value).sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    level = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  }
  return data.map(point => ({year: point.year, value: r2(level)}));
}
