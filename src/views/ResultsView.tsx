import { useState } from 'react';
import type { CategoryKey, CategoryResult, Project } from '../types';
import {
  CATEGORY_LABEL,
  INDIRECT_ITEMS,
  PROCEDURES,
} from '../lib/defaults';
import { calcProject, exportSheetNames, pressureHint, pressureLabel } from '../lib/calc';
import { exportProjectXlsx } from '../lib/exportXlsx';
import { Icon } from '../components/Icons';
import { Field } from '../components/ui';

function brl(v: number, digits = 2) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const pressureTone: Record<CategoryResult['pressure'], string> = {
  deficit: 'danger',
  attention: 'warn',
  balanced: 'ok',
  surplus: 'info',
  empty: 'neutral',
};

function CategoryCard({ res }: { res: CategoryResult }) {
  return (
    <article className={`result-card result-${res.pressure}`}>
      <header>
        <div>
          <span className="result-kicker">{CATEGORY_LABEL[res.key]}</span>
          <h3>
            {res.required > 0 ? (
              <>
                {brl(res.suggested, 0)} <small>profissionais sugeridos</small>
              </>
            ) : (
              <>
                Sem produção <small>informe os procedimentos</small>
              </>
            )}
          </h3>
        </div>
        <span className={`pill pill-${pressureTone[res.pressure]}`}>{pressureLabel(res.pressure)}</span>
      </header>

      <div className="result-numbers">
        <div>
          <span>Equipe atual</span>
          <strong>{brl(res.current, 0)}</strong>
        </div>
        <div>
          <span>Necessário (WISN)</span>
          <strong>{res.required > 0 ? brl(res.required) : '—'}</strong>
        </div>
        <div className={res.balance < 0 ? 'negative' : 'positive'}>
          <span>Saldo</span>
          <strong>
            {res.required > 0 ? `${res.balance > 0 ? '+' : ''}${brl(res.balance)}` : '—'}
          </strong>
        </div>
      </div>

      <div className="gauge" aria-hidden="true">
        <div className="gauge-track">
          <span style={{ width: `${Math.min(100, (res.ratio || 0) * 100)}%` }} />
        </div>
        <div className="gauge-labels">
          <span>0</span>
          <span>100% do necessário</span>
          <span>200%</span>
        </div>
      </div>

      <p className="result-hint">{pressureHint(res.pressure)}</p>
      <p className="result-ratio">
        A equipe atual representa <strong>{res.ratio > 0 ? `${brl(res.ratio * 100, 0)}%` : '—'}</strong> do
        quadro calculado.
      </p>
    </article>
  );
}

export function ResultsView({
  project,
  onPatch,
  onBack,
  onImport,
}: {
  project: Project;
  onPatch: (patch: Partial<Project>) => void;
  onBack: () => void;
  onImport: () => void;
}) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const result = calcProject(project);
  const names = exportSheetNames(project);
  const deficits = (['enf', 'tec'] as CategoryKey[])
    .map((k) => result[k])
    .filter((r) => r.required > 0 && r.balance < 0);

  const doExport = async () => {
    setState('working');
    setMessage('');
    try {
      const fileName = await exportProjectXlsx(project);
      setState('done');
      setMessage(`Arquivo gerado: ${fileName}`);
    } catch (e) {
      setState('error');
      setMessage(e instanceof Error ? e.message : 'Não foi possível gerar o arquivo.');
    }
  };

  const doPrint = () => {
    window.print();
  };

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <span className="step-label">Etapa 5 de 5</span>
          <h2>Resultado do dimensionamento</h2>
          <p className="muted">
            {project.unitName ? `${project.unitName} · ` : ''}
            {project.periodLabel} · método WISN/WPSN
          </p>
        </div>
        <div className="row-actions">
          <button className="btn btn-ghost" onClick={doPrint} title="Imprimir ou salvar em PDF">
            <Icon name="printer" size={17} /> Imprimir
          </button>
          <button className="btn btn-primary" onClick={doExport} disabled={state === 'working'}>
            <Icon name="download" size={17} /> {state === 'working' ? 'Gerando…' : 'Exportar Excel'}
          </button>
        </div>
      </header>

      {!result.hasProduction ? (
        <div className="callout callout-warn">
          <Icon name="alert" />
          <div>
            <strong>Ainda não há produção informada</strong>
            <p>
              Sem a quantidade de procedimentos o aplicativo não calcula o quadro necessário. Volte à
              etapa 3 ou{' '}
              <button className="link" onClick={onImport}>
                importe a planilha do Excel
              </button>
              .
            </p>
          </div>
        </div>
      ) : deficits.length > 0 ? (
        <div className="callout callout-warn">
          <Icon name="alert" />
          <div>
            <strong>Atenção ao quadro atual</strong>
            <p>
              {deficits
                .map(
                  (r) =>
                    `${CATEGORY_LABEL[r.key]}: faltam ${brl(Math.abs(r.balance))} profissional(is) para atender à carga de trabalho calculada.`,
                )
                .join(' ')}{' '}
              O resultado é uma referência de planejamento e deve ser avaliado pelo responsável técnico.
            </p>
          </div>
        </div>
      ) : (
        <div className="callout callout-ok">
          <Icon name="check" />
          <div>
            <strong>Quadro compatível com a carga de trabalho</strong>
            <p>
              Pelo método WISN/WPSN, a equipe atual cobre a produção informada no período. Revise
              periodicamente, porque a produção muda ao longo do ano.
            </p>
          </div>
        </div>
      )}

      <div className="result-grid">
        <CategoryCard res={result.enf} />
        <CategoryCard res={result.tec} />
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h3>Como o número foi calculado</h3>
          </div>
          <div className="table-wrap">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Enfermeiros</th>
                  <th className="num">Técnicos/aux.</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Horas de cuidado direto no ano</td>
                  <td className="num">{brl(result.enf.directHours, 1)}</td>
                  <td className="num">{brl(result.tec.directHours, 1)}</td>
                </tr>
                <tr>
                  <td>TTD — horas disponíveis por profissional</td>
                  <td className="num">{brl(result.enf.ttdHours, 1)}</td>
                  <td className="num">{brl(result.tec.ttdHours, 1)}</td>
                </tr>
                <tr>
                  <td>Cuidado direto necessário (horas ÷ TTD)</td>
                  <td className="num">{brl(result.enf.directRequired, 3)}</td>
                  <td className="num">{brl(result.tec.directRequired, 3)}</td>
                </tr>
                <tr>
                  <td>Cuidados indiretos</td>
                  <td className="num">{brl(result.enf.indirectPct, 1)}%</td>
                  <td className="num">{brl(result.tec.indirectPct, 1)}%</td>
                </tr>
                <tr className="row-strong">
                  <td>Quadro necessário</td>
                  <td className="num">{brl(result.enf.required)}</td>
                  <td className="num">{brl(result.tec.required)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="table-note">
            O saldo é a equipe atual menos o quadro necessário. Valores negativos indicam déficit.
          </p>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Ausências consideradas</h3>
          </div>
          <div className="table-wrap">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>Ausência (dias/profissional)</th>
                  <th className="num">Enfermeiros</th>
                  <th className="num">Técnicos/aux.</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Feriados', 'holidays'],
                    ['Férias', 'vacation'],
                    ['Licença de saúde', 'healthLeave'],
                    ['Outras licenças', 'otherLeave'],
                  ] as const
                ).map(([label, key]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td className="num">{brl(result.enf.absences[key], 1)}</td>
                    <td className="num">{brl(result.tec.absences[key], 1)}</td>
                  </tr>
                ))}
                <tr className="row-strong">
                  <td>Dias trabalhados por ano</td>
                  <td className="num">{brl(result.enf.daysWorked, 1)}</td>
                  <td className="num">{brl(result.tec.daysWorked, 1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="table-note">
            Presunção adotada: todo dia não registrado como ausência é contado como presença.
          </p>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h3>Arquivo Excel</h3>
            <p className="muted small">
              O arquivo é gerado com as abas de enfermeiros e técnicos prontas para substituir as
              planilhas oficiais.
            </p>
          </div>
          <button className="btn btn-primary" onClick={doExport} disabled={state === 'working'}>
            <Icon name="download" size={17} /> {state === 'working' ? 'Gerando…' : 'Gerar Excel'}
          </button>
        </div>

        <div className="sheet-list">
          <div className="sheet-item">
            <Icon name="file" size={18} />
            <div>
              <strong>{names.enf}</strong>
              <span>Enfermeiros — TTD, produção, cuidados indiretos e resultado</span>
            </div>
          </div>
          <div className="sheet-item">
            <Icon name="file" size={18} />
            <div>
              <strong>{names.tec}</strong>
              <span>Técnicos e auxiliares — mesmo formato</span>
            </div>
          </div>
          <div className="sheet-item">
            <Icon name="file" size={18} />
            <div>
              <strong>{names.evaluation}</strong>
              <span>Análise comparativa das duas categorias</span>
            </div>
          </div>
          <div className="sheet-item">
            <Icon name="file" size={18} />
            <div>
              <strong>MEMÓRIA DE CÁLCULO</strong>
              <span>Fórmulas, equipe e ausências lançadas</span>
            </div>
          </div>
        </div>

        {state === 'done' ? (
          <div className="feedback feedback-ok">
            <Icon name="check" size={16} /> {message}
          </div>
        ) : null}
        {state === 'error' ? (
          <div className="feedback feedback-error">
            <Icon name="alert" size={16} /> {message}
          </div>
        ) : null}
        <p className="table-note">
          O Excel abre com as fórmulas já calculadas e pode ser enviado ou arquivado como documento de
          apoio. Não substitui a análise do responsável técnico.
        </p>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Observações do responsável</h3>
          <span className="muted small">Aparecem no Excel e na impressão.</span>
        </div>
        <div className="stack">
          <Field label="Observações" hint="Ex.: considerações sobre a equipe, afastamentos previstos, mudanças na unidade.">
            <textarea
              className="input textarea"
              rows={4}
              value={project.notes}
              onChange={(e) => onPatch({ notes: e.target.value })}
              placeholder="Escreva aqui as observações que devem acompanhar o dimensionamento."
            />
          </Field>
        </div>
      </section>

      <details className="card details-card">
        <summary>
          <span>
            <strong>Detalhamento dos cuidados indiretos</strong>
            <em>Percentuais usados em cada categoria</em>
          </span>
          <Icon name="chevronDown" />
        </summary>
        <div className="table-wrap">
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Atividade</th>
                <th className="num">Enfermeiros</th>
                <th className="num">Técnicos/aux.</th>
              </tr>
            </thead>
            <tbody>
              {INDIRECT_ITEMS.map((item) => (
                <tr key={item.key}>
                  <td>{item.name}</td>
                  <td className="num">{brl(project.categories.enf.indirect[item.key] || 0, 1)}%</td>
                  <td className="num">{brl(project.categories.tec.indirect[item.key] || 0, 1)}%</td>
                </tr>
              ))}
              <tr className="row-strong">
                <td>Total</td>
                <td className="num">{brl(result.enf.indirectPct, 1)}%</td>
                <td className="num">{brl(result.tec.indirectPct, 1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      <div className="view-nav">
        <button className="btn btn-ghost" onClick={onBack}>
          <Icon name="arrowLeft" size={17} /> Voltar às ausências
        </button>
        <button className="btn btn-ghost" onClick={() => window.print()}>
          <Icon name="printer" size={17} /> Imprimir / PDF
        </button>
      </div>

      <PrintSheet project={project} result={result} />
    </div>
  );
}

function PrintSheet({ project, result }: { project: Project; result: ReturnType<typeof calcProject> }) {
  const rows = [result.enf, result.tec];
  return (
    <div className="print-sheet" aria-hidden="true">
      <header>
        <h1>DIMENSIONAMENTO DE PESSOAL DE ENFERMAGEM</h1>
        <p className="print-sub">
          Método WISN/WPSN — Parecer Normativo COFEN nº 1/2024 · Atenção Básica de Saúde
        </p>
        <p className="print-unit">
          {project.unitName || 'Unidade não informada'}
          {project.city ? ` — ${project.city}` : ''} · {project.periodLabel}
        </p>
      </header>

      <table className="print-table">
        <thead>
          <tr>
            <th>Categoria</th>
            <th>Nº atual</th>
            <th>Nº necessário</th>
            <th>Saldo</th>
            <th>Razão</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{CATEGORY_LABEL[r.key]}</td>
              <td>{brl(r.current, 0)}</td>
              <td>{r.required > 0 ? brl(r.required) : '—'}</td>
              <td>{r.required > 0 ? `${r.balance > 0 ? '+' : ''}${brl(r.balance)}` : '—'}</td>
              <td>{r.ratio > 0 ? `${brl(r.ratio * 100, 0)}%` : '—'}</td>
              <td>{pressureLabel(r.pressure)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="print-cols">
        {rows.map((r) => (
          <div key={r.key}>
            <h2>{CATEGORY_LABEL[r.key]}</h2>
            <table className="print-table small">
              <tbody>
                <tr>
                  <td>Dias trabalhados/ano</td>
                  <td>{brl(r.daysWorked, 1)}</td>
                </tr>
                <tr>
                  <td>TTD (horas/ano)</td>
                  <td>{brl(r.ttdHours, 1)}</td>
                </tr>
                <tr>
                  <td>Horas de cuidado direto</td>
                  <td>{brl(r.directHours, 1)}</td>
                </tr>
                <tr>
                  <td>Cuidados indiretos</td>
                  <td>{brl(r.indirectPct, 1)}%</td>
                </tr>
                <tr>
                  <td>Quadro necessário</td>
                  <td>{brl(r.required)}</td>
                </tr>
              </tbody>
            </table>
            <h3>Produção considerada</h3>
            <table className="print-table small">
              <tbody>
                {PROCEDURES.map((p) => (
                  <tr key={p.key}>
                    <td>{p.short}</td>
                    <td>{brl(project.categories[r.key].production[p.key] || 0, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {project.notes ? <p className="print-notes">Observações: {project.notes}</p> : null}

      <p className="print-legal">
        Documento de apoio ao planejamento. Os resultados dependem dos dados informados e devem ser
        analisados pelo responsável técnico. Não é sistema oficial, prontuário ou dispositivo médico.
      </p>

      <div className="print-sign">
        <div>
          <span />
          <strong>{project.responsibleName || 'Responsável técnico'}</strong>
          <em>{project.responsibleCoren || 'COREN'}</em>
        </div>
        <p>
          {project.signatureCity || project.city || ''}
          {project.signatureDate ? `, ${project.signatureDate.split('-').reverse().join('/')}` : ''}
        </p>
      </div>
    </div>
  );
}
