import type { Project, Workspace } from '../types';
import { calcProject, n } from '../lib/calc';
import { CATEGORY_SHORT } from '../lib/defaults';
import { Icon } from '../components/Icons';

function lastUpdate(p: Project): string {
  try {
    return new Date(p.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export function HomeView({
  workspace,
  onNew,
  onDemo,
  onOpen,
  onDuplicate,
  onDelete,
  onImport,
  onHelp,
}: {
  workspace: Workspace;
  onNew: () => void;
  onDemo: () => void;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onImport: () => void;
  onHelp: () => void;
}) {
  const projects = workspace.projects;
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <Icon name="sparkles" size={16} /> Planejamento de equipe
          </span>
          <h1>Dimensionamento de enfermagem sem complicação</h1>
          <p>
            Calcule quantos enfermeiros e técnicos sua unidade precisa, com o método WISN/WPSN do
            Parecer Normativo COFEN nº 1/2024. Você informa a produção e as ausências; o aplicativo
            faz as contas e gera as planilhas prontas.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" onClick={onNew}>
              <Icon name="plus" /> Novo dimensionamento
            </button>
            <button className="btn btn-ghost btn-lg" onClick={onImport}>
              <Icon name="upload" /> Importar planilha do Excel
            </button>
          </div>
          <p className="hero-note">
            Tudo fica salvo neste computador. A sincronização com o Google Drive é opcional e serve
            para usar o mesmo dimensionamento em outros computadores.
          </p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-card art-card-a">
            <span className="art-label">Enfermeiros</span>
            <strong>4</strong>
            <span className="art-sub">equipe atual</span>
          </div>
          <div className="art-card art-card-b">
            <span className="art-label">Necessário</span>
            <strong>3,6</strong>
            <span className="art-sub">pelo método WISN</span>
          </div>
          <div className="art-bars">
            <span style={{ height: '48%' }} />
            <span style={{ height: '72%' }} />
            <span style={{ height: '38%' }} />
            <span style={{ height: '88%' }} />
            <span style={{ height: '61%' }} />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>Meus dimensionamentos</h2>
            <p className="muted">
              {projects.length === 0
                ? 'Nenhum dimensionamento criado ainda.'
                : `${projects.length} ${projects.length === 1 ? 'dimensionamento salvo' : 'dimensionamentos salvos'}`}
            </p>
          </div>
          {projects.length > 0 ? (
            <div className="row-actions">
              <button className="btn btn-ghost" onClick={onImport}>
                <Icon name="upload" size={17} /> Importar
              </button>
              <button className="btn btn-primary" onClick={onNew}>
                <Icon name="plus" size={17} /> Novo
              </button>
            </div>
          ) : null}
        </div>

        {projects.length === 0 ? (
          <div className="welcome-grid">
            <article className="welcome-card">
              <div className="welcome-step">1</div>
              <h3>Informe a unidade e o período</h3>
              <p>Nome, cidade e jornada de trabalho. Você pode deixar o nome em branco se preferir.</p>
            </article>
            <article className="welcome-card">
              <div className="welcome-step">2</div>
              <h3>Confira a equipe e a produção</h3>
              <p>
                Importe a planilha que você já usa ou digite apenas os totais anuais. As faltas não
                lançadas são tratadas como presença.
              </p>
            </article>
            <article className="welcome-card">
              <div className="welcome-step">3</div>
              <h3>Veja o resultado e exporte</h3>
              <p>
                O aplicativo mostra o quadro necessário e gera um Excel com as abas de enfermeiros e
                técnicos prontas para atualizar.
              </p>
            </article>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((p) => {
              const r = calcProject(p);
              const deficit = r.enf.required > 0 || r.tec.required > 0;
              return (
                <article className="project-card" key={p.id}>
                  <div className="project-top">
                    <div className="project-icon">
                      <Icon name="clipboard" />
                    </div>
                    <div className="project-title">
                      <h3>{p.unitName || 'Unidade sem nome'}</h3>
                      <p>
                        {p.city ? `${p.city} · ` : ''}
                        {p.periodLabel}
                      </p>
                    </div>
                  </div>
                  <div className="project-stats">
                    <div>
                      <span>{CATEGORY_SHORT.enf}</span>
                      <strong>
                        {r.enf.current}
                        <small> / {r.enf.required ? r.enf.required.toFixed(1) : '—'}</small>
                      </strong>
                      <em className={`mini mini-${r.enf.pressure}`}>
                        {r.enf.pressure === 'deficit'
                          ? 'déficit'
                          : r.enf.pressure === 'attention'
                            ? 'atenção'
                            : r.enf.pressure === 'empty'
                              ? 'sem dados'
                              : 'ok'}
                      </em>
                    </div>
                    <div>
                      <span>{CATEGORY_SHORT.tec}</span>
                      <strong>
                        {r.tec.current}
                        <small> / {r.tec.required ? r.tec.required.toFixed(1) : '—'}</small>
                      </strong>
                      <em className={`mini mini-${r.tec.pressure}`}>
                        {r.tec.pressure === 'deficit'
                          ? 'déficit'
                          : r.tec.pressure === 'attention'
                            ? 'atenção'
                            : r.tec.pressure === 'empty'
                              ? 'sem dados'
                              : 'ok'}
                      </em>
                    </div>
                  </div>
                  <div className="project-foot">
                    <span className="muted small">Atualizado em {lastUpdate(p)}</span>
                    <div className="row-actions">
                      <button className="icon-btn" title="Duplicar" onClick={() => onDuplicate(p.id)}>
                        <Icon name="file" size={17} />
                      </button>
                      <button className="icon-btn danger" title="Excluir" onClick={() => onDelete(p.id)}>
                        <Icon name="trash" size={17} />
                      </button>
                      <button className="btn btn-small btn-primary" onClick={() => onOpen(p.id)}>
                        Abrir <Icon name="arrowRight" size={15} />
                      </button>
                    </div>
                  </div>
                  {!deficit ? (
                    <p className="project-hint">
                      Dica: informe a produção anual para ver a quantidade necessária.
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="home-bottom">
        <div className="tip-card">
          <Icon name="help" />
          <div>
            <h3>Não sabe o que é dimensionamento?</h3>
            <p>
              Em poucas palavras: é calcular quantos profissionais são necessários para dar conta do
              trabalho da unidade com segurança. Veja o guia rápido.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onHelp}>
            Entender o método
          </button>
        </div>
        <div className="tip-card tip-muted">
          <Icon name="shield" />
          <div>
            <h3>Seus dados ficam com você</h3>
            <p>
              O aplicativo funciona offline. A nuvem só é usada se você conectar sua conta Google, e
              os arquivos ficam em uma área privada do Drive.
            </p>
          </div>
        </div>
      </section>

      {projects.length === 0 ? (
        <p className="demo-line">
          Quer ver como fica antes de começar?{' '}
          <button className="link" onClick={onDemo}>
            Abrir um exemplo preenchido
          </button>
          .
        </p>
      ) : null}
    </div>
  );
}
