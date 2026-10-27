import type { Project } from '../types';
import { effectiveAbsences } from '../lib/calc';
import { Field, Help, NumberField } from '../components/ui';
import { Icon } from '../components/Icons';

export function SetupView({
  project,
  onPatch,
  onNext,
}: {
  project: Project;
  onPatch: (patch: Partial<Project>) => void;
  onNext: () => void;
}) {
  const s = project.settings;
  const days = s.weeksPerYear * s.daysPerWeek;
  const absEnf = effectiveAbsences(project, 'enf');
  const absTec = effectiveAbsences(project, 'tec');
  const ttd = (a: typeof absEnf, h: number) =>
    Math.max(0, days - a.holidays - a.vacation - a.healthLeave - a.otherLeave) * h;

  const updatePeriod = (label: string) => {
    const digits = label.replace(/[^0-9]/g, '');
    const patch: Partial<Project> = { periodLabel: label };
    if (digits.length >= 8) {
      patch.periodTag = digits.slice(0, 8);
      const y1 = digits.slice(0, 4);
      const y2 = digits.slice(4, 8);
      if (/^20\d{2}$/.test(y1) && /^20\d{2}$/.test(y2)) {
        patch.startDate = `${y1}-08-01`;
        patch.endDate = `${y2}-07-31`;
      }
    }
    onPatch(patch);
  };

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <span className="step-label">Etapa 1 de 5</span>
          <h2>Unidade e jornada</h2>
          <p className="muted">
            Esses dados aparecem no resultado e no Excel exportado. Só o nome da unidade é opcional —
            os números da jornada mudam o cálculo.
          </p>
        </div>
      </header>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h3>Identificação</h3>
          </div>
          <div className="stack">
            <Field
              label="Nome da unidade"
              help="Pode ser o nome da unidade, do serviço ou um apelido. Não usamos esse nome para nada além do seu próprio arquivo."
            >
              <input
                className="input"
                value={project.unitName}
                onChange={(e) => onPatch({ unitName: e.target.value })}
                placeholder="Ex.: Unidade Jardim das Flores"
              />
            </Field>
            <Field label="Cidade">
              <input
                className="input"
                value={project.city}
                onChange={(e) => onPatch({ city: e.target.value })}
                placeholder="Ex.: Campinas"
              />
            </Field>
            <div className="grid-2 tight">
              <Field label="Período" help="Use o mesmo período da planilha oficial. O rótulo aparece nas abas exportadas.">
                <input
                  className="input"
                  value={project.periodLabel}
                  onChange={(e) => updatePeriod(e.target.value)}
                  placeholder="2025/2026"
                />
              </Field>
              <Field label="Código do período" help="Somente números, sem barra. Usado no nome das abas do Excel.">
                <input
                  className="input"
                  value={project.periodTag}
                  onChange={(e) => onPatch({ periodTag: e.target.value.replace(/[^0-9]/g, '').slice(0, 12) })}
                  placeholder="20252026"
                />
              </Field>
            </div>
            <div className="grid-2 tight">
              <Field label="Início do período">
                <input
                  type="date"
                  className="input"
                  value={project.startDate}
                  onChange={(e) => onPatch({ startDate: e.target.value })}
                />
              </Field>
              <Field label="Fim do período">
                <input
                  type="date"
                  className="input"
                  value={project.endDate}
                  onChange={(e) => onPatch({ endDate: e.target.value })}
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Jornada de trabalho</h3>
            <Help>
              O TTD (Tempo de Trabalho Disponível) é quantas horas por ano cada profissional
              realmente tem para trabalhar, depois de descontar feriados, férias e licenças.
            </Help>
          </div>
          <div className="stack">
            <div className="grid-3 tight">
              <Field label="Semanas por ano">
                <NumberField
                  value={s.weeksPerYear}
                  onChange={(v) => onPatch({ settings: { ...s, weeksPerYear: v } })}
                  min={1}
                  max={53}
                  suffix="sem."
                />
              </Field>
              <Field label="Dias por semana">
                <NumberField
                  value={s.daysPerWeek}
                  onChange={(v) => onPatch({ settings: { ...s, daysPerWeek: v } })}
                  min={1}
                  max={7}
                  suffix="dias"
                />
              </Field>
              <Field label="Horas por dia">
                <NumberField
                  value={s.hoursPerDay}
                  onChange={(v) => onPatch({ settings: { ...s, hoursPerDay: v } })}
                  min={1}
                  max={24}
                  suffix="h"
                />
              </Field>
            </div>

            <div className="tdd-box">
              <div className="tdd-row">
                <span>Dias disponíveis por ano</span>
                <strong>{days.toFixed(0)} dias</strong>
              </div>
              <div className="tdd-row">
                <span>TTD — Enfermeiros</span>
                <strong>{ttd(absEnf, s.hoursPerDay).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} h/ano</strong>
              </div>
              <div className="tdd-row">
                <span>TTD — Técnicos/auxiliares</span>
                <strong>{ttd(absTec, s.hoursPerDay).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} h/ano</strong>
              </div>
              <p className="tdd-note">
                Já descontando as ausências preenchidas na etapa 4. Você pode ajustar as ausências
                depois.
              </p>
            </div>

            <div className="callout callout-info">
              <Icon name="info" />
              <div>
                <strong>Presunção que reduz o trabalho</strong>
                <p>
                  Todo dia que não for registrado como falta é contado como presença. Você só precisa
                  lançar o que realmente aconteceu.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h3>Responsável e assinatura</h3>
          <span className="muted small">Opcional — aparece no Excel e na impressão.</span>
        </div>
        <div className="grid-3">
          <Field label="Nome do responsável técnico">
            <input
              className="input"
              value={project.responsibleName}
              onChange={(e) => onPatch({ responsibleName: e.target.value })}
              placeholder="Nome e sobrenome"
            />
          </Field>
          <Field label="COREN">
            <input
              className="input"
              value={project.responsibleCoren}
              onChange={(e) => onPatch({ responsibleCoren: e.target.value })}
              placeholder="COREN-SP 000.000"
            />
          </Field>
          <div className="grid-2 tight">
            <Field label="Cidade da assinatura">
              <input
                className="input"
                value={project.signatureCity}
                onChange={(e) => onPatch({ signatureCity: e.target.value })}
                placeholder={project.city || 'Cidade'}
              />
            </Field>
            <Field label="Data">
              <input
                type="date"
                className="input"
                value={project.signatureDate}
                onChange={(e) => onPatch({ signatureDate: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </section>

      <div className="view-nav">
        <span />
        <button className="btn btn-primary" onClick={onNext}>
          Continuar para a equipe <Icon name="arrowRight" size={17} />
        </button>
      </div>
    </div>
  );
}
