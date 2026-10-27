export type CategoryKey = 'enf' | 'tec';

export type Role = 'Enfermeiro' | 'Técnico de Enfermagem' | 'Auxiliar de Enfermagem';

export type MemberStatus = 'active' | 'leave' | 'inactive';

export type AbsenceType = 'health' | 'vacation' | 'other';

export interface ProcedureDef {
  key: string;
  name: string;
  short: string;
}

export interface IndirectDef {
  key: string;
  name: string;
}

export interface Absences {
  /** 0 = usar a contagem automática do calendário nacional */
  holidays: number;
  vacation: number;
  healthLeave: number;
  otherLeave: number;
  useHolidayCalendar: boolean;
  mode: 'average' | 'detail';
}

export interface CategoryConfig {
  production: Record<string, number>;
  directTimes: Record<string, number>;
  indirect: Record<string, number>;
  absences: Absences;
  /** usado quando o modo de equipe é "count" */
  staffCount: number;
}

export interface TeamMember {
  id: string;
  name: string;
  role: Role;
  status: MemberStatus;
  weeklyHours: number;
  note: string;
}

export interface AbsenceRecord {
  id: string;
  memberId: string;
  type: AbsenceType;
  startDate: string;
  days: number;
  note: string;
}

export interface ProjectSettings {
  weeksPerYear: number;
  daysPerWeek: number;
  hoursPerDay: number;
}

export interface Project {
  id: string;
  unitName: string;
  city: string;
  periodLabel: string;
  periodTag: string;
  startDate: string;
  endDate: string;
  settings: ProjectSettings;
  teamMode: 'list' | 'count';
  categories: Record<CategoryKey, CategoryConfig>;
  team: TeamMember[];
  absenceRecords: AbsenceRecord[];
  notes: string;
  responsibleName: string;
  responsibleCoren: string;
  signatureCity: string;
  signatureDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncInfo {
  lastSyncedAt: number | null;
  lastSyncedHash: string | null;
  remoteModifiedTime: number | null;
}

export interface Workspace {
  schema: 1;
  projects: Project[];
  activeProjectId: string | null;
  sync: SyncInfo;
  updatedAt: string;
}

export interface AbsenceValues {
  holidays: number;
  vacation: number;
  healthLeave: number;
  otherLeave: number;
  autoHolidays: boolean;
}

export interface CategoryResult {
  key: CategoryKey;
  daysAvailable: number;
  daysWorked: number;
  ttdHours: number;
  absences: AbsenceValues;
  directHours: number;
  directRequired: number;
  indirectPct: number;
  required: number;
  suggested: number;
  current: number;
  balance: number;
  ratio: number;
  pressure: 'deficit' | 'attention' | 'balanced' | 'surplus' | 'empty';
  active: number;
  onLeave: number;
  inactive: number;
}

export interface ProjectResult {
  enf: CategoryResult;
  tec: CategoryResult;
  hasProduction: boolean;
  totalCurrent: number;
  totalRequired: number;
}
