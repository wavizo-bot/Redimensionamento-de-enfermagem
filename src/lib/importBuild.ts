import type { Project, Role, TeamMember } from '../types';
import type { ImportPreview, ImportWindow, SuggestedMember } from './importXlsx';
import { PROCEDURES, makeMember, makeProject } from './defaults';

const norm = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

function mergeSuggestions(team: TeamMember[], suggestions: SuggestedMember[]): TeamMember[] {
  const byName = new Map(team.map((member) => [norm(member.name), member]));
  const merged = [...team];
  for (const suggestion of suggestions) {
    const key = norm(suggestion.name);
    if (!key || byName.has(key)) continue;
    const member = makeMember({ name: suggestion.name.trim(), role: suggestion.role });
    byName.set(key, member);
    merged.push(member);
  }
  return merged;
}

/**
 * Monta o projeto a partir do que foi lido na planilha.
 *
 * - Planilha completa de dimensionamento: importa produção, tempos, indiretos,
 *   ausências, quantidade e nomes da equipe.
 * - Relatório parcial: importa apenas a produção dos dez grupos e, se o usuário
 *   pedir, sugere nomes para a equipe. Tempos, indiretos, ausências e quadro
 *   atual continuam como estavam para revisão manual.
 */
export function buildImportedProject(
  preview: ImportPreview,
  base: Project | null,
  window: ImportWindow | null,
  useTeam: boolean,
): Project {
  const draft = base
    ? { ...base, team: [...base.team], categories: { ...base.categories } }
    : makeProject();
  const project = makeProject(draft);

  project.unitName = preview.unitName || (base ? base.unitName : '');
  project.updatedAt = new Date().toISOString();

  if (preview.kind === 'dimensionamento') {
    project.periodLabel = preview.periodLabel || project.periodLabel;
    project.periodTag = preview.periodTag || project.periodTag;
    project.startDate = preview.startDate || project.startDate;
    project.endDate = preview.endDate || project.endDate;

    const categories = { ...project.categories };
    let staffEnf: number | null = null;
    let staffTec: number | null = null;

    (['enf', 'tec'] as const).forEach((key) => {
      const imported = preview[key];
      const current = project.categories[key];
      if (!imported) return;
      if (key === 'enf') staffEnf = imported.staffCount;
      else staffTec = imported.staffCount;
      categories[key] = {
        ...current,
        production: { ...current.production, ...imported.production },
        directTimes: { ...current.directTimes, ...imported.directTimes },
        indirect: { ...current.indirect, ...imported.indirect },
        absences: imported.absences
          ? { ...current.absences, ...imported.absences }
          : current.absences,
        staffCount: imported.staffCount ?? current.staffCount,
      };
    });
    project.categories = categories;

    const names: { name: string; role: Role }[] = [];
    (preview.enf?.names ?? []).forEach((name) => names.push({ name, role: 'Enfermeiro' }));
    (preview.tec?.names ?? []).forEach((name) => names.push({ name, role: 'Técnico de Enfermagem' }));

    const existingByName = new Map(base?.team.map((m) => [m.name.toLowerCase(), m]) ?? []);
    project.team = names.map((item) => {
      const found = existingByName.get(item.name.toLowerCase());
      return found ? { ...found, role: item.role } : makeMember({ name: item.name, role: item.role });
    });

    // Se a planilha traz a quantidade oficial, o modo "só a quantidade" evita
    // divergência com a lista de nomes.
    project.teamMode = staffEnf !== null || staffTec !== null ? 'count' : 'list';
    project.absenceRecords = (base?.absenceRecords ?? []).filter((record) =>
      project.team.some((member) => member.id === record.memberId),
    );
    project.partialOrigin = null;
    return project;
  }

  if (!preview.partial?.usable || !window) return project;
  const partial = preview.partial;
  if (partial.format === 'establishment') return project;

  if (window.periodLabel) {
    project.periodLabel = window.periodLabel;
    project.periodTag = window.periodTag;
  }
  if (window.periodStart) project.startDate = window.periodStart;
  if (window.periodEnd) project.endDate = window.periodEnd;

  const categories = { ...project.categories };
  (['enf', 'tec'] as const).forEach((key) => {
    const current = project.categories[key];
    const production = { ...current.production };
    for (const procedure of PROCEDURES) {
      const value = window.production[key][procedure.key] ?? 0;
      // O relatório do e-SUS não tem vacinas; não apaga o que o usuário já
      // preencheu em Imunizações quando o valor vier zerado.
      if (procedure.key === 'imunizacoes' && value === 0) continue;
      production[procedure.key] = value;
    }
    categories[key] = { ...current, production };
  });
  project.categories = categories;

  if (useTeam) {
    project.team = mergeSuggestions(project.team, [...window.team.enf, ...window.team.tec]);
  }
  project.teamMode = project.team.length ? 'list' : base ? base.teamMode : 'list';
  project.absenceRecords = (base?.absenceRecords ?? []).filter((record) =>
    project.team.some((member) => member.id === record.memberId),
  );

  project.partialOrigin = {
    fileName: preview.fileName,
    format: partial.format,
    formatLabel: partial.formatLabel,
    windowLabel: window.label,
    rangeLabel: window.rangeLabel,
    months: window.months,
    annualized: window.annualized,
    unmappedEnf: window.unmapped.enf,
    unmappedTec: window.unmapped.tec,
    importedAt: new Date().toISOString(),
    reviewed: false,
  };

  return project;
}
