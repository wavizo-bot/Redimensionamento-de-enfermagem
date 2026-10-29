import type { Workspace } from '../types';
import { normalizeWorkspace } from './storage';

interface DriveBridge {
  GetState(): Promise<string>;
  Login(): Promise<string>;
  LoginExternal?(): Promise<string>;
  Logout(): Promise<string>;
  CheckRemote(): Promise<string>;
  Upload(payload: string): Promise<string>;
  Download(): Promise<string>;
  GetAppVersion(): Promise<string | null>;
  SaveFile?(fileName: string, base64: string): Promise<string>;
  Quit(): string;
}

declare global {
  interface Window {
    dimensionamentoDrive?: DriveBridge;
    chrome?: {
      webview?: {
        hostObjects?: Record<string, DriveBridge | undefined>;
      };
    };
  }
}

export interface CloudState {
  signedIn: boolean;
  email: string;
}

export interface RemoteInfo {
  exists: boolean;
  modifiedTime: number;
  size: number;
}

export interface HostResult {
  ok: boolean;
  error?: string;
  email?: string;
  backedUpAt?: number;
  size?: number;
  exists?: boolean;
  modifiedTime?: number;
  payload?: string;
}

export const bridge = (): DriveBridge | undefined => {
  if (typeof window === 'undefined') return undefined;
  // O WebView2 expõe o host object em chrome.webview.hostObjects.<nome>.
  // window.<nome> fica como atalho para testes e navegadores comuns.
  return window.dimensionamentoDrive ?? window.chrome?.webview?.hostObjects?.dimensionamentoDrive;
};

export const cloudAvailable = (): boolean => Boolean(bridge());

const parse = <T>(raw: string | null | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export async function getCloudState(): Promise<CloudState> {
  const host = bridge();
  if (!host) return { signedIn: false, email: '' };
  try {
    const raw = await host.GetState();
    return parse<CloudState>(raw, { signedIn: false, email: '' });
  } catch {
    return { signedIn: false, email: '' };
  }
}

export async function cloudLogin(): Promise<HostResult> {
  const host = bridge();
  if (!host) return { ok: false, error: 'A conexão com o Google Drive está disponível na versão instalada para Windows.' };
  try {
    return parse<HostResult>(await host.Login(), { ok: false, error: 'Resposta inválida do aplicativo.' });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Alternativa quando o Google recusa a janela interna: abre o navegador padrão. */
export async function cloudLoginExternal(): Promise<HostResult> {
  const host = bridge();
  if (!host?.LoginExternal) {
    return { ok: false, error: 'A conexão pelo navegador está disponível apenas na versão instalada mais recente.' };
  }
  try {
    return parse<HostResult>(await host.LoginExternal(), { ok: false, error: 'Resposta inválida do aplicativo.' });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function cloudLogout(): Promise<HostResult> {
  const host = bridge();
  if (!host) return { ok: false, error: 'Disponível apenas na versão instalada.' };
  try {
    return parse<HostResult>(await host.Logout(), { ok: false });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function checkRemote(): Promise<HostResult> {
  const host = bridge();
  if (!host) return { ok: false, error: 'Disponível apenas na versão instalada.' };
  try {
    return parse<HostResult>(await host.CheckRemote(), { ok: false, error: 'Sem resposta do aplicativo.' });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function uploadWorkspace(ws: Workspace): Promise<HostResult> {
  const host = bridge();
  if (!host) return { ok: false, error: 'Disponível apenas na versão instalada.' };
  if (!hasMeaningfulData(ws)) {
    return { ok: false, error: 'A base está vazia. Preencha os dados antes de enviar para a nuvem.' };
  }
  const payload = JSON.stringify({
    app: 'dimensionamento-enfermagem',
    schema: 1,
    savedAt: Date.now(),
    workspace: { projects: ws.projects, activeProjectId: ws.activeProjectId },
  });
  try {
    return parse<HostResult>(await host.Upload(payload), { ok: false, error: 'Sem resposta do aplicativo.' });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function downloadWorkspace(): Promise<{ ok: boolean; workspace?: Workspace; modifiedTime?: number; error?: string }> {
  const host = bridge();
  if (!host) return { ok: false, error: 'Disponível apenas na versão instalada.' };
  try {
    const raw = await host.Download();
    const res = parse<HostResult>(raw, { ok: false, error: 'Sem resposta do aplicativo.' });
    if (!res.ok || !res.payload) return { ok: false, error: res.error || 'Não foi possível baixar.' };
    let payload: unknown;
    try {
      payload = JSON.parse(res.payload);
    } catch {
      return { ok: false, error: 'O arquivo na nuvem está corrompido.' };
    }
    const obj = payload as { app?: string; workspace?: unknown };
    if (obj?.app !== 'dimensionamento-enfermagem' || !obj.workspace) {
      return { ok: false, error: 'O arquivo na nuvem não é um backup deste aplicativo.' };
    }
    const ws = normalizeWorkspace(obj.workspace);
    if (ws.projects.length === 0) {
      return { ok: false, error: 'O backup na nuvem não contém dimensionamentos.' };
    }
    return { ok: true, workspace: ws, modifiedTime: res.modifiedTime };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function hasMeaningfulData(ws: Workspace): boolean {
  if (ws.projects.length === 0) return false;
  return ws.projects.some((p) => {
    if (p.unitName.trim().length > 0) return true;
    if (p.team.length > 0) return true;
    const prod = (key: 'enf' | 'tec') =>
      Object.values(p.categories[key].production).some((v) => Number(v) > 0);
    return prod('enf') || prod('tec');
  });
}

export async function hashWorkspace(ws: Workspace): Promise<string> {
  const canonical = JSON.stringify({ projects: ws.projects, activeProjectId: ws.activeProjectId });
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback simples (não criptográfico) para ambientes sem Web Crypto.
  let h = 0;
  for (let i = 0; i < canonical.length; i += 1) {
    h = (h * 31 + canonical.charCodeAt(i)) | 0;
  }
  return `fallback-${Math.abs(h)}`;
}

export async function getAppVersion(): Promise<string | null> {
  const host = bridge();
  if (!host) return null;
  try {
    return await host.GetAppVersion();
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function browserDownload(fileName: string, bytes: Uint8Array, mime: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Salva um arquivo pelo host nativo (diálogo do Windows) ou, na web, pelo download do navegador. */
export async function saveBinaryFile(fileName: string, bytes: Uint8Array, mime: string): Promise<void> {
  const host = bridge();
  if (host?.SaveFile) {
    try {
      const res = parse<HostResult>(await host.SaveFile(fileName, bytesToBase64(bytes)), { ok: false });
      if (res.ok) return;
      if (res.error && !/cancel/i.test(res.error)) throw new Error(res.error);
      return;
    } catch (e) {
      if (e instanceof Error && /cancel/i.test(e.message)) return;
      throw e;
    }
  }
  browserDownload(fileName, bytes, mime);
}

export function quitApp(): void {
  try {
    bridge()?.Quit();
  } catch {
    /* ignore */
  }
}
