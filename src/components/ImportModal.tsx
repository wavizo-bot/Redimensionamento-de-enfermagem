import { useMemo, useRef, useState, type DragEvent } from 'react';
import type { Project } from '../types';
import { PROCEDURES } from '../lib/defaults';
import { readSpreadsheet, type ImportPreview } from '../lib/importXlsx';
import { buildImportedProject } from '../lib/importBuild';
import { calcProject } from '../lib/calc';
import { Icon } from '../components/Icons';
import { Modal } from '../components/ui';

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function percent(part: number, total: number): string {
  return total > 0 ? `${(part / total).toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 1 })}` : '—';
}

export function ImportModal({
  onClose,
  onApply,
  activeProject,
}: {
  onClose: () => void;
  onApply: (project: Project, replace: boolean) => void;
  activeProject: Project | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [windowKey, setWindowKey] = useState<string | null>(null);
  const [useTeam, setUseTeam] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [replace, setReplace] = useState(false);
  const [drag, setDrag] = useState(false);

  const selectedWindow = useMemo(
    () =>
      preview?.partial?.windows.find((w) => w.key === windowKey) ??
      preview?.partial?.windows[0] ??
      null,
    [preview, windowKey],
  );

  const candidate = useMemo(() => {
    if (!preview) return null;
    if (preview.kind === 'dimensionamento') {
      return buildImportedProject(preview, replace ? activeProject : null, null, false);
    }
    if (preview.partial?.usable && selectedWindow) {
      return buildImportedProject(
        preview,
        replace ? activeProject : null,
        selectedWindow,
        useTeam,
      );
    }
    return null;
  }, [preview, replace, activeProject, selectedWindow, useTeam]);

  const result = useMemo(
    () => (candidate && preview?.kind === 'dimensionamento' ? calcProject(candidate) : null),
    [candidate, preview],
  );
  const canApply = Boolean(candidate);

  const read = async (file: File) => {
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      setError('Escolha um arquivo .xlsx ou .xlsm.');
      return;
    }
    setBusy(true);
    setError('');
    setPreview(null);
    setWindowKey(null);
    setUseTeam(false);
    try {
      const response = await readSpreadsheet(file);
      setPreview(response);
      setWindowKey(response.partial?.defaultWindow ?? null);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Não consegui ler este arquivo: ${e.message}`
          : 'Não consegui ler este arquivo. Verifique se ele abre no Excel.',
      );
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void read(file);
  };

  const usablePartial = Boolean(preview?.partial?.usable && selectedWindow);
  const showEstablishment = preview?.detail === 'establishment';
  const showAggregate = preview?.detail === 'aggregate';
  const mappedEnf = selectedWindow ? selectedWindow.totals.enf - selectedWindow.unmapped.enf : 0;
  const mappedTec = selectedWindow ? selectedWindow.totals.tec - selectedWindow.unmapped.tec : 0;
  const nursingTotal = selectedWindow ? selectedWindow.totals.enf + selectedWindow.totals.tec : 0;

  const applyLabel =
    preview?.kind === 'dimensionamento'
      ? replace
        ? 'Substituir este dimensionamento'
        : 'Criar dimensionamento'
      : usablePartial
        ? replace
          ? 'Aplicar base parcial'
          : 'Criar com base parcial'
        : 'Importar';

  return (
    <Modal
      title="Importar planilha do Excel"
      subtitle="Use a planilha completa de dimensionamento ou um relatório de procedimentos do e-SUS. No relatório, o aplicativo aproveita a produção e deixa o restante para você revisar."
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={!canApply}
            onClick={() => candidate && onApply(candidate, replace)}
          >
            <Icon name="check" size={17} /> {applyLabel}
          </button>
        </>
      }
    >
      <div className="stack">
        <div
          className={`dropzone ${drag ? 'drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        >
          <Icon name="upload" size={28} />
          <strong>{busy ? 'Lendo a planilha…' : 'Arraste o arquivo aqui ou clique para escolher'}</strong>
          <span className="muted small">Formatos aceitos: .xlsx e .xlsm</span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void read(file);
              e.target.value = '';
            }}
          />
        </div>

        {error ? (
          <div className="feedback feedback-error">
            <Icon name="alert" size={16} /> {error}
          </div>
        ) : null}

        {preview ? (
          <div className="import-preview">
            <div className="import-head">
              <div>
                <strong>{preview.fileName}</strong>
                <span className="muted small">
                  {preview.kind === 'dimensionamento'
                    ? 'Planilha de dimensionamento reconhecida'
                    : preview.partial?.usable
                      ? 'Relatório reconhecido como base parcial'
                      : preview.kind === 'procedimentos'
                        ? 'Relatório reconhecido para conferência'
                        : 'Formato não reconhecido'}
                </span>
              </div>
              <span
                className={`pill ${
                  preview.kind === 'dimensionamento'
                    ? 'pill-ok'
                    : preview.partial?.usable
                      ? 'pill-warn'
                      : 'pill-neutral'
                }`}
              >
                {preview.kind === 'dimensionamento'
                  ? 'Pronta para importar'
                  : preview.partial?.usable
                    ? 'Base parcial — revisar'
                    : 'Somente conferência'}
              </span>
            </div>

            {preview.kind === 'dimensionamento' ? (
              <>
                <div className="import-grid">
                  <div>
                    <span>Unidade identificada</span>
                    <strong>{preview.unitName || 'Não informada na planilha'}</strong>
                  </div>
                  <div>
                    <span>Período</span>
                    <strong>{preview.periodLabel}</strong>
                  </div>
                  <div>
                    <span>Equipe na planilha</span>
                    <strong>
                      {preview.enf?.staffCount ?? '—'} enfermeiros · {preview.tec?.staffCount ?? '—'} técnicos
                    </strong>
                  </div>
                </div>

                {result ? (
                  <div className="import-result">
                    <div>
                      <span>Enfermeiros</span>
                      <strong>{result.enf.required.toFixed(2)}</strong>
                      <em>necessários</em>
                    </div>
                    <div>
                      <span>Técnicos/auxiliares</span>
                      <strong>{result.tec.required.toFixed(2)}</strong>
                      <em>necessários</em>
                    </div>
                    <p>
                      Confira se os números batem com os da sua planilha. Se algo estiver diferente,
                      ajuste depois nas etapas de produção e ausências.
                    </p>
                  </div>
                ) : null}
              </>
            ) : preview.kind === 'procedimentos' ? (
              <>
                <div className="import-grid import-grid-4">
                  <div>
                    <span>Unidade no relatório</span>
                    <strong>{preview.unitName || 'Não informada'}</strong>
                  </div>
                  <div>
                    <span>Período coberto</span>
                    <strong>{preview.coverageLabel || preview.periodLabel}</strong>
                  </div>
                  <div>
                    <span>Total no período</span>
                    <strong>
                      {preview.totalProcedures !== null
                        ? preview.totalProcedures.toLocaleString('pt-BR')
                        : '—'}
                    </strong>
                  </div>
                  <div>
                    <span>Média por mês</span>
                    <strong>
                      {preview.totalProcedures !== null && preview.coverageMonths
                        ? Math.round(preview.totalProcedures / preview.coverageMonths).toLocaleString('pt-BR')
                        : '—'}
                    </strong>
                  </div>
                </div>

                {usablePartial && selectedWindow ? (
                  <div className="import-grid import-grid-4">
                    <div>
                      <span>Enfermeiros</span>
                      <strong>{selectedWindow.totals.enf.toLocaleString('pt-BR')}</strong>
                      <em>no período exibido</em>
                    </div>
                    <div>
                      <span>Técnicos/auxiliares</span>
                      <strong>{selectedWindow.totals.tec.toLocaleString('pt-BR')}</strong>
                      <em>no período exibido</em>
                    </div>
                    <div>
                      <span>Outras ocupações</span>
                      <strong>{selectedWindow.totals.other.toLocaleString('pt-BR')}</strong>
                      <em>não entram no cálculo de enfermagem</em>
                    </div>
                    <div>
                      <span>Nomes encontrados</span>
                      <strong>{selectedWindow.team.enf.length} enfermeiros</strong>
                      <em>{selectedWindow.team.tec.length} técnicos/auxiliares nesta janela</em>
                    </div>
                  </div>
                ) : null}

                {preview.monthlyTotals && preview.monthlyTotals.length > 1 ? (
                  <div className="report-chart">
                    <div className="report-bars" role="img" aria-label="Procedimentos por mês">
                      {preview.monthlyTotals.map((m) => {
                        const max = Math.max(...preview.monthlyTotals!.map((x) => x.total), 1);
                        return (
                          <i
                            key={m.iso}
                            style={{ height: `${Math.max(6, Math.round((m.total / max) * 100))}%` }}
                            title={`${m.label}: ${m.total.toLocaleString('pt-BR')}`}
                          />
                        );
                      })}
                    </div>
                    <div className="report-axis">
                      <span>{preview.monthlyTotals[0].label}</span>
                      <span>{preview.monthlyTotals[preview.monthlyTotals.length - 1].label}</span>
                    </div>
                  </div>
                ) : null}

                {preview.partial && preview.partial.windows.length > 0 ? (
                  <div className="import-window">
                    <div className="import-window-head">
                      <div>
                        <strong>Janela de produção</strong>
                        <span className="muted small">
                          Escolha o período que será usado como produção anual.
                        </span>
                      </div>
                    </div>
                    <div className="segmented segmented-small">
                      {preview.partial.windows.map((w) => (
                        <button
                          key={w.key}
                          className={selectedWindow?.key === w.key ? 'active' : ''}
                          onClick={() => setWindowKey(w.key)}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                    {selectedWindow ? (
                      <p className="table-note">
                        {selectedWindow.rangeLabel}
                        {selectedWindow.annualized
                          ? ' · valores ajustados para representar 12 meses.'
                          : ' · soma dos meses, sem ajuste.'}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {selectedWindow ? (
                  <div className="import-groups">
                    <div className="table-wrap">
                      <table className="data-table compact import-group-table">
                        <thead>
                          <tr>
                            <th>Grupo do dimensionamento</th>
                            {usablePartial ? (
                              <>
                                <th className="num">Enfermeiros</th>
                                <th className="num">Técnicos/aux.</th>
                                <th className="num">Total</th>
                              </>
                            ) : (
                              <th className="num">Total no período</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {PROCEDURES.map((procedure) => {
                            const enf = selectedWindow.groups.enf[procedure.key] ?? 0;
                            const tec = selectedWindow.groups.tec[procedure.key] ?? 0;
                            const total = selectedWindow.groups.total[procedure.key] ?? 0;
                            const empty = usablePartial ? enf + tec === 0 : total === 0;
                            return (
                              <tr key={procedure.key} className={empty ? 'is-empty' : ''}>
                                <td>{procedure.name}</td>
                                {usablePartial ? (
                                  <>
                                    <td className="num">{formatNumber(enf)}</td>
                                    <td className="num">{formatNumber(tec)}</td>
                                    <td className="num">{formatNumber(total)}</td>
                                  </>
                                ) : (
                                  <td className="num">{formatNumber(total)}</td>
                                )}
                              </tr>
                            );
                          })}
                          {selectedWindow.unmapped.total > 0 ? (
                            <tr className="is-warn">
                              <td>Não mapeados ({selectedWindow.unmappedProcedures.length} procedimentos)</td>
                              {usablePartial ? (
                                <>
                                  <td className="num">{formatNumber(selectedWindow.unmapped.enf)}</td>
                                  <td className="num">{formatNumber(selectedWindow.unmapped.tec)}</td>
                                  <td className="num">{formatNumber(selectedWindow.unmapped.total)}</td>
                                </>
                              ) : (
                                <td className="num">{formatNumber(selectedWindow.unmapped.total)}</td>
                              )}
                            </tr>
                          ) : null}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td>Total</td>
                            {usablePartial ? (
                              <>
                                <td className="num">{formatNumber(selectedWindow.totals.enf)}</td>
                                <td className="num">{formatNumber(selectedWindow.totals.tec)}</td>
                                <td className="num">{formatNumber(nursingTotal)}</td>
                              </>
                            ) : (
                              <td className="num">{formatNumber(selectedWindow.totals.total)}</td>
                            )}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {usablePartial ? (
                      <div className="import-coverage">
                        <span>
                          Mapeamento: <strong>{percent(mappedEnf, selectedWindow.totals.enf)}</strong>{' '}
                          dos enfermeiros e <strong>{percent(mappedTec, selectedWindow.totals.tec)}</strong>{' '}
                          dos técnicos/auxiliares.
                        </span>
                        <span>
                          Nomes encontrados:{' '}
                          <strong>{selectedWindow.team.enf.length}</strong> enfermeiros e{' '}
                          <strong>{selectedWindow.team.tec.length}</strong> técnicos/auxiliares.
                        </span>
                      </div>
                    ) : null}
                    {selectedWindow.unmappedProcedures.length > 0 ? (
                      <details className="report-help">
                        <summary>
                          {selectedWindow.unmappedProcedures.length} procedimento(s) não mapeado(s) —{' '}
                          {formatNumber(selectedWindow.unmapped.total)} lançamentos
                        </summary>
                        <div>
                          <ul className="report-missing">
                            {selectedWindow.unmappedProcedures.map((item) => (
                              <li key={item.name}>
                                {item.name} — {formatNumber(item.total)} lançamentos
                                {item.enf > 0 || item.tec > 0
                                  ? ` (${formatNumber(item.enf)} enf. / ${formatNumber(item.tec)} téc.)`
                                  : ''}
                              </li>
                            ))}
                          </ul>
                          <p>
                            Esses lançamentos ficaram fora da base parcial. Se algum deles pertencer a
                            um dos grupos, some a quantidade manualmente na etapa de produção.
                          </p>
                        </div>
                      </details>
                    ) : null}
                  </div>
                ) : null}

                {usablePartial ? (
                  <>
                    <div className="callout callout-warn">
                      <Icon name="alert" />
                      <div>
                        <strong>Base parcial: a produção vem preenchida, o restante precisa de revisão</strong>
                        <p>
                          O relatório permite aproveitar a quantidade de procedimentos por grupo. Ele
                          não informa os tempos médios, os cuidados indiretos, as ausências nem o quadro
                          atual. Esses dados continuam com os valores padrão ou com o que já estava no
                          dimensionamento.
                        </p>
                        <ul className="report-missing">
                          <li>Imunizações não aparecem no export do e-SUS e ficam para preenchimento manual.</li>
                          <li>Os nomes encontrados são de quem lançou produção, não necessariamente do quadro atual.</li>
                          <li>Confira os grupos zerados e os procedimentos não mapeados antes de concluir.</li>
                        </ul>
                      </div>
                    </div>

                    {selectedWindow && (selectedWindow.team.enf.length > 0 || selectedWindow.team.tec.length > 0) ? (
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={useTeam}
                          onChange={(e) => setUseTeam(e.target.checked)}
                        />
                        <span>
                          <strong>Usar os nomes encontrados como sugestão de equipe</strong>
                          <em>
                            {selectedWindow.team.enf.length} enfermeiros e{' '}
                            {selectedWindow.team.tec.length} técnicos/auxiliares com lançamento nesta
                            janela. Se você estiver substituindo um dimensionamento, os nomes são
                            acrescentados à equipe atual; nenhum cadastro é apagado.
                          </em>
                        </span>
                      </label>
                    ) : null}

                    {useTeam && selectedWindow ? (
                      <details className="report-help">
                        <summary>Ver os nomes que serão acrescentados</summary>
                        <div>
                          <p>
                            <strong>Enfermeiros:</strong>{' '}
                            {selectedWindow.team.enf.map((m) => m.name).join(' · ') || 'nenhum'}
                          </p>
                          <p>
                            <strong>Técnicos/auxiliares:</strong>{' '}
                            {selectedWindow.team.tec.map((m) => m.name).join(' · ') || 'nenhum'}
                          </p>
                          <p>
                            Depois da importação, confira situação, jornada e função de cada pessoa na
                            etapa Equipe.
                          </p>
                        </div>
                      </details>
                    ) : null}
                  </>
                ) : showEstablishment ? (
                  <div className="callout callout-warn">
                    <Icon name="alert" />
                    <div>
                      <strong>Este relatório serve para conferência, não para preencher o cálculo</strong>
                      <p>
                        Ele traz uma linha por estabelecimento e procedimento, somando todas as
                        profissões. Como médicos, dentistas e outras ocupações aparecem junto com a
                        enfermagem, não é possível separar enfermeiros de técnicos/auxiliares. Use os
                        totais para conferir o volume.
                      </p>
                    </div>
                  </div>
                ) : showAggregate ? (
                  <div className="callout callout-warn">
                    <Icon name="alert" />
                    <div>
                      <strong>O arquivo foi lido, mas ele não tem o detalhe que o cálculo exige</strong>
                      <p>
                        Este relatório traz <strong>uma coluna por mês</strong> e apenas o total geral em
                        “TOTAL PROCEDIMENTOS”. Para calcular o quadro pelo WISN/WPSN o aplicativo precisa
                        da produção separada por tipo de procedimento e por categoria:
                      </p>
                      <ul className="report-missing">
                        <li>os 10 procedimentos do dimensionamento, cada um com sua quantidade;</li>
                        <li>a divisão entre enfermeiros e técnicos/auxiliares;</li>
                        <li>tempos médios, cuidados indiretos, ausências e quadro atual.</li>
                      </ul>
                      <p>
                        Use este extrato para conferir o volume. Para criar o dimensionamento, importe
                        um dos relatórios detalhados ou a planilha com as abas{' '}
                        <strong>ENFERMEIROS</strong>, <strong>AUXILIARESTECNICOS</strong> e{' '}
                        <strong>DIMENSIONAMENTO</strong>.
                      </p>
                    </div>
                  </div>
                ) : null}

                {preview.partial ? (
                  <details className="report-help">
                    <summary>Como o aplicativo agrupa os procedimentos</summary>
                    <div>
                      <p>
                        Cada procedimento do e-SUS é associado a um dos dez grupos do dimensionamento.
                        Procedimentos de médicos e dentistas são deixados de fora. O que não for
                        reconhecido aparece como <strong>não mapeado</strong> e não entra na produção.
                      </p>
                      <p>
                        O detalhamento expandido traz unidade, ocupação, profissional e procedimento. O
                        relatório por profissional traz a especialidade e o procedimento, mas não a
                        unidade. O relatório por estabelecimento traz apenas o total por procedimento.
                      </p>
                    </div>
                  </details>
                ) : null}
              </>
            ) : (
              <div className="callout callout-warn">
                <Icon name="alert" />
                <div>
                  <strong>Formato não reconhecido</strong>
                  <p>
                    Não encontrei as abas de dimensionamento nem um relatório de procedimentos com
                    totais mensais. Confira se o arquivo é o .xlsx correto e se não está protegido por
                    senha.
                  </p>
                </div>
              </div>
            )}

            {activeProject && canApply ? (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={(e) => setReplace(e.target.checked)}
                />
                <span>
                  <strong>Substituir o dimensionamento aberto</strong>
                  <em>
                    {preview.partial?.usable
                      ? 'Mantém o cadastro atual e troca a produção pela base parcial. Tempos, indiretos, ausências e quadro continuam iguais.'
                      : 'Mantém o nome da unidade e o cadastro atual e troca apenas os dados importados.'}
                  </em>
                </span>
              </label>
            ) : null}

            {preview.warnings.length > 0 ? (
              <ul className="warn-list">
                {preview.warnings.map((w) => (
                  <li key={w}>
                    <Icon name="info" size={15} /> {w}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="callout callout-info">
          <Icon name="shield" />
          <div>
            <strong>Seus dados ficam no seu computador</strong>
            <p>
              A leitura acontece localmente, no próprio aplicativo. Nenhum arquivo é enviado para a
              internet durante a importação.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
