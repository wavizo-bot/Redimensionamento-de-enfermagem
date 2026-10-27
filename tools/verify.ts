import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';
import { calcProject, calcCategory, exportSheetNames } from '../src/lib/calc';
import { makeDemoProject, nationalHolidays } from '../src/lib/defaults';
import { buildProjectXlsx } from '../src/lib/exportXlsx';
import { readSpreadsheet } from '../src/lib/importXlsx';

function close(actual: number, expected: number, tolerance: number, label: string) {
  const ok = Math.abs(actual - expected) <= tolerance;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${actual} (esperado ${expected})`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const demo = makeDemoProject();
  const res = calcProject(demo);
  close(res.enf.ttdHours, 1831.2, 0.01, 'TTD enfermeiros');
  close(res.tec.ttdHours, 1609.8667, 0.01, 'TTD técnicos');
  close(res.enf.directHours, 3570.33, 0.01, 'Horas diretas enfermeiros');
  close(res.tec.directHours, 8914.07, 0.01, 'Horas diretas técnicos');
  close(res.enf.indirectPct, 45.6, 0.01, 'Indiretos enfermeiros');
  close(res.tec.indirectPct, 42.2, 0.01, 'Indiretos técnicos');
  close(res.enf.required, 3.584046864, 0.0001, 'WISN enfermeiros');
  close(res.tec.required, 9.579840837, 0.0001, 'WISN técnicos');
  close(res.enf.balance, 0.415953136, 0.0001, 'Saldo enfermeiros');
  close(res.tec.balance, -2.579840837, 0.0001, 'Saldo técnicos');
  console.log('Nomes das abas:', exportSheetNames(demo));
  console.log('Feriados nacionais 2025-08-01 a 2026-07-31:', nationalHolidays('2025-08-01', '2026-07-31'));

  const { fileName, bytes } = await buildProjectXlsx(demo);
  const out = `C:/Users/Maycon/AppData/Local/Temp/opencode/${fileName}`;
  writeFileSync(out, bytes);
  console.log('Excel gerado:', out, bytes.byteLength, 'bytes');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(out);
  console.log('Abas geradas:', wb.worksheets.map((w) => `[${w.name}]`).join(' '));
  const names = exportSheetNames(demo);
  const enf = wb.getWorksheet(names.enf);
  const tec = wb.getWorksheet(names.tec);
  if (!enf || !tec) throw new Error('Abas obrigatórias ausentes');
  close(Number(enf.getCell('C16').value && (enf.getCell('C16').value as { result?: number }).result), 1831.2, 0.01, 'C16 enfermeiros');
  close(Number(enf.getCell('C54').value && (enf.getCell('C54').value as { result?: number }).result), 3.584046864, 0.0001, 'C54 enfermeiros');
  close(Number(tec.getCell('C54').value && (tec.getCell('C54').value as { result?: number }).result), 9.579840837, 0.0001, 'C54 técnicos');
  close(Number(tec.getCell('H9').value && (tec.getCell('H9').value as { result?: number }).result), 9.579840837, 0.0001, 'H9 técnicos');

  // Importação do arquivo oficial
  const official = 'C:/Users/Maycon/Downloads/DIMENSIONAMENTO ENFERMAGEM - CLINICA DA FAMILIA ALMERINDA CHAVES - 2025-2026.xlsx';
  const fs = await import('node:fs/promises');
  const buf = await fs.readFile(official);
  const fakeFile = {
    name: 'DIMENSIONAMENTO ENFERMAGEM - CLINICA DA FAMILIA ALMERINDA CHAVES - 2025-2026.xlsx',
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  } as unknown as File;
  const preview = await readSpreadsheet(fakeFile);
  console.log('Importação:', preview.kind, preview.unitName, preview.periodLabel, 'equipe', preview.enf?.staffCount, preview.tec?.staffCount);
  if (preview.enf) {
    console.log('Produção ENF:', JSON.stringify(preview.enf.production));
    console.log('Tempos ENF:', JSON.stringify(preview.enf.directTimes));
    console.log('Indiretos ENF total:', Object.values(preview.enf.indirect).reduce((a, b) => a + b, 0).toFixed(1));
    console.log('Ausências ENF:', JSON.stringify(preview.enf.absences));
    console.log('Nomes ENF:', preview.enf.names.join(' | '));
  }
  if (preview.tec) {
    console.log('Produção TEC:', JSON.stringify(preview.tec.production));
    console.log('Tempos TEC:', JSON.stringify(preview.tec.directTimes));
    console.log('Indiretos TEC total:', Object.values(preview.tec.indirect).reduce((a, b) => a + b, 0).toFixed(1));
    console.log('Ausências TEC:', JSON.stringify(preview.tec.absences));
    console.log('Nomes TEC:', preview.tec.names.join(' | '));
  }
  console.log('Avisos:', preview.warnings);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
