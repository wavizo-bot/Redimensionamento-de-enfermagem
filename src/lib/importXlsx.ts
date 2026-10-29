import ExcelJS from 'exceljs';
import type { Absences, CategoryKey, Role } from '../types';
import { DEFAULT_DIRECT_TIMES, DEFAULT_INDIRECT, INDIRECT_ITEMS, PROCEDURES, defaultAbsences, emptyRecord } from './defaults';
import { n } from './calc';
import { mapProcedureToGroup } from './procedureMap';
import { normalizeWorkbook } from './xlsxNormalize';

export interface ImportedCategory {
  production: Record<string, number>;
  directTimes: Record<string, number>;
  indirect: Record<string, number>;
  absences: Absences | null;
  staffCount: number | null;
  names: string[];
}

export interface MonthlyTotal {
  label: string;
  iso: string;
  total: number;
}

export interface ProcedureTotals {
  enf: number;
  tec: number;
  other: number;
  total: number;
}

export type ReportFormat = 'aggregate' | 'expanded' | 'professional' | 'establishment';

export interface SuggestedMember {
  name: string;
  role: Role;
}

/**
 * Uma janela de análise do relatório de procedimentos. A produção de cada
 * grupo já vem pronta para uso; `annualized` indica que os valores foram
 * ajustados para representar 12 meses.
 */
export interface ImportWindow {
  key: 'school' | 'last12' | 'all';
  label: string;
  rangeLabel: string;
  months: number;
  annualized: boolean;
  startIso: string;
  endIso: string;
  /** Só é preenchido na janela do ano escolar (ex.: 2025/2026). */
  periodLabel: string;
  periodTag: string;
  periodStart: string;
  periodEnd: string;
  production: Record<CategoryKey, Record<string, number>>;
  groups: Record<CategoryKey | 'total', Record<string, number>>;
  totals: ProcedureTotals;
  unmapped: { enf: number; tec: number; total: number };
  unmappedProcedures: { name: string; enf: number; tec: number; total: number }[];
  team: Record<CategoryKey, SuggestedMember[]>;
}

export interface PartialImport {
  format: Exclude<ReportFormat, 'aggregate'>;
  formatLabel: string;
  /** Falso para o relatório por estabelecimento, que mistura as profissões. */
  usable: boolean;
  defaultWindow: ImportWindow['key'];
  windows: ImportWindow[];
}

export interface ImportPreview {
  fileName: string;
  kind: 'dimensionamento' | 'procedimentos' | 'desconhecido';
  unitName: string;
  periodLabel: string;
  periodTag: string;
  startDate: string;
  endDate: string;
  enf: ImportedCategory | null;
  tec: ImportedCategory | null;
  totalProcedures: number | null;
  coverageLabel?: string;
  coverageMonths?: number;
  monthlyTotals?: MonthlyTotal[];
  detail?: ReportFormat;
  categoryTotals?: ProcedureTotals;
  last12Totals?: ProcedureTotals & { months: number };
  staffNames?: { enf: number; tec: number };
  partial?: PartialImport | null;
  warnings: string[];
}

function cellValue(ws: ExcelJS.Worksheet, row: number, col: number): unknown {
  const v = ws.getCell(row, col).value as unknown;
  if (v && typeof v === 'object') {
    const obj = v as { result?: unknown; text?: string; richText?: { text: string }[] };
    if (obj.result !== undefined) return obj.result;
    if (typeof obj.text === 'string') return obj.text;
    if (Array.isArray(obj.richText)) return obj.richText.map((r) => r.text).join('');
  }
  return v;
}

function text(ws: ExcelJS.Worksheet, row: number, col: number): string {
  const v = cellValue(ws, row, col);
  return v === null || v === undefined ? '' : String(v).trim();
}

function num(ws: ExcelJS.Worksheet, row: number, col: number): number | null {
  const v = cellValue(ws, row, col);
  if (v === null || v === undefined || v === '' || v === '---') return null;
  const x = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : null;
}

const isVisible = (ws: ExcelJS.Worksheet) => (ws as unknown as { state?: string }).state !== 'hidden' && (ws as unknown as { state?: string }).state !== 'veryHidden';

function pickSheet(wb: ExcelJS.Workbook, test: (name: string) => boolean, tag: string): ExcelJS.Worksheet | null {
  const candidates = wb.worksheets.filter((ws) => test(ws.name));
  if (candidates.length === 0) return null;
  const visible = candidates.filter(isVisible);
  const pool = visible.length ? visible : candidates;
  return pool.find((ws) => ws.name.includes(tag)) ?? pool[pool.length - 1];
}

/**
 * Produção anual: na planilha de produção os totais ficam em M2:M11.
 * Na aba de dimensionamento ficam em C21:C30 (mais confiável, pois é o valor já usado no cálculo oficial).
 */
function readProduction(ws: ExcelJS.Worksheet | null, fallback: ExcelJS.Worksheet | null): Record<string, number> {
  const out = emptyRecord(PROCEDURES.map((p) => p.key));
  PROCEDURES.forEach((p, i) => {
    const fromDim = ws ? num(ws, i + 21, 3) : null;
    const fromProd = fallback ? num(fallback, i + 2, 13) : null;
    out[p.key] = n(fromDim ?? fromProd);
  });
  return out;
}

/** Tempo médio das intervenções: D21:D30 na aba DIMENSIONAMENTO. */
function readDirectTimes(ws: ExcelJS.Worksheet | null, key: CategoryKey): Record<string, number> {
  const out = { ...DEFAULT_DIRECT_TIMES[key] };
  if (!ws) return out;
  PROCEDURES.forEach((p, i) => {
    const v = num(ws, i + 21, 4);
    if (v !== null) out[p.key] = v;
  });
  return out;
}

/** Percentuais de cuidados indiretos: C35:C48 na aba DIMENSIONAMENTO. */
function readIndirect(ws: ExcelJS.Worksheet | null, key: CategoryKey): Record<string, number> {
  const out = { ...DEFAULT_INDIRECT[key] };
  if (!ws) return out;
  INDIRECT_ITEMS.forEach((item, i) => {
    const v = num(ws, i + 35, 3);
    if (v !== null) out[item.key] = v;
  });
  return out;
}

function readAbsences(ws: ExcelJS.Worksheet | null): Absences | null {
  if (!ws) return null;
  const health = num(ws, 4, 36) ?? num(ws, 3, 36);
  const other = num(ws, 6, 36);
  const vacation = num(ws, 8, 36);
  const holidays = num(ws, 10, 36) ?? num(ws, 9, 36);
  if (health === null && other === null && vacation === null && holidays === null) return null;
  return {
    ...defaultAbsences(),
    useHolidayCalendar: false,
    holidays: n(holidays),
    vacation: n(vacation),
    healthLeave: n(health),
    otherLeave: n(other),
    mode: 'average',
  };
}

function readNames(ws: ExcelJS.Worksheet | null, limit: number): string[] {
  if (!ws) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  const blocked = /ATEND|TOTAL|M[EÊ]S|DIMENSION|PROCED|ITEM|CATEGORIA|AUS[EÊ]NCIA|SEMANA|DIAS|JORNADA|SERVI[ÇC]O|UNIDADE|INDIVIDUAL|EXTRATO/i;
  for (let r = 2; r <= Math.min(ws.rowCount, 4000); r += 1) {
    const a = text(ws, r, 1);
    if (!a || a === '---' || a.length < 3 || a.length > 70) continue;
    if (blocked.test(a)) continue;
    if (/^\d+([./-]\d+)*$/.test(a)) continue;
    if (!/[A-Za-zÀ-ÿ]/.test(a)) continue;
    const key = normalize(a);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(a);
  }
  return limit > 0 ? names.slice(0, limit) : names;
}

function findTagAndPeriod(fileName: string, wb: ExcelJS.Workbook): { tag: string; label: string } {
  const fromFile = fileName.match(/(20\d{2})\D{0,3}(20\d{2})/);
  if (fromFile) return { tag: `${fromFile[1]}${fromFile[2]}`, label: `${fromFile[1]}/${fromFile[2]}` };
  for (const ws of wb.worksheets) {
    const v = text(ws, 1, 1);
    const m = v.match(/(20\d{2})\s*\/\s*(20\d{2})/);
    if (m) return { tag: `${m[1]}${m[2]}`, label: `${m[1]}/${m[2]}` };
  }
  const year = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  return { tag: `${year}${year + 1}`, label: `${year}/${year + 1}` };
}

function periodDates(tag: string): { startDate: string; endDate: string } {
  const m = tag.match(/(20\d{2})(20\d{2})/);
  if (m) return { startDate: `${m[1]}-08-01`, endDate: `${m[2]}-07-31` };
  const now = new Date();
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return { startDate: `${year}-08-01`, endDate: `${year + 1}-07-31` };
}

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Data serial do Excel (sistema 1900), sempre em UTC para não deslocar o mês.
    return new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
  }
  if (typeof value === 'string') {
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }
  return null;
}

function monthLabel(date: Date): string {
  return `${MONTH_ABBR[date.getUTCMonth()]}/${date.getUTCFullYear()}`;
}

const normalizeKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

function classifyOccupation(value: string): 'enf' | 'tec' | 'other' {
  const s = normalizeKey(value);
  if (s.includes('ENFERMEIR')) return 'enf';
  if (s.includes('ENFERMAGEM') && (s.includes('TECNIC') || s.includes('TEC.') || s.includes('AUXILIAR'))) {
    return 'tec';
  }
  return 'other';
}

function coverageRange(months: MonthlyTotal[]): string {
  if (!months.length) return '';
  return months.length === 1 ? months[0].label : `${months[0].label} a ${months[months.length - 1].label}`;
}

type ReportColumn = { col: number; iso: string; date: Date };

interface ReportRow {
  kind: 'enf' | 'tec' | 'other';
  name: string;
  role: Role;
  procedure: string;
  values: Map<number, number>;
}

const REPORT_FORMAT_LABEL: Record<Exclude<ReportFormat, 'aggregate'>, string> = {
  expanded: 'Detalhamento expandido (unidade, ocupação, profissional e procedimento)',
  professional: 'Quantidade por profissional e procedimento',
  establishment: 'Quantidade por estabelecimento e procedimento',
};

function reportMonthColumns(ws: ExcelJS.Worksheet): ReportColumn[] {
  const columns: ReportColumn[] = [];
  for (let col = 1; col <= ws.columnCount; col += 1) {
    const value = cellValue(ws, 1, col);
    let date = asDate(value);
    if (!date && typeof value === 'string') {
      const alt = value.match(/^(\d{2})\s*-\s*(\d{4})$/);
      if (alt) date = new Date(Date.UTC(Number(alt[2]), Number(alt[1]) - 1, 1));
    }
    if (date) columns.push({ col, iso: date.toISOString().slice(0, 7), date });
  }
  return columns;
}

function detectReportFormat(ws: ExcelJS.Worksheet): ReportFormat {
  const headers = [1, 2, 3, 4, 5, 6].map((col) => normalizeKey(text(ws, 2, col)));
  if (headers.includes('OCUPACAO') && headers.includes('PROFISSIONAIS')) return 'expanded';
  if (
    headers.some(
      (h) => h.includes('PROFISSIONAL / PROCEDIMENTO') || h.includes('ESPECIALIDADE_NOME'),
    )
  ) {
    return 'professional';
  }
  if (headers.some((h) => h.startsWith('ESTABELECIMENTO / PROCEDIMENTO'))) return 'establishment';
  return 'aggregate';
}

function localMonthIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Deixa de fora o mês corrente, que normalmente ainda está incompleto no export. */
function completeColumns(columns: ReportColumn[]): ReportColumn[] {
  const current = localMonthIso();
  const complete = columns.filter((c) => c.iso < current);
  return complete.length ? complete : columns;
}

function monthFromIso(iso: string): string {
  const [year, month] = iso.split('-').map(Number);
  return `${MONTH_ABBR[(month || 1) - 1]}/${year}`;
}

/** Localiza o último ano escolar (agosto a julho) completo no relatório. */
function findSchoolWindow(columns: ReportColumn[]): { startYear: number; cols: ReportColumn[] } | null {
  const years = [...new Set(columns.map((c) => Number(c.iso.slice(0, 4))))].sort((a, b) => b - a);
  for (const year of years) {
    const first: ReportColumn[] = [];
    for (let month = 8; month <= 12; month += 1) {
      const found = columns.find((c) => c.iso === `${year}-${String(month).padStart(2, '0')}`);
      if (!found) break;
      first.push(found);
    }
    if (first.length !== 5) continue;
    const second: ReportColumn[] = [];
    for (let month = 1; month <= 7; month += 1) {
      const found = columns.find(
        (c) => c.iso === `${year + 1}-${String(month).padStart(2, '0')}`,
      );
      if (!found) break;
      second.push(found);
    }
    if (second.length === 7) return { startYear: year, cols: [...first, ...second] };
  }
  return null;
}

function roleFromOccupation(value: string, kind: 'enf' | 'tec' | 'other'): Role {
  if (kind === 'enf') return 'Enfermeiro';
  if (kind === 'tec' && /AUXILIAR/.test(normalizeKey(value))) return 'Auxiliar de Enfermagem';
  return 'Técnico de Enfermagem';
}

function readReportRows(
  ws: ExcelJS.Worksheet,
  format: ReportFormat,
  columns: ReportColumn[],
): { rows: ReportRow[]; unitName: string } {
  const rows: ReportRow[] = [];
  let unitName = '';
  const startRow = format === 'establishment' ? 4 : 3;

  for (let row = startRow; row <= ws.rowCount; row += 1) {
    const establishment = text(ws, row, 1);
    if (/^filtros aplicados/i.test(establishment)) continue;

    let procedure = '';
    let name = '';
    let kind: 'enf' | 'tec' | 'other' = 'other';
    let role: Role = 'Técnico de Enfermagem';

    if (format === 'expanded') {
      procedure = text(ws, row, 4);
      const occupation = text(ws, row, 2);
      kind = classifyOccupation(occupation);
      role = roleFromOccupation(occupation, kind);
      name = text(ws, row, 3);
    } else if (format === 'professional') {
      procedure = text(ws, row, 3);
      const specialty = text(ws, row, 2);
      kind = classifyOccupation(specialty);
      role = roleFromOccupation(specialty, kind);
      name = text(ws, row, 1);
      if (!name || /^total$/i.test(name) || !specialty || /^total$/i.test(specialty)) continue;
    } else {
      procedure = text(ws, row, 2);
    }

    if (!procedure || /^total$/i.test(procedure)) continue;
    if (format !== 'professional' && establishment && !/^total$/i.test(establishment)) {
      if (!unitName) unitName = establishment;
    }

    const values = new Map<number, number>();
    let hasValue = false;
    for (const column of columns) {
      const value = num(ws, row, column.col) ?? 0;
      if (value) hasValue = true;
      values.set(column.col, value);
    }
    if (!hasValue) continue;
    rows.push({ kind, name, role, procedure, values });
  }

  return { rows, unitName };
}

function emptyGroups(): Record<string, number> {
  return emptyRecord(PROCEDURES.map((p) => p.key));
}

function buildWindow(
  key: ImportWindow['key'],
  cols: ReportColumn[],
  scale: number,
  rows: ReportRow[],
  mixed: boolean,
  meta: {
    label: string;
    rangeLabel: string;
    periodLabel?: string;
    periodTag?: string;
    periodStart?: string;
    periodEnd?: string;
  },
): ImportWindow {
  const groups: ImportWindow['groups'] = {
    enf: emptyGroups(),
    tec: emptyGroups(),
    total: emptyGroups(),
  };
  const totals: ProcedureTotals = { enf: 0, tec: 0, other: 0, total: 0 };
  const unmapped = { enf: 0, tec: 0, total: 0 };
  const unmappedMap = new Map<
    string,
    { name: string; enf: number; tec: number; total: number }
  >();
  const teamMaps: Record<CategoryKey, Map<string, SuggestedMember>> = {
    enf: new Map(),
    tec: new Map(),
  };

  for (const row of rows) {
    let rowTotal = 0;
    for (const column of cols) rowTotal += row.values.get(column.col) ?? 0;
    if (!rowTotal) continue;

    totals[row.kind] += rowTotal;
    const group = mapProcedureToGroup(row.procedure);

    if (group) {
      if (row.kind === 'other') {
        if (mixed) groups.total[group] += rowTotal;
      } else {
        groups[row.kind][group] += rowTotal;
        groups.total[group] += rowTotal;
      }
    } else if (row.kind !== 'other' || mixed) {
      const item = unmappedMap.get(row.procedure) ?? {
        name: row.procedure,
        enf: 0,
        tec: 0,
        total: 0,
      };
      item.total += rowTotal;
      unmapped.total += rowTotal;
      if (row.kind !== 'other') {
        item[row.kind] += rowTotal;
        unmapped[row.kind] += rowTotal;
      }
      unmappedMap.set(row.procedure, item);
    }

    if (row.kind !== 'other' && row.name) {
      const keyName = normalizeKey(row.name);
      if (!teamMaps[row.kind].has(keyName)) {
        teamMaps[row.kind].set(keyName, { name: row.name, role: row.role });
      }
    }
  }

  const applyScale = (value: number) => (scale === 1 ? value : Math.round(value * scale));

  for (const kind of ['enf', 'tec', 'total'] as const) {
    for (const groupKey of Object.keys(groups[kind])) {
      groups[kind][groupKey] = applyScale(groups[kind][groupKey]);
    }
  }

  const unmappedProcedures = [...unmappedMap.values()]
    .map((item) => ({
      ...item,
      enf: applyScale(item.enf),
      tec: applyScale(item.tec),
      total: applyScale(item.total),
    }))
    .sort((a, b) => b.total - a.total);

  // Soma os valores já arredondados para que a tabela, o total e as
  // porcentagens de mapeamento fechem exatamente na tela.
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const sumGroups = (kind: 'enf' | 'tec' | 'total') => sum(Object.values(groups[kind]));

  unmapped.enf = sum(unmappedProcedures.map((item) => item.enf));
  unmapped.tec = sum(unmappedProcedures.map((item) => item.tec));
  unmapped.total = sum(unmappedProcedures.map((item) => item.total));

  if (mixed) {
    totals.enf = 0;
    totals.tec = 0;
    totals.other = sumGroups('total') + unmapped.total;
    totals.total = totals.other;
  } else {
    totals.enf = sumGroups('enf') + unmapped.enf;
    totals.tec = sumGroups('tec') + unmapped.tec;
    totals.other = applyScale(totals.other);
    totals.total = totals.enf + totals.tec + totals.other;
  }

  const team: ImportWindow['team'] = {
    enf: [...teamMaps.enf.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    tec: [...teamMaps.tec.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  };

  return {
    key,
    label: meta.label,
    rangeLabel: meta.rangeLabel,
    months: cols.length,
    annualized: scale !== 1,
    startIso: cols[0]?.iso ?? '',
    endIso: cols[cols.length - 1]?.iso ?? '',
    periodLabel: meta.periodLabel ?? '',
    periodTag: meta.periodTag ?? '',
    periodStart: meta.periodStart ?? '',
    periodEnd: meta.periodEnd ?? '',
    production: { enf: groups.enf, tec: groups.tec },
    groups,
    totals,
    unmapped,
    unmappedProcedures,
    team,
  };
}

function buildPartial(
  format: Exclude<ReportFormat, 'aggregate'>,
  rows: ReportRow[],
  columns: ReportColumn[],
): PartialImport {
  const complete = completeColumns(columns);
  const mixed = format === 'establishment';
  const options: ImportWindow[] = [];
  const school = findSchoolWindow(columns);

  if (school) {
    const label = `${school.startYear}/${school.startYear + 1} (ago–jul)`;
    options.push(
      buildWindow('school', school.cols, 1, rows, mixed, {
        label,
        rangeLabel: `${monthFromIso(school.cols[0].iso)} a ${monthFromIso(school.cols[11].iso)} · 12 meses`,
        periodLabel: `${school.startYear}/${school.startYear + 1}`,
        periodTag: `${school.startYear}${school.startYear + 1}`,
        periodStart: `${school.startYear}-08-01`,
        periodEnd: `${school.startYear + 1}-07-31`,
      }),
    );
  }

  const last12 = complete.slice(-12);
  if (last12.length) {
    const scale = last12.length < 12 ? 12 / last12.length : 1;
    options.push(
      buildWindow('last12', last12, scale, rows, mixed, {
        label:
          last12.length === 12 ? 'Últimos 12 meses' : `Últimos ${last12.length} meses`,
        rangeLabel: `${monthFromIso(last12[0].iso)} a ${monthFromIso(last12[last12.length - 1].iso)} · ${last12.length} ${last12.length === 1 ? 'mês' : 'meses'}${scale !== 1 ? ' · média anual' : ''}`,
      }),
    );
  }

  const all = complete;
  if (all.length) {
    const scale = all.length !== 12 ? 12 / all.length : 1;
    options.push(
      buildWindow('all', all, scale, rows, mixed, {
        label: scale === 1 ? 'Todo o período' : 'Todo o período (anualizado)',
        rangeLabel: `${monthFromIso(all[0].iso)} a ${monthFromIso(all[all.length - 1].iso)} · ${all.length} meses${scale !== 1 ? ' · média anual' : ''}`,
      }),
    );
  }

  const windows: ImportWindow[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    const key = `${option.startIso}|${option.endIso}|${option.months}|${option.annualized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    windows.push(option);
  }

  const defaultWindow =
    windows.find((w) => w.key === 'school')?.key ??
    windows.find((w) => w.key === 'last12')?.key ??
    windows[0]?.key ??
    'last12';

  return {
    format,
    formatLabel: REPORT_FORMAT_LABEL[format],
    usable: format === 'expanded' || format === 'professional',
    defaultWindow,
    windows,
  };
}

/**
 * Relatórios "Detalhamento de procedimentos" em quatro formatos:
 * - agregado: uma coluna por mês e o total geral na linha 3;
 * - expandido: uma linha por ocupação/profissional/procedimento;
 * - por profissional: profissional, especialidade e procedimento;
 * - por estabelecimento: só estabelecimento e procedimento (mistura profissões).
 *
 * Nos três formatos detalhados a produção é agrupada nos dez grupos do
 * dimensionamento e dividida entre enfermeiros e técnicos quando o relatório
 * permite. O que não for reconhecido fica listado para conferência.
 */
function readExportReport(ws: ExcelJS.Worksheet) {
  const columns = reportMonthColumns(ws);
  const format = detectReportFormat(ws);

  if (format === 'aggregate') {
    const months: MonthlyTotal[] = columns.map(({ col, iso }) => ({
      label: monthFromIso(iso),
      iso: `${iso}-01`,
      total: num(ws, 3, col) ?? 0,
    }));
    return {
      format,
      unitName: text(ws, 3, 1),
      months,
      total: months.reduce((sum, m) => sum + m.total, 0),
      coverageLabel: coverageRange(months),
      coverageMonths: months.length,
      startDate: months[0]?.iso ?? '',
      endDate: months[months.length - 1]?.iso ?? '',
      categoryTotals: undefined,
      last12Totals: undefined,
      staffNames: undefined,
      partial: null,
      warnings: [] as string[],
    };
  }

  const { rows, unitName } = readReportRows(ws, format, columns);

  const monthly = new Map<number, number>();
  const totals: ProcedureTotals = { enf: 0, tec: 0, other: 0, total: 0 };
  const names = { enf: new Set<string>(), tec: new Set<string>() };

  for (const row of rows) {
    let rowTotal = 0;
    for (const column of columns) {
      const value = row.values.get(column.col) ?? 0;
      rowTotal += value;
      monthly.set(column.col, (monthly.get(column.col) ?? 0) + value);
    }
    totals[row.kind] += rowTotal;
    totals.total += rowTotal;
    if (row.name && row.kind !== 'other') names[row.kind].add(normalizeKey(row.name));
  }

  const months: MonthlyTotal[] = columns.map(({ col, iso }) => ({
    label: monthFromIso(iso),
    iso: `${iso}-01`,
    total: monthly.get(col) ?? 0,
  }));

  const last12Cols = completeColumns(columns).slice(-12);
  const last12: ProcedureTotals & { months: number } = {
    enf: 0,
    tec: 0,
    other: 0,
    total: 0,
    months: last12Cols.length,
  };
  for (const row of rows) {
    let rowTotal = 0;
    for (const column of last12Cols) rowTotal += row.values.get(column.col) ?? 0;
    if (!rowTotal) continue;
    last12[row.kind] += rowTotal;
    last12.total += rowTotal;
  }

  const partial = buildPartial(format, rows, columns);
  const warnings: string[] = [];

  if (!columns.length) {
    warnings.push('Não encontrei as datas dos meses na primeira linha do relatório.');
  }

  const current = localMonthIso();
  const currentColumn = columns.find((c) => c.iso === current);
  if (currentColumn && (monthly.get(currentColumn.col) ?? 0) > 0) {
    warnings.push(
      `O mês atual (${monthFromIso(current)}) ficou fora das janelas de 12 meses e do período completo porque ainda pode estar incompleto.`,
    );
  }

  if (format === 'establishment') {
    warnings.push(
      'Este relatório não separa enfermeiros e técnicos; use os números apenas para conferência.',
    );
  } else if (
    partial.windows.some(
      (w) => (w.production.enf.imunizacoes ?? 0) === 0 && (w.production.tec.imunizacoes ?? 0) === 0,
    )
  ) {
    warnings.push(
      'O relatório não traz vacinas/imunizações. O grupo Imunizações deve ser preenchido manualmente.',
    );
  }

  return {
    format,
    unitName,
    months,
    total: totals.total,
    coverageLabel: coverageRange(months),
    coverageMonths: months.length,
    startDate: months[0]?.iso ?? '',
    endDate: months[months.length - 1]?.iso ?? '',
    categoryTotals: totals,
    last12Totals: last12,
    staffNames: { enf: names.enf.size, tec: names.tec.size },
    partial,
    warnings,
  };
}

function looksLikeExportReport(ws: ExcelJS.Worksheet): boolean {
  for (let row = 1; row <= 4; row += 1) {
    for (let col = 1; col <= 6; col += 1) {
      if (
        /total\s+procedimentos|m[eê]s\s*\/\s*ano|mes_ano_competencia|profissional\s*\/\s*procedimento|estabelecimento\s*\/\s*procedimento/i.test(
          text(ws, row, col),
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

export async function readSpreadsheet(file: File): Promise<ImportPreview> {
  const wb = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  const normalized = await normalizeWorkbook(buffer);
  await wb.xlsx.load(normalized);
  const { tag, label } = findTagAndPeriod(file.name, wb);
  const warnings: string[] = [];

  const enfSheet = pickSheet(wb, (name) => /^ENFERMEIROS\b/i.test(name) && !/DIMENSIONAMENTO/i.test(name), tag);
  const tecSheet = pickSheet(wb, (name) => /^AUXILIARESTECNICOS/i.test(name) && !/DIMENSIONAMENTO/i.test(name), tag);
  const enfAbsSheet = pickSheet(wb, (name) => /^AUS/i.test(name) && /ENFERMEIROS/i.test(name), tag);
  const tecAbsSheet = pickSheet(wb, (name) => /^AUS/i.test(name) && /(AUX|T\.?E)/i.test(name), tag);
  const enfDim = pickSheet(wb, (name) => /^DIMENSIONAMENTO\s*-?\s*ENF/i.test(name), tag);
  const tecDim = pickSheet(wb, (name) => /^DIMENSIONAMENTO/i.test(name) && /T\.?\s*$/i.test(name), tag);

  if (!enfSheet && !tecSheet) {
    const exportSheet =
      wb.worksheets.find((ws) => looksLikeExportReport(ws)) ??
      wb.worksheets.find((ws) => /export/i.test(ws.name));
    if (exportSheet && looksLikeExportReport(exportSheet)) {
      const report = readExportReport(exportSheet);
      return {
        fileName: file.name,
        kind: 'procedimentos',
        unitName: report.unitName,
        periodLabel: report.coverageLabel || label,
        periodTag: tag,
        startDate: report.startDate || periodDates(tag).startDate,
        endDate: report.endDate || periodDates(tag).endDate,
        enf: null,
        tec: null,
        totalProcedures: report.months.length ? report.total : null,
        coverageLabel: report.coverageLabel,
        coverageMonths: report.coverageMonths,
        monthlyTotals: report.months,
        detail: report.format,
        categoryTotals: report.categoryTotals,
        last12Totals: report.last12Totals,
        staffNames: report.staffNames,
        partial: report.partial,
        warnings: report.warnings,
      };
    }
    return {
      fileName: file.name,
      kind: 'desconhecido',
      unitName: '',
      periodLabel: label,
      periodTag: tag,
      ...periodDates(tag),
      enf: null,
      tec: null,
      totalProcedures: null,
      warnings: ['Não encontrei as abas de enfermeiros/técnicos nesta planilha.'],
    };
  }

  if (!enfSheet) warnings.push('Aba de produção dos enfermeiros não encontrada.');
  if (!tecSheet) warnings.push('Aba de produção dos técnicos/auxiliares não encontrada.');

  const staffEnf = enfDim ? num(enfDim, 9, 7) : null;
  const staffTec = tecDim ? num(tecDim, 9, 7) : null;
  const namesEnf = readNames(enfSheet, staffEnf ? Math.ceil(staffEnf) : 0);
  const namesTec = readNames(tecSheet, staffTec ? Math.ceil(staffTec) : 0);

  const enf: ImportedCategory | null = enfSheet || enfDim
    ? {
        production: readProduction(enfDim, enfSheet),
        directTimes: readDirectTimes(enfDim, 'enf'),
        indirect: readIndirect(enfDim, 'enf'),
        absences: readAbsences(enfAbsSheet),
        staffCount: staffEnf,
        names: namesEnf,
      }
    : null;
  const tec: ImportedCategory | null = tecSheet || tecDim
    ? {
        production: readProduction(tecDim, tecSheet),
        directTimes: readDirectTimes(tecDim, 'tec'),
        indirect: readIndirect(tecDim, 'tec'),
        absences: readAbsences(tecAbsSheet),
        staffCount: staffTec,
        names: namesTec,
      }
    : null;

  if (enf && Object.values(enf.production).every((v) => !v)) warnings.push('Produção de enfermeiros veio zerada.');
  if (tec && Object.values(tec.production).every((v) => !v)) warnings.push('Produção de técnicos veio zerada.');
  if (enf && !enf.absences) warnings.push('Médias de ausências dos enfermeiros não encontradas; usei os valores padrão.');
  if (tec && !tec.absences) warnings.push('Médias de ausências dos técnicos não encontradas; usei os valores padrão.');

  const unitName = (enfDim ? text(enfDim, 5, 1) : '') || (tecDim ? text(tecDim, 5, 1) : '');

  return {
    fileName: file.name,
    kind: 'dimensionamento',
    unitName,
    periodLabel: label,
    periodTag: tag,
    ...periodDates(tag),
    enf,
    tec,
    totalProcedures: null,
    warnings,
  };
}

export function categoryLabel(key: CategoryKey): string {
  return key === 'enf' ? 'Enfermeiros' : 'Técnicos/auxiliares';
}
