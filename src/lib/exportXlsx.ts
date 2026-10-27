import ExcelJS from 'exceljs';
import type { CategoryKey, CategoryResult, Project } from '../types';
import { CATEGORY_LABEL, INDIRECT_ITEMS, PROCEDURES } from './defaults';
import { calcCategory, calcProject, exportSheetNames, pressureLabel } from './calc';
import { saveBinaryFile } from './drive';

const TEAL = '0F6B5C';
const LIGHT = 'EAF3F0';
const LIGHT2 = 'F5F8F7';
const BORDER = 'B9CBC6';
const TEXT = '22312D';

const thin = {
  top: { style: 'thin' as const, color: { argb: BORDER } },
  left: { style: 'thin' as const, color: { argb: BORDER } },
  bottom: { style: 'thin' as const, color: { argb: BORDER } },
  right: { style: 'thin' as const, color: { argb: BORDER } },
};

type Cell = ExcelJS.Cell;
type Sheet = ExcelJS.Worksheet;

const f = (formula: string, result: number | string) => ({ formula, result });

function styleRange(ws: Sheet, range: string, style: Partial<ExcelJS.Style>) {
  const [start, end] = range.split(':');
  const from = ws.getCell(start);
  const to = ws.getCell(end ?? start);
  for (let r = from.row; r <= to.row; r += 1) {
    for (let c = from.col; c <= to.col; c += 1) {
      ws.getCell(r, c).style = { ...ws.getCell(r, c).style, ...style };
    }
  }
}

function mergeText(ws: Sheet, range: string, value: ExcelJS.CellValue, style: Partial<ExcelJS.Style> = {}) {
  ws.mergeCells(range);
  const cell = ws.getCell(range.split(':')[0]);
  cell.value = value;
  cell.style = { ...cell.style, ...style };
  return cell;
}

function section(ws: Sheet, row: number, text: string, cols = 9) {
  mergeText(ws, `${col(1)}${row}:${col(cols)}${row}`, text, {
    font: { bold: true, size: 10, color: { argb: 'FFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } },
    alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  });
  ws.getRow(row).height = 22;
}

function col(index: number): string {
  let n = index;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function tableHeader(ws: Sheet, row: number, values: { text: string; from: number; to?: number }[]) {
  values.forEach((item) => {
    const to = item.to ?? item.from;
    const range = `${col(item.from)}${row}:${col(to)}${row}`;
    if (to > item.from) ws.mergeCells(range);
    const cell = ws.getCell(row, item.from);
    cell.value = item.text;
    cell.font = { bold: true, size: 9, color: { argb: TEXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    for (let c = item.from; c <= to; c += 1) ws.getCell(row, c).border = thin;
  });
  ws.getRow(row).height = 34;
}

function boxed(cell: Cell, alignment: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }) {
  cell.border = thin;
  cell.alignment = { ...cell.alignment, ...alignment };
}

function buildCategorySheet(wb: ExcelJS.Workbook, name: string, project: Project, key: CategoryKey): void {
  const ws = wb.addWorksheet(name, {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    views: [{ state: 'frozen', ySplit: 7 }],
  });

  const res = calcCategory(project, key);
  const cfg = project.categories[key];

  ws.columns = [
    { width: 34 },
    { width: 34 },
    { width: 18 },
    { width: 20 },
    { width: 16 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
  ];

  mergeText(
    ws,
    'A1:I1',
    'DIMENSIONAMENTO DE PESSOAL DE ENFERMAGEM — ATENÇÃO BÁSICA DE SAÚDE',
    { font: { bold: true, size: 14, color: { argb: TEAL } }, alignment: { horizontal: 'center', vertical: 'middle' } },
  );
  ws.getRow(1).height = 28;

  mergeText(ws, 'A2:I2', CATEGORY_LABEL[key].toUpperCase(), {
    font: { bold: true, size: 12, color: { argb: TEXT } },
    alignment: { horizontal: 'center' },
  });

  mergeText(
    ws,
    'A3:I3',
    `MÉTODO WISN/WPSN — PARECER NORMATIVO Nº 1/2024/COFEN · PERÍODO ${project.periodLabel}`,
    { font: { italic: true, size: 9, color: { argb: '55645F' } }, alignment: { horizontal: 'center' } },
  );

  mergeText(ws, 'A5:I5', [project.unitName || 'Unidade não informada', project.city].filter(Boolean).join(' — '), {
    font: { bold: true, size: 11, color: { argb: TEXT } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT2 } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  });
  ws.getRow(5).height = 22;

  // ---------- TTD ----------
  tableHeader(ws, 7, [
    { text: 'ITEM', from: 1 },
    { text: 'TEMPO DE TRABALHO DISPONÍVEL (TTD)', from: 2 },
    { text: 'VALOR INFORMADO', from: 3 },
    { text: 'DIAS CONSIDERADOS', from: 4 },
    { text: '', from: 5, to: 6 },
    { text: 'QUANTIDADE DE PROFISSIONAIS', from: 7, to: 9 },
  ]);

  const ttdRows: [number, string, number, number | { formula: string; result: number | string }][] = [
    [8, 'SEMANAS POR ANO', project.settings.weeksPerYear, f('C8*C9', project.settings.weeksPerYear * project.settings.daysPerWeek)],
    [9, 'DIAS TRABALHADOS NA SEMANA', project.settings.daysPerWeek, res.absences.holidays],
    [10, 'DIAS DE AUSÊNCIA POR FERIADOS', res.absences.holidays, res.absences.holidays],
    [11, 'DIAS DE FÉRIAS (MÉDIA POR PROFISSIONAL)', res.absences.vacation, res.absences.vacation],
    [12, 'DIAS DE LICENÇA DE SAÚDE (MÉDIA POR PROFISSIONAL)', res.absences.healthLeave, res.absences.healthLeave],
    [13, 'DIAS DE OUTRAS LICENÇAS (MÉDIA POR PROFISSIONAL)', res.absences.otherLeave, res.absences.otherLeave],
  ];

  ttdRows.forEach(([row, label, value, days], i) => {
    ws.getCell(row, 1).value = i + 1;
    ws.getCell(row, 2).value = label;
    ws.getCell(row, 3).value = value;
    ws.getCell(row, 3).numFmt = i >= 2 ? '0.00' : '0';
    if (typeof days === 'number') {
      ws.getCell(row, 4).value = row === 9 ? f('C10', res.absences.holidays) : days;
    } else {
      ws.getCell(row, 4).value = days;
    }
    ws.getCell(row, 4).numFmt = '0.00';
    for (let c = 1; c <= 6; c += 1) ws.getCell(row, c).border = thin;
    ws.getCell(row, 2).alignment = { wrapText: true, vertical: 'middle' };
    ws.getCell(row, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(row, 3).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(row, 4).alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Ocultar o E/F vazio faz a tabela parecer maior do que é; melhor manter sem borda extra.
  [5, 6].forEach((c) => {
    for (let r = 8; r <= 13; r += 1) ws.getCell(r, c).border = {};
  });

  ws.getCell('D9').value = f('C10', res.absences.holidays);
  ws.getCell('D10').value = f('C11', res.absences.vacation);
  ws.getCell('D11').value = f('C12', res.absences.healthLeave);
  ws.getCell('D12').value = f('C13', res.absences.otherLeave);
  ws.getCell('D8').value = f('C8*C9', project.settings.weeksPerYear * project.settings.daysPerWeek);
  [8, 9, 10, 11, 12].forEach((r) => {
    ws.getCell(r, 4).numFmt = '0.00';
  });

  // Jornada
  ws.getCell('A15').value = 7;
  ws.getCell('B15').value = 'JORNADA DE TRABALHO DIÁRIA (HORAS/PROFISSIONAL)';
  ws.getCell('C15').value = project.settings.hoursPerDay;
  for (let c = 1; c <= 4; c += 1) {
    ws.getCell(15, c).border = thin;
    ws.getCell(15, c).alignment = { vertical: 'middle', wrapText: true };
  }
  ws.getCell(15, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(15, 3).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell('A16').value = 'TTD';
  ws.getCell('B16').value = 'TEMPO DE TRABALHO DISPONÍVEL (HORAS/ANO/PROFISSIONAL)';
  ws.getCell('C16').value = f('(D8-D9-D10-D11-D12)*C15', res.ttdHours);
  ws.getCell('C16').numFmt = '#,##0.00';
  ws.getCell('C16').font = { bold: true, size: 11, color: { argb: TEXT } };
  ws.getCell('C16').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3D6' } };
  for (let c = 1; c <= 4; c += 1) {
    ws.getCell(16, c).border = thin;
    ws.getCell(16, c).alignment = { ...ws.getCell(16, c).alignment, vertical: 'middle' };
  }
  ws.getCell(16, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(16, 3).alignment = { horizontal: 'center', vertical: 'middle' };

  // Quantidade atual / WISN / saldo
  const qHead = (addr: string, text: string) => {
    const cell = ws.getCell(addr);
    cell.value = text;
    cell.font = { bold: true, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    boxed(cell);
  };
  qHead('G8', 'ATUAL');
  qHead('H8', 'WISN');
  qHead('I8', 'SALDO');

  ws.getCell('G9').value = res.current;
  ws.getCell('H9').value = f('C54', res.required);
  ws.getCell('I9').value = f('G9-H9', res.balance);
  ['G9', 'H9', 'I9'].forEach((addr) => {
    const cell = ws.getCell(addr);
    cell.numFmt = addr === 'G9' ? '0' : '0.00';
    cell.font = { bold: true, size: 11 };
    boxed(cell);
  });
  ws.getCell('I9').numFmt = '+0.00;-0.00;0.00';
  ws.getCell('I9').font = { bold: true, size: 11, color: { argb: res.balance < 0 ? 'B42318' : '067647' } };

  // ---------- Cuidados diretos ----------
  section(ws, 18, 'DADOS DA PRODUÇÃO — INTERVENÇÕES DE CUIDADOS DIRETOS');

  tableHeader(ws, 20, [
    { text: 'INTERVENÇÃO', from: 1, to: 2 },
    { text: 'PRODUÇÃO ANUAL (P)', from: 3 },
    { text: 'TEMPO MÉDIO (T) EM HORAS', from: 4 },
    { text: 'TOTAL DE HORAS (P × T)', from: 5 },
    { text: 'QUANTIDADE REQUERIDA (P × T) / TTD', from: 6, to: 9 },
  ]);

  let directHours = 0;
  let directRequired = 0;
  PROCEDURES.forEach((proc, i) => {
    const row = 21 + i;
    const production = Math.max(0, Number(cfg.production[proc.key]) || 0);
    const time = Math.max(0, Number(cfg.directTimes[proc.key]) || 0);
    const hours = production * time;
    const required = res.ttdHours > 0 ? hours / res.ttdHours : 0;
    directHours += hours;
    directRequired += required;

    ws.mergeCells(row, 1, row, 2);
    ws.getCell(row, 1).value = proc.name;
    ws.getCell(row, 3).value = production;
    ws.getCell(row, 3).numFmt = '#,##0';
    ws.getCell(row, 4).value = time;
    ws.getCell(row, 4).numFmt = '0.00';
    ws.getCell(row, 5).value = f(`C${row}*D${row}`, hours);
    ws.getCell(row, 5).numFmt = '#,##0.00';
    ws.mergeCells(row, 6, row, 9);
    ws.getCell(row, 6).value = f(`IF($C$16>0,E${row}/$C$16,0)`, required);
    ws.getCell(row, 6).numFmt = '0.000';
    for (let c = 1; c <= 9; c += 1) ws.getCell(row, c).border = thin;
    ws.getCell(row, 1).alignment = { wrapText: true, vertical: 'middle' };
    ws.getCell(row, 3).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(row, 4).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(row, 5).alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getCell(row, 6).alignment = { horizontal: 'right', vertical: 'middle' };
  });

  ws.mergeCells('A31:D31');
  ws.getCell('A31').value = 'TOTAL';
  ws.getCell('A31').font = { bold: true };
  ws.getCell('E31').value = f('SUM(E21:E30)', directHours);
  ws.getCell('E31').numFmt = '#,##0.00';
  ws.mergeCells('F31:I31');
  ws.getCell('F31').value = f('SUM(F21:F30)', directRequired);
  ws.getCell('F31').numFmt = '0.000';
  for (let c = 1; c <= 9; c += 1) {
    const cell = ws.getCell(31, c);
    cell.border = thin;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    cell.font = { ...cell.font, bold: true };
    cell.alignment = { ...cell.alignment, vertical: 'middle' };
  }
  ws.getCell('E31').alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell('F31').alignment = { horizontal: 'right', vertical: 'middle' };

  // ---------- Cuidados indiretos ----------
  section(ws, 33, 'INTERVENÇÕES DE CUIDADOS INDIRETOS');

  tableHeader(ws, 34, [
    { text: 'ATIVIDADE', from: 1, to: 2 },
    { text: '% DE PARTICIPAÇÃO', from: 3 },
    { text: '', from: 4, to: 9 },
  ]);

  INDIRECT_ITEMS.forEach((item, i) => {
    const row = 35 + i;
    ws.mergeCells(row, 1, row, 2);
    ws.getCell(row, 1).value = item.name;
    ws.getCell(row, 3).value = Math.max(0, Number(cfg.indirect[item.key]) || 0);
    ws.getCell(row, 3).numFmt = '0.0"%"';
    for (let c = 1; c <= 3; c += 1) ws.getCell(row, c).border = thin;
    ws.getCell(row, 1).alignment = { wrapText: true, vertical: 'middle' };
    ws.getCell(row, 3).alignment = { horizontal: 'center', vertical: 'middle' };
  });

  ws.mergeCells('A49:B49');
  ws.getCell('A49').value = 'TOTAL DE CUIDADOS INDIRETOS';
  ws.getCell('A49').font = { bold: true };
  ws.getCell('C49').value = f('SUM(C35:C48)', res.indirectPct);
  ws.getCell('C49').numFmt = '0.0"%"';
  ws.getCell('C49').font = { bold: true };
  for (let c = 1; c <= 3; c += 1) {
    ws.getCell(49, c).border = thin;
    ws.getCell(49, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    ws.getCell(49, c).alignment = { vertical: 'middle' };
  }
  ws.getCell('C49').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('A50:B50');
  ws.getCell('A50').value = 'FATOR DE CUIDADOS DIRETOS (1 − % indiretos)';
  ws.getCell('A50').font = { bold: true };
  ws.getCell('C50').value = f('IF(C49<95,1-C49/100,0)', Math.max(0, 1 - res.indirectPct / 100));
  ws.getCell('C50').numFmt = '0.000';
  ws.getCell('C50').font = { bold: true, color: { argb: TEAL } };
  for (let c = 1; c <= 3; c += 1) {
    ws.getCell(50, c).border = thin;
    ws.getCell(50, c).alignment = { vertical: 'middle' };
  }
  ws.getCell('C50').alignment = { horizontal: 'center', vertical: 'middle' };

  // ---------- Resultado ----------
  section(ws, 52, 'RESULTADO');

  const summary: [number, string, ExcelJS.CellValue, string?][] = [
    [53, 'QUANTIDADE ATUAL DE PROFISSIONAIS', res.current, '0'],
    [54, 'QUANTIDADE NECESSÁRIA (WISN)', f('IF(C50>0,E31/C50,0)', res.required), '0.00'],
    [55, 'DÉFICIT (−) / EXCEDENTE (+)', f('C53-C54', res.balance), '+0.00;-0.00;0.00'],
    [56, 'RAZÃO ATUAL / NECESSÁRIO', f('IF(C54>0,C53/C54,0)', res.ratio), '0.000'],
    [
      57,
      'SITUAÇÃO',
      f('IF(C55>=0,"EQUILÍBRIO","DÉFICIT")', res.balance >= 0 ? 'EQUILÍBRIO' : 'DÉFICIT'),
    ],
  ];

  summary.forEach(([row, label, value, fmt]) => {
    ws.mergeCells(row, 1, row, 2);
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { bold: true, size: 10 };
    ws.getCell(row, 3).value = value;
    if (fmt) ws.getCell(row, 3).numFmt = fmt;
    ws.getCell(row, 3).font = { bold: true, size: 11 };
    for (let c = 1; c <= 3; c += 1) {
      ws.getCell(row, c).border = thin;
      ws.getCell(row, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT2 } };
      ws.getCell(row, c).alignment = { vertical: 'middle' };
    }
    ws.getCell(row, 3).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(row, 3).font = {
      bold: true,
      size: 11,
      color: { argb: row === 55 ? (res.balance < 0 ? 'B42318' : '067647') : TEXT },
    };
  });

  mergeText(ws, 'A59:I62', project.notes ||
    'Observações: documento de apoio ao planejamento. O resultado depende dos dados informados e deve ser analisado pelo responsável técnico.', {
    alignment: { wrapText: true, vertical: 'top' },
    font: { size: 10, color: { argb: TEXT } },
  });

  // Assinaturas
  const sign = (from: string, to: string) => {
    ws.mergeCells(`${from}:${to}`);
    ws.getCell(from).value = 'ASSINATURA E CARIMBO';
    ws.getCell(from).font = { bold: true, size: 9 };
    ws.getCell(from).alignment = { horizontal: 'center' };
    ws.getCell(from).border = { bottom: { style: 'thin', color: { argb: '666666' } } };
  };
  sign('B65', 'D65');
  sign('F65', 'H65');

  ws.getCell('B66').value = project.responsibleName || '';
  ws.getCell('B66').font = { size: 10, bold: true };
  ws.getCell('B66').alignment = { horizontal: 'center' };
  ws.getCell('B67').value = project.responsibleCoren || '';
  ws.getCell('B67').font = { size: 9 };
  ws.getCell('B67').alignment = { horizontal: 'center' };
  ws.getCell('F67').value = 'ENFERMEIRO(A) RESPONSÁVEL';
  ws.getCell('F67').font = { size: 8, italic: true };
  ws.getCell('F67').alignment = { horizontal: 'center' };

  mergeText(ws, 'A70:I70', `${project.signatureCity || project.city || ''}, ${formatDateBR(project.signatureDate || new Date().toISOString().slice(0, 10))}`, {
    alignment: { horizontal: 'center' },
    font: { size: 10 },
  });

  mergeText(
    ws,
    'A72:I72',
    'Documento gerado pelo aplicativo Dimensionamento de Enfermagem (wavizo). Ferramenta de apoio ao planejamento; não substitui a análise do responsável técnico nem é um sistema oficial.',
    { font: { size: 8, italic: true, color: { argb: '666666' } }, alignment: { wrapText: true, horizontal: 'center' } },
  );
}

function buildEvaluationSheet(
  wb: ExcelJS.Workbook,
  name: string,
  project: Project,
  resEnf: CategoryResult,
  resTec: CategoryResult,
): void {
  const ws = wb.addWorksheet(name, {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });
  ws.columns = [
    { width: 38 },
    { width: 16 },
    { width: 18 },
    { width: 20 },
    { width: 20 },
    { width: 20 },
    { width: 16 },
    { width: 22 },
    { width: 20 },
  ];

  mergeText(ws, 'A1:I1', `ANÁLISE DE RESULTADOS — DIMENSIONAMENTO DE ENFERMAGEM — ${project.periodLabel}`, {
    font: { bold: true, size: 14, color: { argb: TEAL } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  });
  ws.getRow(1).height = 28;

  mergeText(ws, 'A3:I3', [project.unitName || 'Unidade não informada', project.city].filter(Boolean).join(' — '), {
    font: { bold: true, size: 11 },
    alignment: { horizontal: 'center' },
  });

  tableHeader(ws, 8, [
    { text: 'CATEGORIA PROFISSIONAL', from: 1, to: 2 },
    { text: 'Nº ATUAL', from: 3 },
    { text: 'Nº NECESSÁRIO', from: 4 },
    { text: 'DÉFICIT / EXCEDENTE', from: 5 },
    { text: 'RAZÃO ATUAL/NECESSÁRIO', from: 6 },
    { text: 'PRESSÃO DE CARGA', from: 7, to: 8 },
    { text: 'PROBLEMA', from: 9 },
  ]);

  const names = exportSheetNames(project);
  const rows: [number, string, CategoryResult, string][] = [
    [9, 'ENFERMEIROS', resEnf, names.enf],
    [10, 'TÉCNICOS/AUXILIARES DE ENFERMAGEM', resTec, names.tec],
  ];
  rows.forEach(([row, label, res, sheet]) => {
    ws.mergeCells(row, 1, row, 2);
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 3).value = res.current;
    ws.getCell(row, 4).value = f(`'${sheet}'!H9`, res.required);
    ws.getCell(row, 5).value = f(`C${row}-D${row}`, res.balance);
    ws.getCell(row, 6).value = f(`IF(D${row}>0,C${row}/D${row},0)`, res.ratio);
    ws.mergeCells(row, 7, row, 8);
    ws.getCell(row, 7).value = pressureLabel(res.pressure);
    ws.getCell(row, 9).value = res.required > 0 ? (res.balance < 0 ? 'Aumentar o quadro' : 'Sem déficit') : 'Informar produção';
    ws.getCell(row, 4).numFmt = '0.00';
    ws.getCell(row, 5).numFmt = '+0.00;-0.00;0.00';
    ws.getCell(row, 6).numFmt = '0.000';
    for (let c = 1; c <= 9; c += 1) {
      ws.getCell(row, c).border = thin;
      ws.getCell(row, c).alignment = { vertical: 'middle', wrapText: true };
      ws.getCell(row, c).font = { size: 10 };
    }
    ws.getCell(row, 3).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(row, 4).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(row, 5).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(row, 6).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(row, 7).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(row).height = 30;
  });

  mergeText(ws, 'A13:I13', 'OBSERVAÇÕES', {
    font: { bold: true, size: 10 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } },
    alignment: { vertical: 'middle', indent: 1 },
  });

  const notes = [
    project.notes,
    'Método WISN/WPSN. Premissa: todo dia não registrado como ausência é contado como presença.',
    `Tempo de trabalho disponível: ${resEnf.daysWorked.toFixed(1)} dias/ano (enfermeiros) e ${resTec.daysWorked.toFixed(1)} dias/ano (técnicos/auxiliares).`,
    'Para atualizar: importe os dados de produção e ausências e gere novamente este arquivo.',
  ]
    .filter(Boolean)
    .join('\n\n');

  mergeText(ws, 'A14:I19', notes, {
    alignment: { wrapText: true, vertical: 'top' },
    font: { size: 10, color: { argb: TEXT } },
  });

  mergeText(ws, 'E23:H23', 'ASSINATURA E CARIMBO DO RESPONSÁVEL TÉCNICO', {
    font: { bold: true, size: 9 },
    alignment: { horizontal: 'center' },
  });
  mergeText(ws, 'E24:H24', project.responsibleName || '', {
    font: { bold: true, size: 10 },
    alignment: { horizontal: 'center' },
  });
  mergeText(ws, 'E25:H25', project.responsibleCoren || '', {
    font: { size: 9 },
    alignment: { horizontal: 'center' },
  });

  mergeText(ws, 'A28:I28', `${project.signatureCity || project.city || ''}, ${formatDateBR(project.signatureDate || new Date().toISOString().slice(0, 10))}`, {
    alignment: { horizontal: 'center' },
    font: { size: 10 },
  });
}

function buildMemorySheet(wb: ExcelJS.Workbook, project: Project): void {
  const ws = wb.addWorksheet('MEMÓRIA DE CÁLCULO', {
    pageSetup: { fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });
  ws.columns = [
    { width: 42 },
    { width: 26 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 32 },
  ];

  mergeText(ws, 'A1:F1', 'MEMÓRIA DE CÁLCULO E PREMISSAS', {
    font: { bold: true, size: 14, color: { argb: TEAL } },
  });
  ws.getRow(1).height = 26;

  let row = 3;
  const kv = (k: string, v: string | number) => {
    ws.getCell(row, 1).value = k;
    ws.getCell(row, 1).font = { bold: true, size: 10 };
    ws.getCell(row, 2).value = v;
    ws.getCell(row, 2).font = { size: 10 };
    row += 1;
  };
  kv('Unidade', project.unitName || '—');
  kv('Cidade', project.city || '—');
  kv('Período', project.periodLabel);
  kv('Semanas por ano', project.settings.weeksPerYear);
  kv('Dias trabalhados por semana', project.settings.daysPerWeek);
  kv('Horas por dia', project.settings.hoursPerDay);
  row += 1;

  const blockTitle = (text: string) => {
    mergeText(ws, `A${row}:F${row}`, text, {
      font: { bold: true, color: { argb: 'FFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } },
      alignment: { vertical: 'middle', indent: 1 },
    });
    row += 1;
  };

  blockTitle('FÓRMULAS');
  [
    'Dias disponíveis = semanas por ano × dias trabalhados na semana',
    'Dias trabalhados = dias disponíveis − feriados − férias − licença saúde − outras licenças',
    'TTD (horas/ano) = dias trabalhados × horas por dia',
    'Horas de cuidado direto = Σ (produção anual × tempo médio do procedimento)',
    'Quantidade necessária = (horas de cuidado direto ÷ TTD) ÷ (1 − % de cuidados indiretos)',
    'Saldo = quantidade atual − quantidade necessária',
  ].forEach((text) => {
    mergeText(ws, `A${row}:F${row}`, `• ${text}`, { alignment: { wrapText: true }, font: { size: 10 } });
    row += 1;
  });
  row += 1;

  blockTitle('PARÂMETROS DE CUIDADOS INDIRETOS');
  const indirectHeader = row;
  ['ATIVIDADE', 'ENFERMEIROS', 'TÉCNICOS/AUX.', '', '', ''].forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    cell.border = thin;
  });
  row += 1;
  INDIRECT_ITEMS.forEach((item) => {
    ws.getCell(row, 1).value = item.name;
    ws.getCell(row, 2).value = `${Number(project.categories.enf.indirect[item.key] || 0).toFixed(1)}%`;
    ws.getCell(row, 3).value = `${Number(project.categories.tec.indirect[item.key] || 0).toFixed(1)}%`;
    for (let c = 1; c <= 3; c += 1) {
      ws.getCell(row, c).border = thin;
      ws.getCell(row, c).font = { size: 9 };
    }
    row += 1;
  });
  void indirectHeader;
  row += 1;

  blockTitle('EQUIPE CONSIDERADA');
  ['NOME', 'CATEGORIA', 'SITUAÇÃO', 'HORAS/SEMANA', '', 'OBSERVAÇÃO'].forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    cell.border = thin;
  });
  row += 1;
  if (project.team.length === 0) {
    mergeText(ws, `A${row}:F${row}`, 'Equipe não listada por nome (informada apenas por quantidade).', {
      font: { size: 10, italic: true },
    });
    row += 1;
  } else {
    project.team.forEach((m) => {
      ws.getCell(row, 1).value = m.name || '—';
      ws.getCell(row, 2).value = m.role;
      ws.getCell(row, 3).value = m.status === 'active' ? 'Ativo' : m.status === 'leave' ? 'Afastado' : 'Inativo';
      ws.getCell(row, 4).value = m.weeklyHours;
      ws.getCell(row, 6).value = m.note;
      for (let c = 1; c <= 6; c += 1) {
        ws.getCell(row, c).border = thin;
        ws.getCell(row, c).font = { size: 9 };
        ws.getCell(row, c).alignment = { wrapText: true, vertical: 'middle' };
      }
      row += 1;
    });
  }
  row += 1;

  blockTitle('AUSÊNCIAS LANÇADAS');
  ['PROFISSIONAL', 'TIPO', 'DIAS', 'INÍCIO', '', 'OBSERVAÇÃO'].forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    cell.border = thin;
  });
  row += 1;
  if (project.absenceRecords.length === 0) {
    mergeText(ws, `A${row}:F${row}`, 'Nenhuma ausência detalhada lançada (médias informadas manualmente ou presunção de presença).', {
      font: { size: 10, italic: true },
    });
    row += 1;
  } else {
    project.absenceRecords.forEach((rec) => {
      const member = project.team.find((x) => x.id === rec.memberId);
      ws.getCell(row, 1).value = member?.name || '—';
      ws.getCell(row, 2).value = rec.type === 'health' ? 'Licença de saúde' : rec.type === 'vacation' ? 'Férias' : 'Outra licença';
      ws.getCell(row, 3).value = rec.days;
      ws.getCell(row, 4).value = formatDateBR(rec.startDate);
      ws.getCell(row, 6).value = rec.note;
      for (let c = 1; c <= 6; c += 1) {
        ws.getCell(row, c).border = thin;
        ws.getCell(row, c).font = { size: 9 };
        ws.getCell(row, c).alignment = { wrapText: true, vertical: 'middle' };
      }
      row += 1;
    });
  }

  row += 2;
  mergeText(
    ws,
    `A${row}:F${row}`,
    'Ferramenta de apoio ao planejamento. Não é sistema oficial, prontuário ou dispositivo médico. Os resultados dependem dos dados informados.',
    { font: { italic: true, size: 9, color: { argb: '666666' } }, alignment: { wrapText: true } },
  );
}

function formatDateBR(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function safeFileName(project: Project): string {
  const safeUnit =
    (project.unitName || 'dimensionamento')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'dimensionamento';
  return `Dimensionamento-${safeUnit}-${project.periodTag || 'periodo'}.xlsx`;
}

export async function buildProjectXlsx(project: Project): Promise<{ fileName: string; bytes: Uint8Array }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Dimensionamento de Enfermagem (wavizo)';
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  const names = exportSheetNames(project);
  const result = calcProject(project);
  buildCategorySheet(wb, names.enf, project, 'enf');
  buildCategorySheet(wb, names.tec, project, 'tec');
  buildEvaluationSheet(wb, names.evaluation, project, result.enf, result.tec);
  buildMemorySheet(wb, project);

  const buffer = await wb.xlsx.writeBuffer();
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);
  return { fileName: safeFileName(project), bytes };
}

export async function exportProjectXlsx(project: Project): Promise<string> {
  const { fileName, bytes } = await buildProjectXlsx(project);
  await saveBinaryFile(fileName, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return fileName;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function exportJsonBackup(project: Project): void {
  const payload = {
    app: 'dimensionamento-enfermagem',
    schema: 1,
    exportedAt: new Date().toISOString(),
    project,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const safe = (project.unitName || 'dimensionamento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  downloadBlob(blob, `backup-${safe || 'dimensionamento'}-${project.periodTag || ''}.json`);
}
