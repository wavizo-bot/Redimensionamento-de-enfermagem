import { useMemo, useRef, useState, type DragEvent } from 'react';
import type { AbsenceRecord, Project, Role, TeamMember } from '../types';
import { readSpreadsheet, type ImportPreview } from '../lib/importXlsx';
import { calcProject } from '../lib/calc';
import { makeMember, makeProject, uid } from '../lib/defaults';
import { Icon } from '../components/Icons';
import { Modal } from '../components/ui';

function buildProject(preview: ImportPreview, base: Project | null): Project {
  const draft = base
    ? { ...base, team: [...base.team], categories: { ...base.categories } }
    : makeProject();
  const project = makeProject(draft);

  project.unitName = preview.unitName || (base ? base.unitName : '');
  project.periodLabel = preview.periodLabel || project.periodLabel;
  project.periodTag = preview.periodTag || project.periodTag;
  project.startDate = preview.startDate || project.startDate;
  project.endDate = preview.endDate || project.endDate;
  project.updatedAt = new Date().toISOString();

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
  const team: TeamMember[] = names.map((item) => {
    const found = existingByName.get(item.name.toLowerCase());
    return found ? { ...found, role: item.role } : makeMember({ name: item.name, role: item.role });
  });
  project.team = team;

  // Se a planilha traz a quantidade oficial, o modo "só a quantidade" evita divergência com a lista de nomes.
  project.teamMode = staffEnf !== null || staffTec !== null ? 'count' : 'list';

  const records: AbsenceRecord[] = base?.absenceRecords ?? [];
  project.absenceRecords = records.filter((r) => team.some((m) => m.id === r.memberId));

  return project;
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [replace, setReplace] = useState(false);
  const [drag, setDrag] = useState(false);

  const candidate = useMemo(
    () => (preview && preview.kind === 'dimensionamento' ? buildProject(preview, replace ? activeProject : null) : null),
    [preview, replace, activeProject],
  );

  const read = async (file: File) => {
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      setError('Escolha um arquivo .xlsx ou .xlsm.');
      return;
    }
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      const result = await readSpreadsheet(file);
      setPreview(result);
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

  const result = candidate ? calcProject(candidate) : null;
  const canApply = Boolean(candidate && preview?.kind === 'dimensionamento');

  return (
    <Modal
      title="Importar planilha do Excel"
      subtitle="Use a planilha de dimensionamento que você já preenche. O aplicativo lê produção, tempos, cuidados indiretos, ausências e a quantidade de profissionais."
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
            <Icon name="check" size={17} /> {replace ? 'Substituir este dimensionamento' : 'Criar dimensionamento'}
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
                    : preview.kind === 'procedimentos'
                      ? 'Planilha de detalhamento de procedimentos'
                      : 'Formato não reconhecido'}
                </span>
              </div>
              <span className={`pill ${preview.kind === 'dimensionamento' ? 'pill-ok' : 'pill-warn'}`}>
                {preview.kind === 'dimensionamento' ? 'Pronta para importar' : 'Somente conferência'}
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
                      Confira se os números batem com os da sua planilha. Se algo estiver diferente, ajuste
                      depois nas etapas de produção e ausências.
                    </p>
                  </div>
                ) : null}

                {activeProject ? (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={replace}
                      onChange={(e) => setReplace(e.target.checked)}
                    />
                    <span>
                      <strong>Substituir o dimensionamento aberto</strong>
                      <em>
                        Mantém o nome da unidade e o cadastro atual e troca apenas os dados importados.
                      </em>
                    </span>
                  </label>
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

                {preview.detail === 'expanded' && preview.categoryTotals ? (
                  <div className="import-grid import-grid-4">
                    <div>
                      <span>Enfermeiros</span>
                      <strong>{preview.categoryTotals.enf.toLocaleString('pt-BR')}</strong>
                      <em>
                        últimos 12 meses:{' '}
                        {(preview.last12Totals?.enf ?? 0).toLocaleString('pt-BR')}
                      </em>
                    </div>
                    <div>
                      <span>Técnicos/auxiliares</span>
                      <strong>{preview.categoryTotals.tec.toLocaleString('pt-BR')}</strong>
                      <em>
                        últimos 12 meses:{' '}
                        {(preview.last12Totals?.tec ?? 0).toLocaleString('pt-BR')}
                      </em>
                    </div>
                    <div>
                      <span>Outras ocupações</span>
                      <strong>{preview.categoryTotals.other.toLocaleString('pt-BR')}</strong>
                      <em>
                        últimos 12 meses:{' '}
                        {(preview.last12Totals?.other ?? 0).toLocaleString('pt-BR')}
                      </em>
                    </div>
                    <div>
                      <span>Profissionais com lançamento</span>
                      <strong>{preview.staffNames?.enf ?? 0} enfermeiros</strong>
                      <em>{preview.staffNames?.tec ?? 0} técnicos/auxiliares</em>
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

                <div className="callout callout-warn">
                  <Icon name="alert" />
                  <div>
                    {preview.detail === 'expanded' ? (
                      <>
                        <strong>O detalhamento foi lido, mas ainda falta o agrupamento do cálculo</strong>
                        <p>
                          Este arquivo traz a produção <strong>por profissional e por procedimento</strong>,
                          mês a mês. Para calcular o quadro pelo WISN/WPSN o aplicativo ainda precisa de:
                        </p>
                        <ul className="report-missing">
                          <li>agrupamento dos procedimentos nos 10 grupos do dimensionamento;</li>
                          <li>tempos médios de cada grupo;</li>
                          <li>cuidados indiretos, ausências e quadro atual por categoria.</li>
                        </ul>
                        <p>
                          Use este extrato para conferir volume e distribuição. Para criar o dimensionamento,
                          importe a planilha que contém as abas <strong>ENFERMEIROS</strong>,{' '}
                          <strong>AUXILIARESTECNICOS</strong> e <strong>DIMENSIONAMENTO</strong>.
                        </p>
                      </>
                    ) : (
                      <>
                        <strong>O arquivo foi lido, mas ele não tem o detalhe que o cálculo exige</strong>
                        <p>
                          Este relatório traz <strong>uma coluna por mês</strong> e apenas o total geral em
                          “TOTAL PROCEDIMENTOS”. Para calcular o quadro pelo WISN/WPSN o aplicativo precisa da
                          produção separada por tipo de procedimento e por categoria:
                        </p>
                        <ul className="report-missing">
                          <li>os 10 procedimentos do dimensionamento, cada um com sua quantidade anual;</li>
                          <li>a divisão entre enfermeiros e técnicos/auxiliares;</li>
                          <li>tempos médios, cuidados indiretos, ausências e quadro atual.</li>
                        </ul>
                        <p>
                          Use este extrato para conferir o volume. Para criar o dimensionamento, importe a
                          planilha que contém as abas <strong>ENFERMEIROS</strong>,{' '}
                          <strong>AUXILIARESTECNICOS</strong> e <strong>DIMENSIONAMENTO</strong>.
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <details className="report-help">
                  <summary>O que exatamente o aplicativo procura na planilha de dimensionamento</summary>
                  <div>
                    <p>
                      Aba <strong>DIMENSIONAMENTO -ENF</strong> (e a equivalente dos técnicos): produção em{' '}
                      <strong>C21:C30</strong>, tempos médios em <strong>D21:D30</strong>, cuidados indiretos em{' '}
                      <strong>C35:C48</strong>, quadro atual em <strong>G9</strong> e ausências em{' '}
                      <strong>AJ4, AJ6, AJ8 e AJ10</strong>.
                    </p>
                    <p>
                      Se a sua planilha tiver outro layout, o aplicativo também tenta ler a aba de produção
                      (totais em <strong>M2:M11</strong>) e as abas de nomes da equipe.
                    </p>
                  </div>
                </details>
              </>
            ) : (
              <div className="callout callout-warn">
                <Icon name="alert" />
                <div>
                  <strong>Formato não reconhecido</strong>
                  <p>
                    Não encontrei as abas de dimensionamento nem um relatório de procedimentos com totais
                    mensais. Confira se o arquivo é o .xlsx correto e se não está protegido por senha.
                  </p>
                </div>
              </div>
            )}

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
