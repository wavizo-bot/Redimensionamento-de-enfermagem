import { useEffect, useState } from 'react';
import type { Workspace } from '../types';
import {
  checkRemote,
  cloudAvailable,
  cloudLogin,
  cloudLoginExternal,
  cloudLogout,
  downloadWorkspace,
  getCloudState,
  hasMeaningfulData,
  hashWorkspace,
  uploadWorkspace,
  type HostResult,
  type RemoteInfo,
} from '../lib/drive';
import { Icon } from '../components/Icons';
import { Modal } from '../components/ui';

const fmt = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export function SyncModal({
  workspace,
  onClose,
  onApplyRemote,
  onMarkSynced,
}: {
  workspace: Workspace;
  onClose: () => void;
  onApplyRemote: (ws: Workspace, remoteModifiedTime: number, hash: string) => void;
  onMarkSynced: (info: { lastSyncedAt: number; lastSyncedHash: string; remoteModifiedTime: number }) => void;
}) {
  const available = cloudAvailable();
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [remote, setRemote] = useState<RemoteInfo | null>(null);
  const [conflict, setConflict] = useState<{ modifiedTime: number; size: number } | null>(null);

  const localHasData = hasMeaningfulData(workspace);

  const refreshRemote = async (firstLoad = false) => {
    setChecking(true);
    try {
      const res = await checkRemote();
      if (!res.ok) {
        setError(res.error || 'Não foi possível consultar a nuvem.');
        setRemote(null);
        return;
      }
      const info: RemoteInfo = {
        exists: Boolean(res.exists),
        modifiedTime: res.modifiedTime ?? 0,
        size: res.size ?? 0,
      };
      setRemote(info);
      if (firstLoad && info.exists && !localHasData) {
        setNote('Existe um backup na nuvem e este computador está vazio. Baixe o backup para começar.');
      }
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!available) return;
    let alive = true;
    (async () => {
      const state = await getCloudState();
      if (!alive) return;
      setSignedIn(state.signedIn);
      setEmail(state.email);
      if (state.signedIn) await refreshRemote(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  const applyLogin = async (res: HostResult) => {
    if (!res.ok) {
      setError(res.error || 'Não foi possível conectar ao Google Drive.');
      return;
    }
    const state = await getCloudState();
    setSignedIn(state.signedIn);
    setEmail(state.email || res.email || '');
    await refreshRemote(true);
    setNote('Conta conectada. Escolha abaixo o que fazer com o backup.');
  };

  const login = async () => {
    setBusy('login');
    setError('');
    setNote('');
    try {
      await applyLogin(await cloudLogin());
    } finally {
      setBusy('');
    }
  };

  const loginExternal = async () => {
    setBusy('external');
    setError('');
    setNote('');
    try {
      await applyLogin(await cloudLoginExternal());
    } finally {
      setBusy('');
    }
  };

  const logout = async () => {
    setBusy('logout');
    try {
      await cloudLogout();
      setSignedIn(false);
      setEmail('');
      setRemote(null);
      setConflict(null);
      setNote('Conta desconectada deste computador.');
    } finally {
      setBusy('');
    }
  };

  const doUpload = async () => {
    if (!localHasData) {
      setError('Este computador não tem dados para enviar. Preencha um dimensionamento antes.');
      return;
    }
    setBusy('upload');
    setError('');
    setNote('');
    try {
      const res = await uploadWorkspace(workspace);
      if (!res.ok) {
        setError(res.error || 'Falha ao enviar o backup.');
        return;
      }
      const hash = await hashWorkspace(workspace);
      onMarkSynced({
        lastSyncedAt: Date.now(),
        lastSyncedHash: hash,
        remoteModifiedTime: res.modifiedTime ?? Date.now(),
      });
      setConflict(null);
      await refreshRemote();
      setNote('Backup enviado para o Google Drive. Os outros computadores poderão baixar esta versão.');
    } finally {
      setBusy('');
    }
  };

  const doDownload = async () => {
    setBusy('download');
    setError('');
    setNote('');
    try {
      const res = await downloadWorkspace();
      if (!res.ok || !res.workspace) {
        setError(res.error || 'Não foi possível baixar o backup.');
        return;
      }
      const hash = await hashWorkspace(res.workspace);
      onApplyRemote(res.workspace, res.modifiedTime ?? Date.now(), hash);
      setConflict(null);
      setNote('Backup aplicado neste computador.');
    } finally {
      setBusy('');
    }
  };

  const syncNow = async () => {
    if (!signedIn) return;
    setError('');
    setNote('');
    const res = await checkRemote();
    if (!res.ok) {
      setError(res.error || 'Não foi possível consultar a nuvem.');
      return;
    }
    const info: RemoteInfo = {
      exists: Boolean(res.exists),
      modifiedTime: res.modifiedTime ?? 0,
      size: res.size ?? 0,
    };
    setRemote(info);

    if (!info.exists) {
      if (!localHasData) {
        setError('Não há backup na nuvem e este computador ainda não tem dados para enviar.');
        return;
      }
      await doUpload();
      return;
    }

    const known = workspace.sync.remoteModifiedTime;
    if (known === null || info.modifiedTime !== known) {
      // Horário diferente (mesmo mais antigo) é novidade: o usuário decide.
      setConflict({ modifiedTime: info.modifiedTime, size: info.size });
      setNote('O backup na nuvem está diferente do último sincronizado. Escolha qual versão manter.');
      return;
    }

    if (localHasData) {
      await doUpload();
    } else {
      setNote('A nuvem está igual à última sincronização. Nada a fazer.');
    }
  };

  const canSync = signedIn && workspace.projects.length >= 0;

  return (
    <Modal
      title="Sincronizar com o Google Drive"
      subtitle="Use a mesma conta Google nos computadores para levar os dimensionamentos de um para o outro."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Fechar
          </button>
          {signedIn ? (
            <button className="btn btn-primary" onClick={syncNow} disabled={Boolean(busy) || checking || !canSync}>
              <Icon name="refresh" size={17} /> {busy ? 'Sincronizando…' : 'Sincronizar agora'}
            </button>
          ) : null}
        </>
      }
    >
      <div className="stack">
        {!available ? (
          <div className="callout callout-info">
            <Icon name="info" />
            <div>
              <strong>A sincronização está disponível na versão para Windows</strong>
              <p>
                No navegador, os dados ficam apenas neste computador. Instale o aplicativo do Microsoft
                Store para conectar sua conta Google e sincronizar entre computadores.
              </p>
            </div>
          </div>
        ) : null}

        {available ? (
          <div className="cloud-card">
            <div className="cloud-head">
              <div className={`cloud-dot ${signedIn ? 'on' : ''}`}>
                <Icon name={signedIn ? 'cloud' : 'cloudOff'} size={22} />
              </div>
              <div>
                <strong>{signedIn ? 'Conectado ao Google Drive' : 'Não conectado'}</strong>
                <span className="muted small">
                  {signedIn ? email || 'Conta Google conectada' : 'Conecte para sincronizar entre computadores'}
                </span>
              </div>
              {signedIn ? (
                <button className="btn btn-small btn-ghost" onClick={logout} disabled={Boolean(busy)}>
                  Desconectar
                </button>
              ) : (
                <button className="btn btn-primary" onClick={login} disabled={Boolean(busy)}>
                  <Icon name="cloud" size={17} /> {busy === 'login' ? 'Conectando…' : 'Conectar conta Google'}
                </button>
              )}
            </div>

            {!signedIn ? (
              <div className="cloud-alt">
                <button className="btn btn-small btn-ghost" onClick={loginExternal} disabled={Boolean(busy)}>
                  <Icon name="cloud" size={16} />{' '}
                  {busy === 'external' ? 'Abrindo o navegador…' : 'Conectar pelo navegador padrão'}
                </button>
                <span className="muted small">
                  Use esta opção se a janela do Google não carregar dentro do aplicativo.
                </span>
              </div>
            ) : null}

            {signedIn ? (
              <>
                <div className="cloud-status">
                  <div>
                    <span>Backup na nuvem</span>
                    <strong>{checking ? 'Consultando…' : remote?.exists ? 'Existe' : 'Ainda não existe'}</strong>
                    <em>{remote?.exists ? `Atualizado em ${fmt(remote.modifiedTime)}` : 'Envie este computador para criar'}</em>
                  </div>
                  <div>
                    <span>Última sincronização neste PC</span>
                    <strong>{fmt(workspace.sync.lastSyncedAt)}</strong>
                    <em>{workspace.projects.length} dimensionamento(s) local(is)</em>
                  </div>
                </div>

                {conflict ? (
                  <div className="conflict-box">
                    <div className="conflict-head">
                      <Icon name="alert" size={18} />
                      <strong>Existe uma versão diferente na nuvem</strong>
                    </div>
                    <p className="muted small">
                      Backup de {fmt(conflict.modifiedTime)}
                      {conflict.size ? ` · ${(conflict.size / 1024).toFixed(1)} KB` : ''}. Baixar substitui os
                      dados deste computador; enviar substitui a versão da nuvem.
                    </p>
                    <div className="row-actions">
                      <button className="btn btn-ghost" onClick={doDownload} disabled={Boolean(busy)}>
                        <Icon name="download" size={16} /> Baixar da nuvem
                      </button>
                      <button className="btn btn-primary" onClick={doUpload} disabled={Boolean(busy) || !localHasData}>
                        <Icon name="upload" size={16} /> Enviar deste computador
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="row-actions">
                    <button className="btn btn-ghost" onClick={() => refreshRemote()} disabled={checking || Boolean(busy)}>
                      <Icon name="refresh" size={16} /> Verificar nuvem
                    </button>
                    <button className="btn btn-ghost" onClick={doDownload} disabled={Boolean(busy) || !remote?.exists}>
                      <Icon name="download" size={16} /> Baixar backup
                    </button>
                    <button className="btn btn-primary" onClick={doUpload} disabled={Boolean(busy) || !localHasData}>
                      <Icon name="upload" size={16} /> Enviar este computador
                    </button>
                  </div>
                )}
              </>
            ) : null}

            {note ? (
              <div className="feedback feedback-info">
                <Icon name="info" size={16} /> {note}
              </div>
            ) : null}
            {error ? (
              <div className="feedback feedback-error">
                <Icon name="alert" size={16} /> {error}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="callout callout-info">
          <Icon name="shield" />
          <div>
            <strong>Como funciona</strong>
            <p>
              O backup é gravado em uma pasta privada do seu Google Drive (appDataFolder), invisível no
              Drive comum e acessível somente por este aplicativo. Ao conectar, o navegador padrão do
              Windows abre para você escolher a conta; nenhuma senha é digitada dentro do aplicativo.
              Nada é enviado sem você conectar a conta. A versão da nuvem nunca é apagada por acidente:
              você escolhe quando baixar ou enviar.
            </p>
          </div>
        </div>

        <p className="muted small">
          Se a conta estiver errada ou o acesso tiver sido revogado, desconecte e conecte novamente.
          Nenhuma senha do Google é armazenada pelo aplicativo.
        </p>
      </div>
    </Modal>
  );
}
