import type { CategoryKey, Project, Role, TeamMember } from '../types';
import { CATEGORY_LABEL, ROLES, makeMember } from '../lib/defaults';
import { countTeam, memberCategory } from '../lib/calc';
import { Icon } from '../components/Icons';
import { EmptyState, Help, NumberField } from '../components/ui';

const statusLabel: Record<TeamMember['status'], string> = {
  active: 'Ativo',
  leave: 'Afastado',
  inactive: 'Inativo',
};

export function TeamView({
  project,
  onPatch,
  onNext,
  onBack,
}: {
  project: Project;
  onPatch: (patch: Partial<Project>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const counts = {
    enf: countTeam(project, 'enf'),
    tec: countTeam(project, 'tec'),
  };

  const setTeam = (team: TeamMember[]) => onPatch({ team });
  const update = (id: string, patch: Partial<TeamMember>) =>
    setTeam(project.team.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const add = (role: Role) => {
    setTeam([
      ...project.team,
      makeMember({
        name: '',
        role,
        weeklyHours: project.settings.hoursPerDay * project.settings.daysPerWeek,
        note: '',
      }),
    ]);
  };

  const remove = (id: string) => setTeam(project.team.filter((m) => m.id !== id));

  const switchMode = (mode: 'list' | 'count') => {
    if (mode === project.teamMode) return;
    if (mode === 'count') {
      onPatch({
        teamMode: 'count',
        categories: {
          enf: { ...project.categories.enf, staffCount: counts.enf.active },
          tec: { ...project.categories.tec, staffCount: counts.tec.active },
        },
      });
      return;
    }
    let team = project.team;
    if (team.length === 0) {
      team = [];
      (['enf', 'tec'] as CategoryKey[]).forEach((cat) => {
        const qty = Math.max(0, Math.floor(project.categories[cat].staffCount));
        for (let i = 1; i <= qty; i += 1) {
          team.push(
            makeMember({
              name: cat === 'enf' ? `Enfermeiro(a) ${i}` : `Técnico(a)/Auxiliar ${i}`,
              role: cat === 'enf' ? 'Enfermeiro' : 'Técnico de Enfermagem',
              weeklyHours: project.settings.hoursPerDay * project.settings.daysPerWeek,
            }),
          );
        }
      });
    }
    onPatch({ teamMode: 'list', team });
  };

  const counting = project.teamMode === 'count';
  const active = counting
    ? Math.max(0, project.categories.enf.staffCount) + Math.max(0, project.categories.tec.staffCount)
    : counts.enf.active + counts.tec.active;
  const leave = counting ? 0 : counts.enf.onLeave + counts.tec.onLeave;

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <span className="step-label">Etapa 2 de 5</span>
          <h2>Quem trabalha na unidade</h2>
          <p className="muted">
            Cadastre os profissionais por nome ou informe apenas a quantidade atual. A lista é
            flexível: você pode adicionar, remover ou renomear quando o quadro mudar.
          </p>
        </div>
        <div className="head-stats">
          <div>
            <strong>{active}</strong>
            <span>ativos</span>
          </div>
          <div>
            <strong>{leave}</strong>
            <span>afastados</span>
          </div>
        </div>
      </header>

      <div className="mode-bar">
        <div className="segmented">
          <button
            className={project.teamMode === 'list' ? 'active' : ''}
            onClick={() => switchMode('list')}
          >
            <Icon name="users" size={16} /> Listar por nome
          </button>
          <button
            className={project.teamMode === 'count' ? 'active' : ''}
            onClick={() => switchMode('count')}
          >
            <Icon name="clipboard" size={16} /> Só a quantidade
          </button>
        </div>
        <p className="muted small">
          {project.teamMode === 'list'
            ? 'Profissionais afastados não entram na conta atual, mas ficam registrados.'
            : 'Use quando ainda não quiser digitar os nomes. A quantidade informada é a equipe atual.'}
        </p>
      </div>

      {project.teamMode === 'count' ? (
        <div className="grid-2">
          {(['enf', 'tec'] as CategoryKey[]).map((key) => (
            <section className="card" key={key}>
              <div className="card-head">
                <h3>{CATEGORY_LABEL[key]}</h3>
                <Help>Conte apenas quem está trabalhando hoje. Quem está afastado por muito tempo pode ser lançado depois na etapa de ausências.</Help>
              </div>
              <div className="big-number-row">
                <NumberField
                  value={project.categories[key].staffCount}
                  onChange={(v) =>
                    onPatch({
                      categories: {
                        ...project.categories,
                        [key]: { ...project.categories[key], staffCount: v },
                      },
                    })
                  }
                  min={0}
                  max={9999}
                  ariaLabel={`Quantidade atual de ${CATEGORY_LABEL[key]}`}
                />
                <span>profissionais ativos</span>
              </div>
              {project.team.length > 0 ? (
                <details className="names-details">
                  <summary>Nomes importados da planilha ({project.team.filter((m) => memberCategory(m) === key).length})</summary>
                  <ul>
                    {project.team
                      .filter((m) => memberCategory(m) === key)
                      .map((m) => (
                        <li key={m.id}>{m.name || 'Sem nome'}</li>
                      ))}
                  </ul>
                  <button className="btn btn-small btn-ghost" onClick={() => switchMode('list')}>
                    Usar a lista de nomes
                  </button>
                </details>
              ) : null}
            </section>
          ))}
        </div>
      ) : project.team.length === 0 ? (
        <EmptyState
          icon="users"
          title="Nenhum profissional cadastrado"
          action={
            <div className="row-actions center">
              <button className="btn btn-primary" onClick={() => add('Enfermeiro')}>
                <Icon name="plus" /> Adicionar enfermeiro(a)
              </button>
              <button className="btn btn-ghost" onClick={() => add('Técnico de Enfermagem')}>
                <Icon name="plus" /> Adicionar técnico(a)/auxiliar
              </button>
            </div>
          }
        >
          Comece adicionando quem faz parte da equipe. Se preferir, use “Só a quantidade” acima.
        </EmptyState>
      ) : (
        <div className="stack-lg">
          {(['enf', 'tec'] as CategoryKey[]).map((key) => {
            const members = project.team.filter((m) => memberCategory(m) === key);
            return (
              <section className="card" key={key}>
                <div className="card-head">
                  <div>
                    <h3>{CATEGORY_LABEL[key]}</h3>
                    <p className="muted small">
                      {counts[key].active} ativos
                      {counts[key].onLeave ? ` · ${counts[key].onLeave} afastados` : ''}
                      {counts[key].inactive ? ` · ${counts[key].inactive} inativos` : ''}
                    </p>
                  </div>
                  <button
                    className="btn btn-small btn-ghost"
                    onClick={() => add(key === 'enf' ? 'Enfermeiro' : 'Técnico de Enfermagem')}
                  >
                    <Icon name="plus" size={15} /> Adicionar
                  </button>
                </div>

                {members.length === 0 ? (
                  <p className="muted small">Nenhum profissional nesta categoria.</p>
                ) : (
                  <div className="member-list">
                    {members.map((m) => (
                      <div className={`member-row status-${m.status}`} key={m.id}>
                        <input
                          className="input member-name"
                          value={m.name}
                          onChange={(e) => update(m.id, { name: e.target.value })}
                          placeholder="Nome do profissional"
                          aria-label="Nome do profissional"
                        />
                        <select
                          className="input member-role"
                          value={m.role}
                          onChange={(e) => update(m.id, { role: e.target.value as Role })}
                          aria-label="Categoria"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <select
                          className="input member-status"
                          value={m.status}
                          onChange={(e) => update(m.id, { status: e.target.value as TeamMember['status'] })}
                          aria-label="Situação"
                        >
                          <option value="active">Ativo</option>
                          <option value="leave">Afastado</option>
                          <option value="inactive">Inativo</option>
                        </select>
                        <div className="member-hours">
                          <NumberField
                            value={m.weeklyHours}
                            onChange={(v) => update(m.id, { weeklyHours: v })}
                            min={0}
                            max={80}
                            suffix="h/sem"
                            ariaLabel="Horas por semana"
                          />
                        </div>
                        <input
                          className="input member-note"
                          value={m.note}
                          onChange={(e) => update(m.id, { note: e.target.value })}
                          placeholder="Observação (opcional)"
                          aria-label="Observação"
                        />
                        <button
                          className="icon-btn danger"
                          onClick={() => remove(m.id)}
                          title="Remover"
                          aria-label={`Remover ${m.name || 'profissional'}`}
                        >
                          <Icon name="trash" size={17} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="callout callout-info">
        <Icon name="info" />
        <div>
          <strong>Mudou o quadro?</strong>
          <p>
            {counting
              ? 'Ajuste a quantidade sempre que alguém entrar ou sair. Se quiser registrar nomes, afastamentos e observações, use “Listar por nome”.'
              : 'Edite o nome, troque a categoria ou marque como afastado. O cálculo atualiza na hora e o histórico não é perdido. Categorias antigas podem ser renomeadas livremente.'}
          </p>
        </div>
      </div>

      <div className="view-nav">
        <button className="btn btn-ghost" onClick={onBack}>
          <Icon name="arrowLeft" size={17} /> Voltar
        </button>
        <button className="btn btn-primary" onClick={onNext}>
          Continuar para a produção <Icon name="arrowRight" size={17} />
        </button>
      </div>
    </div>
  );
}
