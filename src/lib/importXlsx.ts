import ExcelJS from 'exceljs';
import type { Absences, CategoryKey } from '../types';
import { DEFAULT_DIRECT_TIMES, DEFAULT_INDIRECT, INDIRECT_ITEMS, PROCEDURES, defaultAbsences, emptyRecord } from './defaults';
import { n } from './calc';

export interface ImportedCategory {
  production: Record<string, number>;
  directTimes: Record<string, number>;
  indirect: Record<string, number>;
  absences: Absences | null;
  staffCount: number | null;
  names: string[];
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

export async function readSpreadsheet(file: File): Promise<ImportPreview> {
  const wb = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await wb.xlsx.load(buffer);
  const { tag, label } = findTagAndPeriod(file.name, wb);
  const warnings: string[] = [];

  const enfSheet = pickSheet(wb, (name) => /^ENFERMEIROS\b/i.test(name) && !/DIMENSIONAMENTO/i.test(name), tag);
  const tecSheet = pickSheet(wb, (name) => /^AUXILIARESTECNICOS/i.test(name) && !/DIMENSIONAMENTO/i.test(name), tag);
  const enfAbsSheet = pickSheet(wb, (name) => /^AUS/i.test(name) && /ENFERMEIROS/i.test(name), tag);
  const tecAbsSheet = pickSheet(wb, (name) => /^AUS/i.test(name) && /(AUX|T\.?E)/i.test(name), tag);
  const enfDim = pickSheet(wb, (name) => /^DIMENSIONAMENTO\s*-?\s*ENF/i.test(name), tag);
  const tecDim = pickSheet(wb, (name) => /^DIMENSIONAMENTO/i.test(name) && /T\.?\s*$/i.test(name), tag);

  if (!enfSheet && !tecSheet) {
    const exportSheet = wb.worksheets.find((ws) => /export/i.test(ws.name)) ?? wb.worksheets[0];
    if (exportSheet) {
      const total = num(exportSheet, 3, 2);
      let sum = 0;
      for (let c = 2; c <= 30; c += 1) {
        const v = num(exportSheet, 3, c);
        if (v !== null) sum += v;
      }
      return {
        fileName: file.name,
        kind: 'procedimentos',
        unitName: text(exportSheet, 3, 1),
        periodLabel: label,
        periodTag: tag,
        ...periodDates(tag),
        enf: null,
        tec: null,
        totalProcedures: total ?? sum,
        warnings: [
          'Esta planilha parece ser o "Detalhamento de procedimentos". Ela traz somente o total geral por mês, sem separar os 10 tipos de procedimento nem enfermeiros/técnicos.',
          'Use-a para conferir o volume total. Para o dimensionamento completo, importe a planilha de dimensionamento.',
        ],
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
