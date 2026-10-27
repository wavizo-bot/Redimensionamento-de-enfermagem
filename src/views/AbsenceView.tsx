import { useState } from 'react';
import type { AbsenceRecord, AbsenceType, CategoryKey, Project } from '../types';
import { CATEGORY_LABEL, PROCEDURES, makeMember, nationalHolidays, uid } from '../lib/defaults';
import { calcCategory, effectiveAbsences, memberCategory, n } from '../lib/calc';
import { Icon } from '../components/Icons';
import { Help, NumberField } from '../components/ui';

const TYPE_LABEL: Record<AbsenceType, string> = {
  health: 'Licença de saúde',
  vacation: 'Férias',
  other: 'Outra licença',
};

export function AbsenceView({
  project,
  onPatch,
  onNext,
  onBack,
  onGoTeam,
}: {
  project: Project;
  onPatch: (patch: Partial<Project>) => void;
  onNext: () => void;
  onBack: () => void;
  onGoTeam: () => void;
}) {
  const [tab, setTab] = useState<CategoryKey>('enf');
  const cfg = project.categories[tab];
  const abs = effectiveAbsences(project, tab);
  const res = calcCategory(project, tab);
  const detail = cfg.absences.mode === 'detail';
  const autoHolidays = cfg.absences.useHolidayCalendar;
  const holidaysFromCalendar = nationalHolidays(project.startDate, project.endDate);

  const patchAbsences = (patch: Partial<typeof cfg.absences>) =>
    onPatch({
      categories: { ...project.categories, [tab]: { ...cfg, absences: { ...cfg.absences, ...patch } } },
    });

  const members = project.team.filter((m) => memberCategory(m) === tab);
  const records = project.absenceRecords.filter((r) => {
    const m = project.team.find((x) => x.id === r.memberId);
    return m ? memberCategory(m) === tab : false;
  });

  const setRecord = (id: string, patch: Partial<AbsenceRecord>) =>
    onPatch({
      absenceRecords: project.absenceRecords.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  const addRecord = () => {
    const member =
      members[0] ??
      makeMember({
        name: tab === 'enf' ? 'Enfermeiro(a)' : 'Técnico(a)/Auxiliar',
        role: tab === 'enf' ? 'Enfermeiro' : 'Técnico de Enfermagem',
      });
    const team = members.length > 0 ? project.team : [...project.team, member];
    onPatch({
      team,
      absenceRecords: [
        ...project.absenceRecords,
        {
          id: uid(),
          memberId: member.id,
          type: 'health',
          startDate: project.startDate || new Date().toISOString().slice(0, 10),
          days: 1,
          note: '',
        },
      ],
    });
  };
  const removeRecord = (id: string) =>
    onPatch({ absenceRecords: project.absenceRecords.filter((r) => r.id !== id) });

  const totals = {
    vacation: records.filter((r) => r.type === 'vacation').reduce((s, r) => s + n(r.days), 0),
    health: records.filter((r) => r.type === 'health').reduce((s, r) => s + n(r.days), 0),
    other: records.filter((r) => r.type === 'other').reduce((s, r) => s + n(r.days), 0),
  };

  const daysAvailable = project.settings.weeksPerYear * project.settings.daysPerWeek;
  const ttdZero = res.daysWorked <= 0;

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <span className="step-label">Etapa 4 de 5</span>
          <h2>Férias, licenças e feriados</h2>
          <p className="muted">
            As ausências reduzem o tempo disponível de cada profissional. Se você não registrar nada,
            o aplicativo presume que o dia foi trabalhado — então só lance o que realmente aconteceu.
          </p>
        </div>
        <div className="mini-result">
          <span>Tempo disponível — {CATEGORY_LABEL[tab]}</span>
          <strong>{res.daysWorked.toFixed(1)}</strong>
          <em>dias por profissional</em>
        </div>
      </header>

      <div className="production-switch">
        <div className="segmented">
          {(['enf', 'tec'] as CategoryKey[]).map((key) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {CATEGORY_LABEL[key]}
              <span className="seg-badge">{calcCategory(project, key).ttdHours.toFixed(0)} h</span>
            </button>
          ))}
        </div>
        <div className="segmented segmented-small">
          <button className={!detail ? 'active' : ''} onClick={() => patchAbsences({ mode: 'average' })}>
            Média por profissional
          </button>
          <button className={detail ? 'active' : ''} onClick={() => patchAbsences({ mode: 'detail' })}>
            Lançar ausências
          </button>
        </div>
      </div>

      <div className="grid-2 absence-grid">
        <section className="card">
          <div className="card-head">
            <div>
              <h3>{detail ? 'Ausências lançadas' : 'Média de dias por profissional'}</h3>
              <p className="muted small">
                {detail
                  ? 'Some os dias de todos os profissionais da categoria e divida pelo número de profissionais.'
                  : 'Use os valores que você já tem na planilha. Pode deixar zerado o que não houver.'}
              </p>
            </div>
          </div>

          {detail ? (
            <>
              <div className="absence-totals">
                <div>
                  <span>Férias</span>
                  <strong>{totals.vacation.toFixed(1)} dias</strong>
                  <em>total da equipe</em>
                </div>
                <div>
                  <span>Licença de saúde</span>
                  <strong>{totals.health.toFixed(1)} dias</strong>
                  <em>total da equipe</em>
                </div>
                <div>
                  <span>Outras licenças</span>
                  <strong>{totals.other.toFixed(1)} dias</strong>
                  <em>total da equipe</em>
                </div>
              </div>

              <div className="detail-toggle">
                <button className="btn btn-small btn-ghost" onClick={() => patchAbsences({ mode: 'average' })}>
                  Prefiro informar a média
                </button>
              </div>

              {project.teamMode === 'count' ? (
                <div className="callout callout-warn">
                  <Icon name="alert" />
                  <div>
                    <strong>Para lançar por pessoa, use a lista de nomes</strong>
                    <p>
                      No modo “só a quantidade” não há como identificar quem ficou ausente. Você pode
                      continuar usando a média por profissional ou{' '}
                      <button className="link" onClick={onGoTeam}>
                        ativar a lista de nomes
                      </button>
                      .
                    </p>
                  </div>
                </div>
              ) : null}

              {members.length === 0 ? (
                <div className="empty-inline">
                  <p>Nenhum profissional desta categoria cadastrado.</p>
                  <button className="btn btn-small btn-ghost" onClick={addRecord}>
                    <Icon name="plus" size={15} /> Lançar uma ausência
                  </button>
                </div>
              ) : (
                <>
                  <div className="absence-list">
                    {records.length === 0 ? (
                      <p className="muted small">
                        Nenhuma ausência lançada. Todo o período será considerado como presença.
                      </p>
                    ) : (
                      records.map((r) => (
                        <div className="absence-row" key={r.id}>
                          <select
                            className="input"
                            value={r.memberId}
                            onChange={(e) => setRecord(r.id, { memberId: e.target.value })}
                            aria-label="Profissional"
                          >
                            {members.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name || 'Sem nome'}
                              </option>
                            ))}
                          </select>
                          <select
                            className="input"
                            value={r.type}
                            onChange={(e) => setRecord(r.id, { type: e.target.value as AbsenceType })}
                            aria-label="Tipo de ausência"
                          >
                            {(Object.keys(TYPE_LABEL) as AbsenceType[]).map((t) => (
                              <option key={t} value={t}>
                                {TYPE_LABEL[t]}
                              </option>
                            ))}
                          </select>
                          <input
                            type="date"
                            className="input"
                            value={r.startDate}
                            onChange={(e) => setRecord(r.id, { startDate: e.target.value })}
                            aria-label="Início"
                          />
                          <NumberField
                            value={r.days}
                            onChange={(v) => setRecord(r.id, { days: v })}
                            min={0}
                            max={366}
                            suffix="dias"
                            ariaLabel="Dias de ausência"
                          />
                          <button
                            className="icon-btn danger"
                            onClick={() => removeRecord(r.id)}
                            title="Remover"
                            aria-label="Remover ausência"
                          >
                            <Icon name="trash" size={17} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <button className="btn btn-small btn-ghost" onClick={addRecord}>
                    <Icon name="plus" size={15} /> Adicionar ausência
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="stack">
              <div className="holiday-toggle">
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={autoHolidays}
                    onChange={(e) => patchAbsences({ useHolidayCalendar: e.target.checked })}
                  />
                  <span>
                    <strong>Contar feriados nacionais automaticamente</strong>
                    <em>
                      {autoHolidays
                        ? `${holidaysFromCalendar} feriado(s) em dias úteis no período informado`
                        : 'Informe manualmente a quantidade de feriados'}
                    </em>
                  </span>
                </label>
              </div>

              <div className="grid-2 tight">
                <label className="field">
                  <span className="field-label">
                    Feriados (dias)
                    {!autoHolidays ? <Help>Conte apenas os feriados que caem em dias de trabalho.</Help> : null}
                  </span>
                  {autoHolidays ? (
                    <div className="readonly-value">{abs.holidays.toFixed(1)} dias (automático)</div>
                  ) : (
                    <NumberField
                      value={cfg.absences.holidays}
                      onChange={(v) => patchAbsences({ holidays: v })}
                      min={0}
                      max={366}
                      suffix="dias"
                      ariaLabel="Dias de feriado"
                    />
                  )}
                </label>
                <label className="field">
                  <span className="field-label">Férias (média por profissional)</span>
                  <NumberField
                    value={cfg.absences.vacation}
                    onChange={(v) => patchAbsences({ vacation: v })}
                    min={0}
                    max={366}
                    suffix="dias"
                    ariaLabel="Dias de férias"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Licença de saúde (média)</span>
                  <NumberField
                    value={cfg.absences.healthLeave}
                    onChange={(v) => patchAbsences({ healthLeave: v })}
                    min={0}
                    max={366}
                    suffix="dias"
                    ariaLabel="Dias de licença de saúde"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Outras licenças (média)</span>
                  <NumberField
                    value={cfg.absences.otherLeave}
                    onChange={(v) => patchAbsences({ otherLeave: v })}
                    min={0}
                    max={366}
                    suffix="dias"
                    ariaLabel="Dias de outras licenças"
                  />
                </label>
              </div>

              <div className="callout callout-info">
                <Icon name="info" />
                <div>
                  <strong>Como preencher</strong>
                  <p>
                    Use a média por profissional. Por exemplo: 30 dias de férias por ano para cada um,
                    ou o total de dias de atestado dividido pelo número de profissionais.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="card ttd-card">
          <div className="card-head">
            <div>
              <h3>Tempo de trabalho disponível</h3>
              <p className="muted small">Cálculo do TTD para {CATEGORY_LABEL[tab]}.</p>
            </div>
            <span className="pill pill-info">{res.ttdHours.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} h/ano</span>
          </div>

          <div className="ttd-table">
            <div className="ttd-line">
              <span>Dias previstos ({project.settings.weeksPerYear} sem. × {project.settings.daysPerWeek} dias)</span>
              <strong>{daysAvailable.toFixed(0)}</strong>
            </div>
            <div className="ttd-line minus">
              <span>Feriados</span>
              <strong>− {abs.holidays.toFixed(1)}</strong>
            </div>
            <div className="ttd-line minus">
              <span>Férias</span>
              <strong>− {abs.vacation.toFixed(1)}</strong>
            </div>
            <div className="ttd-line minus">
              <span>Licença de saúde</span>
              <strong>− {abs.healthLeave.toFixed(1)}</strong>
            </div>
            <div className="ttd-line minus">
              <span>Outras licenças</span>
              <strong>− {abs.otherLeave.toFixed(1)}</strong>
            </div>
            <div className="ttd-line total">
              <span>Dias trabalhados por ano</span>
              <strong>{res.daysWorked.toFixed(1)}</strong>
            </div>
            <div className="ttd-line">
              <span>Jornada diária</span>
              <strong>{project.settings.hoursPerDay.toFixed(0)} h</strong>
            </div>
            <div className="ttd-line result">
              <span>TTD — horas por ano</span>
              <strong>{res.ttdHours.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} h</strong>
            </div>
          </div>

          {ttdZero ? (
            <p className="error-text">
              As ausências consomem todos os dias do ano. Revise os valores para o cálculo funcionar.
            </p>
          ) : (
            <p className="table-note">
              Equivale a {PROCEDURES.length} tipos de procedimento e a todas as atividades indiretas do
              período.
            </p>
          )}
        </section>
      </div>

      <div className="view-nav">
        <button className="btn btn-ghost" onClick={onBack}>
          <Icon name="arrowLeft" size={17} /> Voltar
        </button>
        <button className="btn btn-primary" onClick={onNext}>
          Ver o resultado <Icon name="arrowRight" size={17} />
        </button>
      </div>
    </div>
  );
}
