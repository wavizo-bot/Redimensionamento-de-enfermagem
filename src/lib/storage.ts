import type { Absences, CategoryConfig, CategoryKey, Project, Workspace } from '../types';
import {
  DEFAULT_DIRECT_TIMES,
  DEFAULT_INDIRECT,
  emptyRecord,
  INDIRECT_ITEMS,
  makeCategory,
  makeProject,
  makeWorkspace,
  PROCEDURES,
} from './defaults';
import { n } from './calc';

const KEY = 'dimensionamento-enfermagem:workspace:v1';

export function loadWorkspace(): Workspace | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return normalizeWorkspace(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveWorkspace(ws: Workspace): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ws));
  } catch {
    // Sem espaço ou armazenamento bloqueado: o app continua funcionando na sessão.
  }
}

export function clearWorkspace(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function normalizeWorkspace(input: unknown): Workspace {
  const base = makeWorkspace();
  if (!input || typeof input !== 'object') return base;
  const raw = input as Partial<Workspace>;
  const projects = Array.isArray(raw.projects)
    ? raw.projects.filter(Boolean).map((p) => normalizeProject(p as Partial<Project>))
    : [];
  const active =
    raw.activeProjectId && projects.some((p) => p.id === raw.activeProjectId)
      ? raw.activeProjectId
      : projects[0]?.id ?? null;
  return {
    schema: 1,
    projects,
    activeProjectId: active,
    sync: {
      lastSyncedAt: typeof raw.sync?.lastSyncedAt === 'number' ? raw.sync.lastSyncedAt : null,
      lastSyncedHash: typeof raw.sync?.lastSyncedHash === 'string' ? raw.sync.lastSyncedHash : null,
      remoteModifiedTime:
        typeof raw.sync?.remoteModifiedTime === 'number' ? raw.sync.remoteModifiedTime : null,
    },
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

export function normalizeProject(input: Partial<Project>): Project {
  const fallback = makeProject();
  const p: Project = {
    ...fallback,
    ...input,
    id: input.id || fallback.id,
    settings: { ...fallback.settings, ...(input.settings ?? {}) },
    categories: {
      enf: normalizeCategory('enf', input.categories?.enf),
      tec: normalizeCategory('tec', input.categories?.tec),
    },
    team: Array.isArray(input.team) ? input.team : [],
    absenceRecords: Array.isArray(input.absenceRecords) ? input.absenceRecords : [],
    teamMode: input.teamMode === 'count' ? 'count' : 'list',
    createdAt: input.createdAt || fallback.createdAt,
    updatedAt: input.updatedAt || fallback.updatedAt,
  };
  p.periodTag = p.periodTag || p.periodLabel.replace(/[^0-9]/g, '');
  return p;
}

function normalizeCategory(key: CategoryKey, input?: Partial<CategoryConfig>): CategoryConfig {
  const fallback = makeCategory(key);
  const absences: Absences = {
    ...fallback.absences,
    ...(input?.absences ?? {}),
    mode: input?.absences?.mode === 'detail' ? 'detail' : 'average',
    useHolidayCalendar: input?.absences?.useHolidayCalendar !== false,
  };
  const production = { ...emptyRecord(PROCEDURES.map((p) => p.key)), ...(input?.production ?? {}) };
  const directTimes = { ...DEFAULT_DIRECT_TIMES[key], ...(input?.directTimes ?? {}) };
  const indirect = { ...emptyRecord(INDIRECT_ITEMS.map((i) => i.key)), ...DEFAULT_INDIRECT[key], ...(input?.indirect ?? {}) };
  PROCEDURES.forEach((p) => {
    production[p.key] = n(production[p.key]);
    directTimes[p.key] = n(directTimes[p.key]);
  });
  INDIRECT_ITEMS.forEach((i) => {
    indirect[i.key] = n(indirect[i.key]);
  });
  return {
    production,
    directTimes,
    indirect,
    absences,
    staffCount: n(input?.staffCount),
  };
}
