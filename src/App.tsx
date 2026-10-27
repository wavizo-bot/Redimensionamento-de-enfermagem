import { useEffect, useMemo, useState } from 'react';
import type { Project, Workspace } from './types';
import { makeDemoProject, makeProject } from './lib/defaults';
import { loadWorkspace, saveWorkspace } from './lib/storage';
import { calcProject, exportSheetNames } from './lib/calc';
import { getAppVersion } from './lib/drive';
import { APP_NAME, APP_PUBLISHER, CONTACT_EMAIL, LEGAL_URL, PRIVACY_URL, SITE_URL, TERMS_URL } from './lib/site';
import { Icon, LogoMark } from './components/Icons';
import { EmptyState } from './components/ui';
import { HelpModal } from './components/HelpModal';
import { ImportModal } from './components/ImportModal';
import { SyncModal } from './components/SyncModal';
import { HomeView } from './views/HomeView';
import { SetupView } from './views/SetupView';
import { TeamView } from './views/TeamView';
import { ProductionView } from './views/ProductionView';
import { AbsenceView } from './views/AbsenceView';
import { ResultsView } from './views/ResultsView';

type ModalKind = 'help' | 'import' | 'sync' | 'about' | null;

const STEPS = [
  { title: 'Unidade', hint: 'Identificação e jornada', icon: 'home' as const },
  { title: 'Equipe', hint: 'Quem trabalha hoje', icon: 'users' as const },
  { title: 'Produção', hint: 'Procedimentos e tempos', icon: 'activity' as const },
  { title: 'Ausências', hint: 'Férias e licenças', icon: 'calendar' as const },
  { title: 'Resultado', hint: 'Quadro e exportação', icon: 'chart' as const },
];

function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => loadWorkspace() ?? {
    schema: 1,
    projects: [],
    activeProjectId: null,
    sync: { lastSyncedAt: null, lastSyncedHash: null, remoteModifiedTime: null },
    updatedAt: new Date().toISOString(),
  });
  const [screen, setScreen] = useState<'home' | 'project'>('home');
  const [step, setStep] = useState(0);
  const [modal, setModal] = useState<ModalKind>(null);
  const [toast, setToast] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [version, setVersion] = useState<string>(__APP_VERSION__);

  const project = workspace.projects.find((p) => p.id === workspace.activeProjectId) ?? null;

  useEffect(() => {
    const timer = setTimeout(() => saveWorkspace(workspace), 300);
    return () => clearTimeout(timer);
  }, [workspace]);

  useEffect(() => {
    let alive = true;
    getAppVersion().then((v) => {
      if (alive && v) setVersion(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const stamp = () => new Date().toISOString();

  const patchProject = (patch: Partial<Project>) => {
    setWorkspace((ws) => ({
      ...ws,
      projects: ws.projects.map((p) => (p.id === ws.activeProjectId ? { ...p, ...patch, updatedAt: stamp() } : p)),
      updatedAt: stamp(),
    }));
  };

  const addProject = (next: Project, message: string) => {
    setWorkspace((ws) => ({
      ...ws,
      projects: [next, ...ws.projects],
      activeProjectId: next.id,
      updatedAt: stamp(),
    }));
    setScreen('project');
    setStep(0);
    setModal(null);
    setToast({ tone: 'ok', text: message });
  };

  const newProject = () => {
    addProject(makeProject(), 'Novo dimensionamento criado.');
  };

  const demoProject = () => {
    addProject(makeDemoProject(), 'Exemplo preenchido aberto. Altere os dados à vontade.');
  };

  const openProject = (id: string) => {
    setWorkspace((ws) => ({ ...ws, activeProjectId: id }));
    setScreen('project');
    setStep(0);
  };

  const duplicateProject = (id: string) => {
    const source = workspace.projects.find((p) => p.id === id);
    if (!source) return;
    const copy: Project = {
      ...JSON.parse(JSON.stringify(source)),
      id: makeProject().id,
      unitName: source.unitName ? `${source.unitName} (cópia)` : '',
      createdAt: stamp(),
      updatedAt: stamp(),
    };
    addProject(copy, 'Dimensionamento duplicado.');
  };

  const deleteProject = (id: string) => {
    const target = workspace.projects.find((p) => p.id === id);
    if (!target) return;
    const label = target.unitName || 'este dimensionamento';
    if (!window.confirm(`Excluir ${label}? Esta ação não pode ser desfeita.`)) return;
    setWorkspace((ws) => {
      const projects = ws.projects.filter((p) => p.id !== id);
      return {
        ...ws,
        projects,
        activeProjectId: ws.activeProjectId === id ? projects[0]?.id ?? null : ws.activeProjectId,
        updatedAt: stamp(),
      };
    });
    setToast({ tone: 'info', text: 'Dimensionamento excluído.' });
  };

  const applyImport = (next: Project, replace: boolean) => {
    if (replace && project) {
      setWorkspace((ws) => ({
        ...ws,
        projects: ws.projects.map((p) => (p.id === project.id ? { ...next, id: p.id, createdAt: p.createdAt } : p)),
        updatedAt: stamp(),
      }));
      setModal(null);
      setStep(2);
      setToast({ tone: 'ok', text: 'Dados da planilha aplicados a este dimensionamento.' });
      return;
    }
    addProject(next, 'Dimensionamento criado a partir da planilha.');
  };

  const applyRemote = (remote: Workspace, modifiedTime: number, hash: string) => {
    setWorkspace({
      ...remote,
      sync: {
        lastSyncedAt: Date.now(),
        lastSyncedHash: hash,
        remoteModifiedTime: modifiedTime,
      },
      updatedAt: stamp(),
    });
    setScreen('home');
    setModal(null);
    setToast({ tone: 'ok', text: 'Backup da nuvem aplicado neste computador.' });
  };

  const markSynced = (info: { lastSyncedAt: number; lastSyncedHash: string; remoteModifiedTime: number }) => {
    setWorkspace((ws) => ({ ...ws, sync: info, updatedAt: ws.updatedAt }));
  };

  const openHelp = () => setModal('help');

  const result = useMemo(() => (project ? calcProject(project) : null), [project]);
  const synced = workspace.sync.lastSyncedAt !== null && workspace.sync.lastSyncedHash !== null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <LogoMark size={38} />
          <div className="brand-text">
            <strong>{APP_NAME}</strong>
            <span>{APP_PUBLISHER} · versão {version}</span>
          </div>
        </div>

        <nav className="top-actions" aria-label="Ações principais">
          {screen === 'project' ? (
            <button className="btn btn-small btn-ghost" onClick={() => setScreen('home')}>
              <Icon name="home" size={16} /> Início
            </button>
          ) : null}
          <button className="btn btn-small btn-ghost" onClick={() => setModal('sync')} title="Sincronizar com o Google Drive">
            <Icon name={synced ? 'cloud' : 'cloudOff'} size={16} />
            <span className="hide-sm">{synced ? 'Sincronizado' : 'Nuvem'}</span>
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => setModal('help')} title="Ajuda">
            <Icon name="help" size={16} />
            <span className="hide-sm">Ajuda</span>
          </button>
          <button className="icon-btn" onClick={() => setModal('about')} title="Sobre o aplicativo" aria-label="Sobre o aplicativo">
            <Icon name="info" size={18} />
          </button>
        </nav>
      </header>

      {screen === 'project' && project ? (
        <div className="workspace">
          <aside className="rail">
            <div className="rail-project">
              <span className="eyebrow">Dimensionamento</span>
              <strong>{project.unitName || 'Unidade sem nome'}</strong>
              <em>{project.periodLabel}</em>
            </div>
            <nav className="steps" aria-label="Etapas do dimensionamento">
              {STEPS.map((item, index) => (
                <button
                  key={item.title}
                  className={`step ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`}
                  onClick={() => setStep(index)}
                >
                  <span className="step-icon">
                    {index < step ? <Icon name="check" size={16} /> : <Icon name={item.icon} size={17} />}
                  </span>
                  <span className="step-text">
                    <strong>
                      {index + 1}. {item.title}
                    </strong>
                    <em>{item.hint}</em>
                  </span>
                </button>
              ))}
            </nav>

            {result ? (
              <div className="rail-summary">
                <span className="eyebrow">Resumo</span>
                <div>
                  <span>Enfermeiros</span>
                  <strong>
                    {result.enf.current} / {result.enf.required > 0 ? result.enf.required.toFixed(1) : '—'}
                  </strong>
                </div>
                <div>
                  <span>Técnicos/aux.</span>
                  <strong>
                    {result.tec.current} / {result.tec.required > 0 ? result.tec.required.toFixed(1) : '—'}
                  </strong>
                </div>
                <button className="btn btn-small btn-primary" onClick={() => setStep(4)}>
                  Ver resultado
                </button>
              </div>
            ) : null}

            <div className="rail-foot">
              <button className="link" onClick={() => setModal('import')}>
                <Icon name="upload" size={14} /> Importar Excel
              </button>
              <span className="muted small">
                <Icon name="shield" size={13} /> Salvo neste computador
              </span>
            </div>
          </aside>

          <main className="main">
            <div className="crumb">
              <button className="link" onClick={() => setScreen('home')}>
                Meus dimensionamentos
              </button>
              <span>/</span>
              <span>{project.unitName || 'Sem nome'}</span>
              <span className="crumb-right">
                <span className="pill pill-neutral">
                  <Icon name="file" size={13} /> {exportSheetNames(project).enf}
                </span>
              </span>
            </div>

            {step === 0 ? <SetupView project={project} onPatch={patchProject} onNext={() => setStep(1)} /> : null}
            {step === 1 ? (
              <TeamView
                project={project}
                onPatch={patchProject}
                onNext={() => setStep(2)}
                onBack={() => setStep(0)}
              />
            ) : null}
            {step === 2 ? (
              <ProductionView
                project={project}
                onPatch={patchProject}
                onNext={() => setStep(3)}
                onBack={() => setStep(1)}
                onImport={() => setModal('import')}
              />
            ) : null}
            {step === 3 ? (
              <AbsenceView
                project={project}
                onPatch={patchProject}
                onNext={() => setStep(4)}
                onBack={() => setStep(2)}
                onGoTeam={() => setStep(1)}
              />
            ) : null}
            {step === 4 ? (
              <ResultsView
                project={project}
                onPatch={patchProject}
                onBack={() => setStep(3)}
                onImport={() => setModal('import')}
              />
            ) : null}
          </main>
        </div>
      ) : (
        <main className="home-main">
          <HomeView
            workspace={workspace}
            onNew={newProject}
            onDemo={demoProject}
            onOpen={openProject}
            onDuplicate={duplicateProject}
            onDelete={deleteProject}
            onImport={() => setModal('import')}
            onHelp={openHelp}
          />
          {workspace.projects.length === 0 ? (
            <div className="home-empty-extra">
              <EmptyState icon="clipboard" title="Comece pelo que você já tem">
                Se a unidade já usa a planilha de dimensionamento, importe o arquivo do Excel. O
                aplicativo reconhece a produção, os tempos, as ausências e a equipe sem você digitar
                nada de novo.
              </EmptyState>
            </div>
          ) : null}
        </main>
      )}

      <footer className="app-footer">
        <span>
          © {new Date().getFullYear()} {APP_PUBLISHER} · {APP_NAME}
        </span>
        <div className="footer-links">
          <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
            Privacidade
          </a>
          <a href={TERMS_URL} target="_blank" rel="noreferrer">
            Termos
          </a>
          <a href={LEGAL_URL} target="_blank" rel="noreferrer">
            Aviso legal
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </div>
        <span className="footer-version">v{version}</span>
      </footer>

      {modal === 'help' ? <HelpModal onClose={() => setModal(null)} /> : null}
      {modal === 'import' ? (
        <ImportModal onClose={() => setModal(null)} onApply={applyImport} activeProject={screen === 'project' ? project : null} />
      ) : null}
      {modal === 'sync' ? (
        <SyncModal workspace={workspace} onClose={() => setModal(null)} onApplyRemote={applyRemote} onMarkSynced={markSynced} />
      ) : null}
      {modal === 'about' ? (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal modal-small" role="dialog" aria-modal="true" aria-label="Sobre o aplicativo">
            <div className="modal-head">
              <div>
                <h2>Sobre o aplicativo</h2>
                <p className="modal-sub">Informações da versão e documentos legais.</p>
              </div>
              <button className="icon-btn" onClick={() => setModal(null)} aria-label="Fechar">
                <Icon name="x" />
              </button>
            </div>
            <div className="modal-body stack">
              <div className="about-brand">
                <LogoMark size={54} />
                <div>
                  <strong>{APP_NAME}</strong>
                  <span>versão {version}</span>
                  <em>publicado por {APP_PUBLISHER}</em>
                </div>
              </div>
              <p className="muted small">
                Ferramenta de apoio ao planejamento de pessoal de enfermagem pelo método WISN/WPSN. Não é
                sistema oficial, prontuário ou dispositivo médico.
              </p>
              <div className="about-links">
                <button className="link" onClick={() => window.open(SITE_URL, '_blank', 'noopener')}>
                  <Icon name="external" size={15} /> Página do projeto
                </button>
                <button className="link" onClick={() => window.open(PRIVACY_URL, '_blank', 'noopener')}>
                  <Icon name="external" size={15} /> Política de privacidade
                </button>
                <button className="link" onClick={() => window.open(TERMS_URL, '_blank', 'noopener')}>
                  <Icon name="external" size={15} /> Termos de uso
                </button>
                <button className="link" onClick={() => window.open(LEGAL_URL, '_blank', 'noopener')}>
                  <Icon name="external" size={15} /> Aviso legal
                </button>
              </div>
              <p className="muted small">
                Contato: {CONTACT_EMAIL} · (11) 97883-1938
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className={`toast toast-${toast.tone}`} role="status">
          <Icon name={toast.tone === 'error' ? 'alert' : toast.tone === 'ok' ? 'check' : 'info'} size={17} />
          {toast.text}
          <button className="icon-btn" onClick={() => setToast(null)} aria-label="Fechar aviso">
            <Icon name="x" size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default App;
