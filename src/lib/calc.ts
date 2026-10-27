import type {
  AbsenceValues,
  CategoryKey,
  CategoryResult,
  Project,
  ProjectResult,
  Role,
  TeamMember,
} from '../types';
import { nationalHolidays, PROCEDURES, ROLE_CATEGORY, INDIRECT_ITEMS } from './defaults';

export const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(x) ? x : 0;
};

export const round = (v: number, digits = 2): number => {
  const f = 10 ** digits;
  return Math.round((v + Number.EPSILON) * f) / f;
};

export function memberCategory(member: TeamMember): CategoryKey {
  return ROLE_CATEGORY[member.role as Role] ?? 'tec';
}

export function countTeam(project: Project, key: CategoryKey) {
  const members = project.team.filter((m) => memberCategory(m) === key);
  return {
    active: members.filter((m) => m.status === 'active').length,
    onLeave: members.filter((m) => m.status === 'leave').length,
    inactive: members.filter((m) => m.status === 'inactive').length,
    total: members.length,
  };
}

export function currentStaff(project: Project, key: CategoryKey): number {
  if (project.teamMode === 'count') return Math.max(0, n(project.categories[key].staffCount));
  return countTeam(project, key).active;
}

/** Número de profissionais usados como denominador da média de ausências. */
function averageBase(project: Project, key: CategoryKey): number {
  if (project.teamMode === 'count') {
    return Math.max(1, n(project.categories[key].staffCount));
  }
  const c = countTeam(project, key);
  return Math.max(1, c.active + c.onLeave);
}

export function effectiveAbsences(project: Project, key: CategoryKey): AbsenceValues {
  const cfg = project.categories[key];
  const hasPeriod = Boolean(project.startDate && project.endDate);
  const autoHolidays =
    cfg.absences.useHolidayCalendar && hasPeriod
      ? nationalHolidays(project.startDate, project.endDate)
      : 0;

  let vacation = n(cfg.absences.vacation);
  let healthLeave = n(cfg.absences.healthLeave);
  let otherLeave = n(cfg.absences.otherLeave);

  if (cfg.absences.mode === 'detail') {
    const base = averageBase(project, key);
    const relevant = project.absenceRecords.filter((r) => {
      const member = project.team.find((m) => m.id === r.memberId);
      return member ? memberCategory(member) === key : false;
    });
    const sum = (type: string) =>
      relevant.filter((r) => r.type === type).reduce((acc, r) => acc + Math.max(0, n(r.days)), 0);
    vacation = round(sum('vacation') / base, 6);
    healthLeave = round(sum('health') / base, 6);
    otherLeave = round(sum('other') / base, 6);
  }

  return {
    holidays: round(cfg.absences.useHolidayCalendar ? autoHolidays : n(cfg.absences.holidays), 4),
    vacation: round(vacation, 6),
    healthLeave: round(healthLeave, 6),
    otherLeave: round(otherLeave, 6),
    autoHolidays: cfg.absences.useHolidayCalendar,
  };
}

export function calcCategory(project: Project, key: CategoryKey): CategoryResult {
  const cfg = project.categories[key];
  const { weeksPerYear, daysPerWeek, hoursPerDay } = project.settings;
  const abs = effectiveAbsences(project, key);

  const daysAvailable = n(weeksPerYear) * n(daysPerWeek);
  const daysWorked = Math.max(
    0,
    daysAvailable - abs.holidays - abs.vacation - abs.healthLeave - abs.otherLeave,
  );
  const ttdHours = daysWorked * n(hoursPerDay);

  const directHours = PROCEDURES.reduce((sum, p) => {
    return sum + Math.max(0, n(cfg.production[p.key])) * Math.max(0, n(cfg.directTimes[p.key]));
  }, 0);

  const indirectPct = INDIRECT_ITEMS.reduce(
    (sum, item) => sum + Math.max(0, n(cfg.indirect[item.key])),
    0,
  );

  const directRequired = ttdHours > 0 ? directHours / ttdHours : 0;
  const factor = indirectPct < 95 ? 1 - indirectPct / 100 : 0;
  const required = factor > 0 ? directRequired / factor : 0;
  const current = currentStaff(project, key);
  const balance = current - required;
  const ratio = required > 0 ? current / required : 0;
  const counts = countTeam(project, key);

  let pressure: CategoryResult['pressure'] = 'empty';
  if (directHours > 0 && ttdHours > 0 && factor > 0) {
    if (ratio >= 1.15) pressure = 'surplus';
    else if (ratio >= 0.95) pressure = 'balanced';
    else if (ratio >= 0.85) pressure = 'attention';
    else pressure = 'deficit';
  }

  return {
    key,
    daysAvailable: round(daysAvailable, 4),
    daysWorked: round(daysWorked, 6),
    ttdHours: round(ttdHours, 6),
    absences: abs,
    directHours: round(directHours, 6),
    directRequired: round(directRequired, 8),
    indirectPct: round(indirectPct, 6),
    required: round(required, 8),
    suggested: Math.ceil(required - 1e-9),
    current,
    balance: round(balance, 8),
    ratio: round(ratio, 8),
    pressure,
    active: counts.active,
    onLeave: counts.onLeave,
    inactive: counts.inactive,
  };
}

export function calcProject(project: Project): ProjectResult {
  const enf = calcCategory(project, 'enf');
  const tec = calcCategory(project, 'tec');
  return {
    enf,
    tec,
    hasProduction: enf.directHours + tec.directHours > 0,
    totalCurrent: enf.current + tec.current,
    totalRequired: round(enf.required + tec.required, 2),
  };
}

export function officialStatus(balance: number): 'EQUILÍBRIO' | 'DÉFICIT' {
  return balance >= 0 ? 'EQUILÍBRIO' : 'DÉFICIT';
}

export function pressureLabel(p: CategoryResult['pressure']): string {
  switch (p) {
    case 'surplus':
      return 'Com folga';
    case 'balanced':
      return 'Equilibrado';
    case 'attention':
      return 'Atenção';
    case 'deficit':
      return 'Déficit';
    default:
      return 'Sem produção';
  }
}

export function pressureHint(p: CategoryResult['pressure']): string {
  switch (p) {
    case 'surplus':
      return 'A equipe atual cobre a carga de trabalho com folga.';
    case 'balanced':
      return 'A equipe atual está próxima do necessário.';
    case 'attention':
      return 'A equipe está um pouco abaixo do necessário; acompanhe faltas e produção.';
    case 'deficit':
      return 'A equipe atual não cobre a carga de trabalho prevista.';
    default:
      return 'Informe a produção anual para calcular.';
  }
}

export function exportSheetNames(project: Project): { enf: string; tec: string; evaluation: string } {
  const tag = (project.periodTag || project.periodLabel || '')
    .replace(/[^0-9A-Za-z]/g, '')
    .slice(0, 12) || '20252026';
  const enf = `DIMENSIONAMENTO -ENF - ${tag}`.slice(0, 31);
  const tec = `DIMENSIONAMENTO - ${tag} - T.`.slice(0, 31);
  const evaluation = `AVALIAÇÃO DIM. - ${tag}`.slice(0, 31);
  return { enf, tec, evaluation };
}
