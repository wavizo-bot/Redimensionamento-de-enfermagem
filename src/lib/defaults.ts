import type {
  Absences,
  CategoryConfig,
  CategoryKey,
  IndirectDef,
  ProcedureDef,
  Project,
  Role,
  TeamMember,
  Workspace,
} from '../types';

export const PROCEDURES: ProcedureDef[] = [
  { key: 'demanda', name: 'Atendimento à demanda espontânea', short: 'Demanda espontânea' },
  { key: 'consulta', name: 'Consulta', short: 'Consulta' },
  { key: 'medicamentos', name: 'Administração de medicamentos', short: 'Medicamentos' },
  { key: 'exames', name: 'Assistência em exames', short: 'Exames' },
  { key: 'ambulatoriais', name: 'Procedimentos ambulatoriais', short: 'Proced. ambulatoriais' },
  { key: 'imunizacoes', name: 'Controle de imunizações', short: 'Imunizações' },
  { key: 'sinais', name: 'Sinais vitais e medidas antropométricas', short: 'Sinais vitais' },
  { key: 'puncao', name: 'Punção venosa: amostra de sangue', short: 'Punção venosa' },
  { key: 'visita', name: 'Visita domiciliar', short: 'Visita domiciliar' },
  { key: 'educacao', name: 'Promoção de ações educativas', short: 'Ações educativas' },
];

export const INDIRECT_ITEMS: IndirectDef[] = [
  { key: 'educacao_trabalhadores', name: 'Ações educativas dos trabalhadores de saúde' },
  { key: 'controle_infeccao', name: 'Controle de infecção' },
  { key: 'suprimentos', name: 'Controle de suprimentos' },
  { key: 'organizacao', name: 'Organização do processo de trabalho' },
  { key: 'documentacao', name: 'Documentação' },
  { key: 'laboratorio', name: 'Interpretação de dados laboratoriais' },
  { key: 'territorio', name: 'Mapeamento e territorialização' },
  { key: 'referencia', name: 'Referência e contrarreferência' },
  { key: 'reuniao_admin', name: 'Reunião administrativa' },
  { key: 'reuniao_cuidados', name: 'Reunião para avaliação dos cuidados profissionais' },
  { key: 'supervisao', name: 'Supervisão dos trabalhos da unidade' },
  { key: 'troca_info', name: 'Troca de informação sobre cuidados de saúde' },
  { key: 'vigilancia', name: 'Vigilância em saúde' },
  { key: 'ocasionais', name: 'Ocasionais indiretas' },
];

export const DEFAULT_DIRECT_TIMES: Record<CategoryKey, Record<string, number>> = {
  enf: {
    demanda: 0.39,
    consulta: 0.42,
    medicamentos: 0.21,
    exames: 0.31,
    ambulatoriais: 0.32,
    imunizacoes: 0.42,
    sinais: 0.2,
    puncao: 0.31,
    visita: 0.59,
    educacao: 0.47,
  },
  tec: {
    demanda: 0.54,
    consulta: 0,
    medicamentos: 0.22,
    exames: 0.38,
    ambulatoriais: 0.46,
    imunizacoes: 0.51,
    sinais: 0.22,
    puncao: 0.21,
    visita: 0.79,
    educacao: 0.46,
  },
};

export const DEFAULT_INDIRECT: Record<CategoryKey, Record<string, number>> = {
  enf: {
    educacao_trabalhadores: 2.1,
    controle_infeccao: 0.1,
    suprimentos: 0.5,
    organizacao: 3.7,
    documentacao: 12.4,
    laboratorio: 0.2,
    territorio: 0.1,
    referencia: 0.3,
    reuniao_admin: 5.9,
    reuniao_cuidados: 1.9,
    supervisao: 0.4,
    troca_info: 6.2,
    vigilancia: 1.3,
    ocasionais: 10.5,
  },
  tec: {
    educacao_trabalhadores: 1.4,
    controle_infeccao: 1.5,
    suprimentos: 3.7,
    organizacao: 1.0,
    documentacao: 9.5,
    laboratorio: 0.1,
    territorio: 0,
    referencia: 0.3,
    reuniao_admin: 1.5,
    reuniao_cuidados: 1.0,
    supervisao: 0,
    troca_info: 3.0,
    vigilancia: 0.4,
    ocasionais: 18.8,
  },
};

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  enf: 'Enfermeiros',
  tec: 'Técnicos e auxiliares de enfermagem',
};

export const CATEGORY_SHORT: Record<CategoryKey, string> = {
  enf: 'Enfermeiro(a)',
  tec: 'Técnico(a) / Auxiliar',
};

export const ROLE_CATEGORY: Record<Role, CategoryKey> = {
  Enfermeiro: 'enf',
  'Técnico de Enfermagem': 'tec',
  'Auxiliar de Enfermagem': 'tec',
};

export const ROLES: Role[] = ['Enfermeiro', 'Técnico de Enfermagem', 'Auxiliar de Enfermagem'];

export const emptyRecord = (keys: string[]): Record<string, number> =>
  Object.fromEntries(keys.map((k) => [k, 0]));

export const uid = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
};

export const defaultAbsences = (): Absences => ({
  holidays: 0,
  vacation: 30,
  healthLeave: 0,
  otherLeave: 0,
  useHolidayCalendar: true,
  mode: 'average',
});

export const makeCategory = (key: CategoryKey): CategoryConfig => ({
  production: emptyRecord(PROCEDURES.map((p) => p.key)),
  directTimes: { ...DEFAULT_DIRECT_TIMES[key] },
  indirect: { ...DEFAULT_INDIRECT[key] },
  absences: defaultAbsences(),
  staffCount: 0,
});

export const isoDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const makeProject = (partial: Partial<Project> = {}): Project => {
  const now = new Date();
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const start = `${year}-08-01`;
  const end = `${year + 1}-07-31`;
  const project: Project = {
    id: uid(),
    unitName: '',
    city: '',
    periodLabel: `${year}/${year + 1}`,
    periodTag: `${year}${year + 1}`,
    startDate: start,
    endDate: end,
    settings: { weeksPerYear: 52, daysPerWeek: 5, hoursPerDay: 8 },
    teamMode: 'list',
    categories: { enf: makeCategory('enf'), tec: makeCategory('tec') },
    team: [],
    absenceRecords: [],
    notes: '',
    responsibleName: '',
    responsibleCoren: '',
    signatureCity: '',
    signatureDate: isoDate(now),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    partialOrigin: null,
  };
  return { ...project, ...partial };
};

export const makeMember = (partial: Partial<TeamMember> = {}): TeamMember => ({
  id: uid(),
  name: '',
  role: 'Enfermeiro',
  status: 'active',
  weeklyHours: 40,
  note: '',
  ...partial,
});

export const makeWorkspace = (): Workspace => ({
  schema: 1,
  projects: [],
  activeProjectId: null,
  sync: { lastSyncedAt: null, lastSyncedHash: null, remoteModifiedTime: null },
  updatedAt: new Date().toISOString(),
});

/** Feriados nacionais brasileiros entre duas datas (somente dias úteis). */
export function nationalHolidays(startISO: string, endISO: string): number {
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  if (!start || !end || end < start) return 0;
  const set = new Set<string>();
  for (let y = start.getFullYear(); y <= end.getFullYear(); y += 1) {
    const easter = easterSunday(y);
    const add = (d: Date) => set.add(isoDate(d));
    add(new Date(y, 0, 1));
    add(new Date(y, 3, 21));
    add(new Date(y, 4, 1));
    add(new Date(y, 8, 7));
    add(new Date(y, 9, 12));
    add(new Date(y, 10, 2));
    add(new Date(y, 10, 15));
    add(new Date(y, 10, 20));
    add(new Date(y, 11, 25));
    add(addDays(easter, -48)); // Carnaval (segunda)
    add(addDays(easter, -47)); // Carnaval (terça)
    add(addDays(easter, -2)); // Sexta-feira da Paixão
    add(addDays(easter, 60)); // Corpus Christi
  }
  let count = 0;
  set.forEach((iso) => {
    const d = parseISO(iso);
    if (!d || d < start || d > end) return;
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count += 1;
  });
  return count;
}

function parseISO(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Projeto de exemplo, sem dados de nenhuma unidade real. */
export function makeDemoProject(): Project {
  const p = makeProject({
    unitName: 'Unidade Jardim das Flores',
    city: 'Cidade Exemplo',
    periodLabel: '2025/2026',
    periodTag: '20252026',
    startDate: '2025-08-01',
    endDate: '2026-07-31',
    signatureCity: 'Cidade Exemplo',
    responsibleName: 'Ana Ribeiro',
    responsibleCoren: 'COREN-SP 000.000',
    notes: 'Exemplo para demonstração. Substitua pelos dados da sua unidade.',
  });
  p.team = [
    makeMember({ name: 'Ana Ribeiro', role: 'Enfermeiro' }),
    makeMember({ name: 'Bianca Souza', role: 'Enfermeiro' }),
    makeMember({ name: 'Carla Mendes', role: 'Enfermeiro' }),
    makeMember({ name: 'Daniela Alves', role: 'Enfermeiro' }),
    makeMember({ name: 'Eduarda Lima', role: 'Técnico de Enfermagem' }),
    makeMember({ name: 'Fernanda Rocha', role: 'Técnico de Enfermagem' }),
    makeMember({ name: 'Gabriela Nunes', role: 'Técnico de Enfermagem' }),
    makeMember({ name: 'Helena Prado', role: 'Auxiliar de Enfermagem' }),
    makeMember({ name: 'Isabela Freitas', role: 'Técnico de Enfermagem' }),
    makeMember({ name: 'Joana Castro', role: 'Técnico de Enfermagem' }),
    makeMember({ name: 'Karina Dias', role: 'Técnico de Enfermagem' }),
    makeMember({ name: 'Larissa Melo', role: 'Auxiliar de Enfermagem', status: 'leave', note: 'Afastamento de longa duração' }),
  ];
  p.categories.enf.production = {
    demanda: 506,
    consulta: 6888,
    medicamentos: 1,
    exames: 6,
    ambulatoriais: 774,
    imunizacoes: 0,
    sinais: 18,
    puncao: 4,
    visita: 124,
    educacao: 324,
  };
  p.categories.tec.production = {
    demanda: 811,
    consulta: 0,
    medicamentos: 3075,
    exames: 638,
    ambulatoriais: 2195,
    imunizacoes: 9766,
    sinais: 1866,
    puncao: 5248,
    visita: 57,
    educacao: 20,
  };
  p.categories.enf.absences = {
    holidays: 8,
    vacation: 17.6,
    healthLeave: 5.5,
    otherLeave: 0,
    useHolidayCalendar: false,
    mode: 'average',
  };
  p.categories.tec.absences = {
    holidays: 22,
    vacation: 12.5,
    healthLeave: 6.666666667,
    otherLeave: 17.6,
    useHolidayCalendar: false,
    mode: 'average',
  };
  return p;
}
