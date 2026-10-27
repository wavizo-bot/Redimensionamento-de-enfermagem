import { useState } from 'react';
import type { CategoryKey, Project } from '../types';
import { CATEGORY_LABEL, DEFAULT_DIRECT_TIMES, INDIRECT_ITEMS, PROCEDURES } from '../lib/defaults';
import { calcCategory } from '../lib/calc';
import { Icon } from '../components/Icons';
import { Help, NumberField } from '../components/ui';

export function ProductionView({
  project,
  onPatch,
  onNext,
  onBack,
  onImport,
}: {
  project: Project;
  onPatch: (patch: Partial<Project>) => void;
  onNext: () => void;
  onBack: () => void;
  onImport: () => void;
}) {
  const [tab, setTab] = useState<CategoryKey>('enf');
  const [showIndirect, setShowIndirect] = useState(false);
  const cfg = project.categories[tab];
  const res = calcCategory(project, tab);
  const other = calcCategory(project, tab === 'enf' ? 'tec' : 'enf');

  const patchCategory = (patch: Partial<typeof cfg>) =>
    onPatch({ categories: { ...project.categories, [tab]: { ...cfg, ...patch } } });

  const setProduction = (key: string, v: number) =>
    patchCategory({ production: { ...cfg.production, [key]: v } });
  const setTime = (key: string, v: number) =>
    patchCategory({ directTimes: { ...cfg.directTimes, [key]: v } });
  const setIndirect = (key: string, v: number) =>
    patchCategory({ indirect: { ...cfg.indirect, [key]: v } });

  const totalProduction = PROCEDURES.reduce((s, p) => s + (cfg.production[p.key] || 0), 0);
  const resetTimes = () => patchCategory({ directTimes: { ...DEFAULT_DIRECT_TIMES[tab] } });

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <span className="step-label">Etapa 3 de 5</span>
          <h2>Produção e tempos de atendimento</h2>
          <p className="muted">
            Informe quantos procedimentos foram feitos no ano. O tempo médio já vem preenchido com a
            referência usada na planilha; ajuste apenas se a sua realidade for diferente.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={onImport}>
          <Icon name="upload" size={17} /> Importar do Excel
        </button>
      </header>

      <div className="production-switch">
        <div className="segmented">
          {(['enf', 'tec'] as CategoryKey[]).map((key) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {CATEGORY_LABEL[key]}
              <span className="seg-badge">{calcCategory(project, key).required.toFixed(1)}</span>
            </button>
          ))}
        </div>
        <div className="mini-result">
          <span>Necessário nesta categoria</span>
          <strong>{res.required.toFixed(2)}</strong>
          <em>profissionais</em>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h3>Cuidados diretos — {CATEGORY_LABEL[tab]}</h3>
            <p className="muted small">
              Produção anual e tempo médio de cada intervenção. A última coluna mostra as horas
              anuais necessárias.
            </p>
          </div>
          <button className="btn btn-small btn-ghost" onClick={resetTimes}>
            <Icon name="refresh" size={15} /> Restaurar tempos padrão
          </button>
        </div>

        <div className="table-wrap">
          <table className="data-table production-table">
            <thead>
              <tr>
                <th>Intervenção</th>
                <th className="num">
                  Produção anual
                  <Help>Quantidade de vezes que o procedimento foi realizado no período. Se você tem o total mensal, some os 12 meses.</Help>
                </th>
                <th className="num">
                  Tempo médio (h)
                  <Help>Tempo, em horas, que cada procedimento consome de um profissional. 0,42 = 42 minutos.</Help>
                </th>
                <th className="num">Horas/ano</th>
              </tr>
            </thead>
            <tbody>
              {PROCEDURES.map((p) => {
                const hours = (cfg.production[p.key] || 0) * (cfg.directTimes[p.key] || 0);
                return (
                  <tr key={p.key}>
                    <td>
                      <span className="proc-name">{p.name}</span>
                    </td>
                    <td className="num">
                      <NumberField
                        value={cfg.production[p.key] || 0}
                        onChange={(v) => setProduction(p.key, v)}
                        min={0}
                        ariaLabel={`Produção anual de ${p.name}`}
                      />
                    </td>
                    <td className="num">
                      <NumberField
                        value={cfg.directTimes[p.key] || 0}
                        onChange={(v) => setTime(p.key, v)}
                        min={0}
                        step={0.01}
                        suffix="h"
                        ariaLabel={`Tempo médio de ${p.name}`}
                      />
                    </td>
                    <td className="num strong">{hours.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{totalProduction.toLocaleString('pt-BR')}</td>
                <td />
                <td className="num strong">{res.directHours.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="table-note">
          {totalProduction === 0
            ? 'A produção está zerada. Sem ela, o aplicativo não calcula a quantidade necessária.'
            : `Isso equivale a ${res.directHours.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} horas de cuidado direto por ano.`}
        </p>
      </section>

      <section className="card">
        <button className="collapse-head" onClick={() => setShowIndirect((v) => !v)} aria-expanded={showIndirect}>
          <div>
            <h3>Cuidados indiretos</h3>
            <p className="muted small">
              Reuniões, documentação, supervisão e outras atividades que não são atendimento direto.
              Total atual: <strong>{res.indirectPct.toFixed(1)}%</strong>
            </p>
          </div>
          <Icon name="chevronDown" className={showIndirect ? 'rotated' : ''} />
        </button>

        {showIndirect ? (
          <div className="indirect-body">
            <div className="callout callout-info">
              <Icon name="info" />
              <div>
                <strong>Por que isso importa?</strong>
                <p>
                  Quanto maior o tempo em atividades indiretas, menor o tempo disponível para o
                  cuidado direto — e maior o quadro necessário. O total não pode chegar a 100%.
                </p>
              </div>
            </div>
            <div className="indirect-grid">
              {INDIRECT_ITEMS.map((item) => (
                <label className="indirect-row" key={item.key}>
                  <span>{item.name}</span>
                  <NumberField
                    value={cfg.indirect[item.key] || 0}
                    onChange={(v) => setIndirect(item.key, v)}
                    min={0}
                    max={100}
                    step={0.1}
                    suffix="%"
                    ariaLabel={item.name}
                  />
                </label>
              ))}
            </div>
            <div className={`indirect-total ${res.indirectPct >= 95 ? 'danger' : ''}`}>
              <span>Total de cuidados indiretos</span>
              <strong>{res.indirectPct.toFixed(1)}%</strong>
              <span className="muted">
                Fator de cuidado direto: {(100 - res.indirectPct).toFixed(1)}%
              </span>
            </div>
            {res.indirectPct >= 95 ? (
              <p className="error-text">
                O total de cuidados indiretos precisa ser menor que 95% para o cálculo funcionar.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="inline-summary">
        <div>
          <span>{CATEGORY_LABEL[tab]}</span>
          <strong>{res.required.toFixed(2)}</strong>
          <em>necessários</em>
        </div>
        <div>
          <span>{CATEGORY_LABEL[tab === 'enf' ? 'tec' : 'enf']}</span>
          <strong>{other.required.toFixed(2)}</strong>
          <em>necessários</em>
        </div>
        <div className="inline-summary-note">
          <Icon name="info" size={16} /> O resultado final aparece na etapa 5.
        </div>
      </div>

      <div className="view-nav">
        <button className="btn btn-ghost" onClick={onBack}>
          <Icon name="arrowLeft" size={17} /> Voltar
        </button>
        <button className="btn btn-primary" onClick={onNext}>
          Continuar para as ausências <Icon name="arrowRight" size={17} />
        </button>
      </div>
    </div>
  );
}
