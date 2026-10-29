import ExcelJS from 'exceljs';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { calcProject, calcCategory, exportSheetNames } from '../src/lib/calc';
import { makeDemoProject, makeProject, nationalHolidays } from '../src/lib/defaults';
import { buildProjectXlsx } from '../src/lib/exportXlsx';
import { readSpreadsheet } from '../src/lib/importXlsx';
import { buildImportedProject } from '../src/lib/importBuild';
import { mapProcedureToGroup, validateProcedureMap } from '../src/lib/procedureMap';

function fakeSpreadsheet(path: string): File {
  const buf = readFileSync(path);
  return {
    name: path.split('/').pop() ?? 'planilha.xlsx',
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  } as unknown as File;
}

function close(actual: number, expected: number, tolerance: number, label: string) {
  const ok = Math.abs(actual - expected) <= tolerance;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${actual} (esperado ${expected})`);
  if (!ok) process.exitCode = 1;
}

function check(condition: boolean, label: string) {
  console.log(`${condition ? 'OK  ' : 'FAIL'} ${label}`);
  if (!condition) process.exitCode = 1;
}

/**
 * Procura um relatório de teste sem depender de caminho fixo. Os arquivos
 * reais não são versionados: ficam em `teste/`, em Downloads ou no diretório
 * indicado por DIMENSIONAMENTO_TESTE_DIR.
 */
function findReport(name: string): string | undefined {
  const candidates = [
    process.env.DIMENSIONAMENTO_TESTE_DIR
      ? `${process.env.DIMENSIONAMENTO_TESTE_DIR.replace(/\\/g, '/')}/${name}`
      : undefined,
    `teste/${name}`,
    `C:/Users/Maycon/Downloads/${name}`,
  ];
  return candidates.find((path): path is string => Boolean(path && existsSync(path)));
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

  // Mapeamento dos procedimentos do e-SUS para os grupos do dimensionamento.
  check(validateProcedureMap().length === 0, 'Mapa: todas as regras apontam para grupos válidos');
  const mapCases: [string, string | null][] = [
    ['0101010010 - ATIVIDADE EDUCATIVA / ORIENTAÇÃO EM GRUPO NA ATENÇÃO PRIMÁRIA', 'educacao'],
    ['0301040079 - ESCUTA INICIAL / ORIENTAÇÃO (ACOLHIMENTO A DEMANDA ESPONT NEA)', 'demanda'],
    ['0202030302 - COLETA DE MATERIAL PARA EXAME LABORATORIAL', 'puncao'],
    ['0301010030 - CONSULTA DE ENFERMEIRO', 'consulta'],
    ['0101020058 - APLICAÇÃO DE CARIOSTÁTICO (POR DENTE)', null],
    ['0411010034 - CONSULTA MEDICA EM ATENCAO BASICA', null],
  ];
  for (const [procedure, expected] of mapCases) {
    const actual = mapProcedureToGroup(procedure);
    check(actual === expected, `Mapa: ${procedure.slice(0, 52)} → ${actual ?? 'fora'}`);
  }

  // Importação do arquivo oficial (procurado pelo padrão, sem gravar o nome da unidade)
  const downloads = 'C:/Users/Maycon/Downloads';
  const official = process.env.DIMENSIONAMENTO_OFFICIAL_XLSX
    ?? (existsSync(downloads)
      ? readdirSync(downloads)
          .filter((name) => /^DIMENSIONAMENTO ENFERMAGEM.*\.xlsx$/i.test(name))
          .map((name) => `${downloads}/${name}`)[0]
      : undefined);
  if (official && existsSync(official)) {
    const preview = await readSpreadsheet(fakeSpreadsheet(official));
    console.log('Importação:', preview.kind, preview.unitName ? '(unidade identificada)' : '(sem unidade)', preview.periodLabel, 'equipe', preview.enf?.staffCount, preview.tec?.staffCount);
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
  } else {
    console.log('SKIP Importação oficial: arquivo não encontrado');
  }

  const expandedReport = findReport('Detalhamento de procedimentos lançados expandidos.xlsx');
  if (expandedReport) {
    const p = await readSpreadsheet(fakeSpreadsheet(expandedReport));
    close(p.coverageMonths ?? 0, 48, 0, 'Expandido: meses');
    close(p.totalProcedures ?? 0, 248007, 0, 'Expandido: total');
    close(p.categoryTotals?.enf ?? 0, 49531, 0, 'Expandido: enfermeiros');
    close(p.categoryTotals?.tec ?? 0, 52778, 0, 'Expandido: técnicos');
    close(p.categoryTotals?.other ?? 0, 145698, 0, 'Expandido: outras ocupações');
    close(p.last12Totals?.total ?? 0, 73607, 0, 'Expandido: últimos 12 meses');
    close(p.staffNames?.enf ?? 0, 20, 0, 'Expandido: nomes enfermeiros');
    close(p.staffNames?.tec ?? 0, 23, 0, 'Expandido: nomes técnicos');
    console.log('Detalhamento expandido:', p.detail, p.coverageLabel, p.totalProcedures);

    const partial = p.partial;
    check(Boolean(partial?.usable), 'Expandido: reconhecido como base parcial utilizável');
    const school = partial?.windows.find((w) => w.key === 'school');
    const last12 = partial?.windows.find((w) => w.key === 'last12');
    const all = partial?.windows.find((w) => w.key === 'all');
    check(Boolean(school && last12 && all), 'Expandido: janelas escola, últimos 12 e todo o período');
    if (school && last12 && all) {
      close(school.totals.enf, 14216, 0, 'Escola: enfermeiros');
      close(school.totals.tec, 14594, 0, 'Escola: técnicos');
      close(school.totals.other, 41259, 0, 'Escola: outras ocupações');
      close(school.totals.total, 70069, 0, 'Escola: total');
      close(school.unmapped.total, 0, 0, 'Escola: não mapeados');
      close(school.production.enf.consulta, 7154, 0, 'Escola: consulta enfermeiros');
      close(school.production.tec.puncao, 4964, 0, 'Escola: punção técnicos');
      close(school.production.enf.imunizacoes, 0, 0, 'Escola: imunizações zeradas');
      close(school.team.enf.length, 10, 0, 'Escola: sugestão de enfermeiros');
      close(school.team.tec.length, 11, 0, 'Escola: sugestão de técnicos');

      close(last12.totals.enf, 15762, 0, 'Últimos 12: enfermeiros');
      close(last12.totals.tec, 15445, 0, 'Últimos 12: técnicos');
      close(last12.totals.total, 73607, 0, 'Últimos 12: total');
      close(last12.production.enf.consulta, 7742, 0, 'Últimos 12: consulta enfermeiros');
      close(last12.production.tec.puncao, 5332, 0, 'Últimos 12: punção técnicos');

      close(all.months, 47, 0, 'Todo o período: meses completos');
      check(all.annualized, 'Todo o período: anualizado');
      close(all.totals.enf, 12242, 0, 'Todo o período: enfermeiros anualizados');
      close(all.totals.tec, 13159, 0, 'Todo o período: técnicos anualizados');
      close(all.unmapped.total, 1, 0, 'Todo o período: não mapeados');

      const project = buildImportedProject(p, null, school, true);
      close(project.categories.enf.production.consulta, 7154, 0, 'Projeto: produção enfermeiros');
      close(project.categories.tec.production.puncao, 4964, 0, 'Projeto: produção técnicos');
      check(project.periodLabel === '2025/2026', 'Projeto: período da janela escola');
      check(project.startDate === '2025-08-01' && project.endDate === '2026-07-31', 'Projeto: datas da janela escola');
      check(project.partialOrigin?.format === 'expanded', 'Projeto: origem parcial registrada');
      check(project.partialOrigin?.reviewed === false, 'Projeto: revisão pendente');
      close(project.team.length, 21, 0, 'Projeto: nomes sugeridos acrescentados');

      const seed = makeProject();
      close(
        project.categories.enf.directTimes.consulta,
        seed.categories.enf.directTimes.consulta,
        0.0001,
        'Projeto: tempo direto mantido',
      );
      close(
        project.categories.enf.absences.vacation,
        seed.categories.enf.absences.vacation,
        0.0001,
        'Projeto: ausências mantidas',
      );

      seed.categories.enf.production.imunizacoes = 321;
      const withBase = buildImportedProject(p, seed, school, false);
      close(
        withBase.categories.enf.production.imunizacoes,
        321,
        0,
        'Projeto: imunizações preservadas',
      );

      const reviewed = buildImportedProject(p, null, school, false);
      check(reviewed.team.length === 0, 'Projeto: nomes não usados quando a opção está desmarcada');
    }
  } else {
    console.log('SKIP Detalhamento expandido: arquivo não encontrado');
  }

  const professionalReport = findReport('Quantidade de procedimentos lançados por profissional.xlsx');
  if (professionalReport) {
    const p = await readSpreadsheet(fakeSpreadsheet(professionalReport));
    close(p.coverageMonths ?? 0, 43, 0, 'Por profissional: meses');
    close(p.totalProcedures ?? 0, 228475, 0, 'Por profissional: total');
    close(p.categoryTotals?.enf ?? 0, 47737, 0, 'Por profissional: enfermeiros');
    close(p.categoryTotals?.tec ?? 0, 49223, 0, 'Por profissional: técnicos');
    close(p.categoryTotals?.other ?? 0, 131515, 0, 'Por profissional: outras ocupações');
    check(p.unitName === '', 'Por profissional: sem unidade no relatório');
    check(p.detail === 'professional', 'Por profissional: formato identificado');
    const school = p.partial?.windows.find((w) => w.key === 'school');
    if (school) {
      close(school.totals.enf, 14177, 0, 'Por profissional: enfermeiros na escola');
      close(school.totals.tec, 13898, 0, 'Por profissional: técnicos na escola');
      close(school.unmapped.total, 0, 0, 'Por profissional: não mapeados na escola');
      close(school.team.enf.length, 10, 0, 'Por profissional: sugestão de enfermeiros');
      close(school.team.tec.length, 11, 0, 'Por profissional: sugestão de técnicos');
      const project = buildImportedProject(p, null, school, false);
      close(project.categories.enf.production.consulta, 7122, 0, 'Por profissional: consulta enfermeiros');
      close(project.categories.tec.production.puncao, 4963, 0, 'Por profissional: punção técnicos');
    }
    console.log('Por profissional:', p.detail, p.coverageLabel, p.totalProcedures);
  } else {
    console.log('SKIP Por profissional: arquivo não encontrado');
  }

  const establishmentReport = findReport('Quantidade de procedimentos lançados por estabelecimento.xlsx');
  if (establishmentReport) {
    const p = await readSpreadsheet(fakeSpreadsheet(establishmentReport));
    close(p.coverageMonths ?? 0, 43, 0, 'Por estabelecimento: meses');
    close(p.totalProcedures ?? 0, 228475, 0, 'Por estabelecimento: total');
    check(p.detail === 'establishment', 'Por estabelecimento: formato identificado');
    check(p.partial?.usable === false, 'Por estabelecimento: somente conferência');
    const school = p.partial?.windows.find((w) => w.key === 'school');
    if (school) {
      close(school.totals.total, 66414, 0, 'Por estabelecimento: total na escola');
      close(school.unmapped.total, 25803, 0, 'Por estabelecimento: não mapeados na escola');
      close(school.unmappedProcedures.length, 47, 0, 'Por estabelecimento: procedimentos não mapeados');
    }
    console.log('Por estabelecimento:', p.detail, p.coverageLabel, p.totalProcedures);
  } else {
    console.log('SKIP Por estabelecimento: arquivo não encontrado');
  }

  const aggregateReport = findReport('Detalhamento de procedimentos lançados.xlsx');
  if (aggregateReport) {
    const p = await readSpreadsheet(fakeSpreadsheet(aggregateReport));
    close(p.coverageMonths ?? 0, 22, 0, 'Agregado: meses');
    close(p.totalProcedures ?? 0, 130410, 0, 'Agregado: total');
    check(p.detail === 'aggregate', 'Agregado: formato identificado');
    console.log('Detalhamento agregado:', p.detail, p.coverageLabel, p.totalProcedures);
  } else {
    console.log('SKIP Detalhamento agregado: arquivo não encontrado');
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
