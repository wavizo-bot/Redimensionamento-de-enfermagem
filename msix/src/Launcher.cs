using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DimensionamentoDeEnfermagem
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            if (args != null && Array.IndexOf(args, "--cloud-smoke") >= 0)
            {
                CloudSmoke();
                return;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }

        // Diagnostico do OAuth/Drive sem abrir a interface do app.
        // O resultado fica em %TEMP%\dimensionamento-cloud-smoke.txt.
        private static void CloudSmoke()
        {
            string log = Path.Combine(Path.GetTempPath(), "dimensionamento-cloud-smoke.txt");
            try
            {
                File.WriteAllText(log, "Iniciando teste do Google Drive...\r\n");
                MessageBox.Show(
                    "O navegador sera aberto para autorizar o Google Drive.\r\n" +
                    "Conclua a autorizacao, volte para esta janela e aguarde o resultado.",
                    "Teste do Google Drive", MessageBoxButtons.OK, MessageBoxIcon.Information);

                DriveSync drive = new DriveSync();
                string login = Task.Run(() => drive.LoginExternal()).GetAwaiter().GetResult();
                File.AppendAllText(log, "LOGIN: " + login + "\r\n");

                if (login.IndexOf("\"ok\":true", StringComparison.Ordinal) >= 0)
                {
                    string check = Task.Run(() => drive.CheckRemote()).GetAwaiter().GetResult();
                    File.AppendAllText(log, "CHECK: " + check + "\r\n");
                    string state = Task.Run(() => drive.GetState()).GetAwaiter().GetResult();
                    File.AppendAllText(log, "STATE: " + state + "\r\n");
                    MessageBox.Show("Teste concluido. Resultado em:\r\n" + log,
                        "Teste do Google Drive", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    MessageBox.Show("O login nao foi concluido. Detalhes em:\r\n" + log,
                        "Teste do Google Drive", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
            catch (Exception ex)
            {
                try { File.AppendAllText(log, "ERRO: " + ex + "\r\n"); } catch { }
                MessageBox.Show("Falha no teste:\r\n" + ex.Message + "\r\n\r\nDetalhes em:\r\n" + log,
                    "Teste do Google Drive", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    public class MainForm : Form
    {
        private readonly WebView2 _web = new WebView2();

        // Referencia enraizada: o host object NUNCA pode ser coletado pelo GC,
        // senao as chamadas JS falham com 0x80070490 (ELEMENT_NOT_FOUND).
        private readonly DriveSync _drive;

        public MainForm()
        {
            Text = "Dimensionamento de Enfermagem";
            Width = 1320;
            Height = 880;
            MinimumSize = new System.Drawing.Size(980, 680);
            StartPosition = FormStartPosition.CenterScreen;
            _web.Dock = DockStyle.Fill;
            Controls.Add(_web);
            _drive = new DriveSync(ShowGoogleLoginPopup, this);
            Load += InitAsync;
        }

        // Login Google em janela filha com WebView2 proprio (padrao do Caderno
        // de Cuidado): abre a URL de autorizacao, intercepta o redirect de
        // loopback (http://localhost:PORTA/?code=...), devolve a URL e fecha a
        // janela sozinha. Sem navegador externo, sem abas perdidas.
        // Retorna null se cancelado/expirado.
        private Task<string> ShowGoogleLoginPopup(string authUrl)
        {
            var tcs = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
            Action open = () =>
            {
                Form loginForm = null;
                WebView2 loginWeb = null;
                System.Threading.Timer timeout = null;
                bool done = false;
                bool inFormClosed = false;
                Action<string> finish = null;
                finish = (result) =>
                {
                    if (done) return;
                    done = true;
                    try { if (timeout != null) timeout.Dispose(); } catch { }
                    tcs.TrySetResult(result);
                    try
                    {
                        if (loginForm != null && !loginForm.IsDisposed && !inFormClosed)
                        {
                            if (loginForm.InvokeRequired)
                                loginForm.BeginInvoke(new Action(() => { try { loginForm.Close(); } catch { } }));
                            else loginForm.Close();
                        }
                    }
                    catch { }
                };
                try
                {
                    loginForm = new Form();
                    loginForm.Text = "Entrar com o Google";
                    loginForm.Width = 560;
                    loginForm.Height = 700;
                    loginForm.StartPosition = FormStartPosition.CenterParent;
                    loginForm.MinimizeBox = false;
                    loginWeb = new WebView2();
                    loginWeb.Dock = DockStyle.Fill;
                    loginForm.Controls.Add(loginWeb);
                    loginForm.FormClosed += (s, e) =>
                    {
                        inFormClosed = true;
                        try { if (loginWeb != null) loginWeb.Dispose(); } catch { }
                        finish(null);
                    };
                    loginForm.Shown += async (s, e) =>
                    {
                        try
                        {
                            await loginWeb.EnsureCoreWebView2Async(null);
                            CoreWebView2 core = loginWeb.CoreWebView2;
                            core.Settings.AreDefaultContextMenusEnabled = false;
                            core.Settings.AreDevToolsEnabled = false;
                            try { core.Settings.IsStatusBarEnabled = false; } catch { }
                            core.PermissionRequested += DriveSync.DenyPermissions;
                            core.AddWebResourceRequestedFilter(
                                "http://localhost*", CoreWebView2WebResourceContext.All);
                            core.AddWebResourceRequestedFilter(
                                "http://127.0.0.1*", CoreWebView2WebResourceContext.All);
                            core.WebResourceRequested += (ss, ee) =>
                            {
                                try
                                {
                                    string url = ee.Request.Uri;
                                    string code, err;
                                    if (DriveSync.TryParseAuthRedirect(url, out code, out err)
                                        && (code != null || err != null))
                                    {
                                        byte[] body = Encoding.UTF8.GetBytes(
                                            "<!doctype html><meta charset=\"utf-8\"><title>Autorizando...</title>" +
                                            "<body style=\"font-family:sans-serif;text-align:center;padding-top:4rem;color:#444\">" +
                                            "<p>Autorizando...<br><small>Voltando para o aplicativo.</small></p></body>");
                                        var ms = new MemoryStream(body);
                                        ee.Response = core.Environment.CreateWebResourceResponse(
                                            ms, 200, "OK",
                                            "{\"Content-Type\":\"text/html; charset=utf-8\",\"Content-Length\":\"" + body.Length + "\"}");
                                        finish(url);
                                    }
                                }
                                catch { }
                            };
                            core.Navigate(authUrl);
                        }
                        catch { finish(null); }
                    };
                    timeout = new System.Threading.Timer(state => finish(null), null,
                        TimeSpan.FromMinutes(5), TimeSpan.FromMilliseconds(-1));
                    loginForm.Show(this);
                }
                catch { finish(null); }
            };
            try
            {
                if (InvokeRequired) BeginInvoke(open);
                else open();
            }
            catch { tcs.TrySetResult(null); }
            return tcs.Task;
        }

        private async void InitAsync(object s, EventArgs e)
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string wwwFolder = Path.Combine(baseDir, "www");
                if (!Directory.Exists(wwwFolder)) wwwFolder = baseDir;

                string userData = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "wavizo", "DimensionamentoDeEnfermagem", "WebView2");
                Directory.CreateDirectory(userData);

                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, userData);
                await _web.EnsureCoreWebView2Async(env);

                _web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
                _web.CoreWebView2.Settings.IsZoomControlEnabled = true;
                _web.CoreWebView2.Settings.AreDevToolsEnabled = false;
                _web.CoreWebView2.Settings.AreHostObjectsAllowed = true;
                _web.CoreWebView2.Settings.IsStatusBarEnabled = false;
                _web.CoreWebView2.PermissionRequested += DriveSync.DenyPermissions;

                _web.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "app.dimensionamento.local", wwwFolder, CoreWebView2HostResourceAccessKind.Allow);

                // Nome "dimensionamentoDrive": "sync" e reservado pelo WebView2
                // (hostObjects.sync = acessador de chamadas sincronas) e quebra o dispatch.
                _web.CoreWebView2.AddHostObjectToScript("dimensionamentoDrive", _drive);
                _web.Source = new Uri("https://app.dimensionamento.local/index.html");
            }
            catch (Exception ex)
            {
                try
                {
                    string fallback = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "www", "index.html");
                    _web.Source = new Uri(fallback);
                }
                catch { }
                MessageBox.Show("Falha ao iniciar o WebView2:\n" + ex.Message +
                    "\n\nVerifique se o Microsoft Edge WebView2 Runtime esta instalado.",
                    "Dimensionamento de Enfermagem", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    // Ponte JS <-> Google Drive. Metodos async viram Promises no JS.
    [ComVisible(true)]
    [ClassInterface(ClassInterfaceType.AutoDual)]
    public class DriveSync
    {
        private const string Scopes = "openid email profile https://www.googleapis.com/auth/drive.appdata";
        private const string BackupName = "dimensionamento-backup.json";
        private const string AppMarker = "dimensionamento-enfermagem";

        private const string AuthOkHtml =
            "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\">" +
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
            "<title>Conta conectada</title><body style=\"margin:0;font-family:'Segoe UI',system-ui,sans-serif;" +
            "background:#f6faf8;color:#10231f;display:grid;place-items:center;min-height:100vh\">" +
            "<div style=\"max-width:440px;padding:40px 32px;text-align:center;background:#fff;border:1px solid #dce7e2;" +
            "border-radius:20px;box-shadow:0 18px 50px -30px rgba(11,61,51,.45)\">" +
            "<div style=\"width:56px;height:56px;margin:0 auto 18px;border-radius:16px;background:#e8f5f0;color:#0f6b5c;" +
            "display:grid;place-items:center;font-size:28px\">&#10003;</div>" +
            "<h1 style=\"font-size:22px;margin:0 0 8px\">Conta conectada</h1>" +
            "<p style=\"margin:0;color:#42564f;line-height:1.5\">A autoriza&ccedil;&atilde;o foi conclu&iacute;da. " +
            "Pode fechar esta aba e voltar ao aplicativo.</p></div></body></html>";

        private const string AuthNotFoundHtml =
            "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>Autoriza&ccedil;&atilde;o</title>" +
            "<body style=\"font-family:sans-serif;text-align:center;padding-top:4rem;color:#444\">" +
            "<p>Aguardando a autoriza&ccedil;&atilde;o do Google.</p></body></html>";

        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
        private static readonly HttpClient Http = new HttpClient();

        // O popup interno (WebView2) e o caminho principal, igual ao Caderno de
        // Cuidado. Se o Google recusar o navegador embutido, o JS pode chamar
        // LoginExternal para abrir o navegador padrao + loopback.
        private readonly Func<string, Task<string>> _popup;
        private readonly MainForm _owner;

        public DriveSync() : this(null, null) { }

        public DriveSync(MainForm owner) : this(null, owner) { }

        public DriveSync(Func<string, Task<string>> popupOpener, MainForm owner)
        {
            _popup = popupOpener;
            _owner = owner;
        }

        // Extrai ?code= / ?error= / ?state= da URL de retorno do Google.
        public static bool TryParseAuthRedirect(string url, out string code, out string error, out string state)
        {
            code = null;
            error = null;
            state = null;
            try
            {
                if (string.IsNullOrEmpty(url)) return false;
                int q = url.IndexOf('?');
                if (q < 0) return false;
                string qs = url.Substring(q + 1);
                int h = qs.IndexOf('#');
                if (h >= 0) qs = qs.Substring(0, h);
                string[] parts = qs.Split('&');
                foreach (string part in parts)
                {
                    if (string.IsNullOrEmpty(part)) continue;
                    int eq = part.IndexOf('=');
                    string k = eq < 0 ? part : part.Substring(0, eq);
                    string v = eq < 0 ? "" : WebUtility.UrlDecode(part.Substring(eq + 1));
                    if (string.Equals(k, "code", StringComparison.OrdinalIgnoreCase)) code = v;
                    else if (string.Equals(k, "error", StringComparison.OrdinalIgnoreCase)) error = v;
                    else if (string.Equals(k, "state", StringComparison.OrdinalIgnoreCase)) state = v;
                }
                return true;
            }
            catch { return false; }
        }

        // Compatibilidade com o interceptador do popup WebView2.
        public static bool TryParseAuthRedirect(string url, out string code, out string error)
        {
            string state;
            return TryParseAuthRedirect(url, out code, out error, out state);
        }

        private static string BaseDir()
        {
            return AppDomain.CurrentDomain.BaseDirectory;
        }

        private static string DataDir()
        {
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "wavizo", "DimensionamentoDeEnfermagem");
            Directory.CreateDirectory(dir);
            return dir;
        }

        private static string TokenPath()
        {
            return Path.Combine(DataDir(), "google-token.dat");
        }

        private static Dictionary<string, object> LoadToken()
        {
            try
            {
                string path = TokenPath();
                if (!File.Exists(path)) return null;
                byte[] prot = File.ReadAllBytes(path);
                byte[] raw = ProtectedData.Unprotect(prot, null, DataProtectionScope.CurrentUser);
                return Json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(raw));
            }
            catch { return null; }
        }

        private static void SaveToken(Dictionary<string, object> t)
        {
            byte[] raw = Encoding.UTF8.GetBytes(Json.Serialize(t));
            byte[] prot = ProtectedData.Protect(raw, null, DataProtectionScope.CurrentUser);
            File.WriteAllBytes(TokenPath(), prot);
        }

        private static string Str(Dictionary<string, object> d, string k)
        {
            object v;
            if (d != null && d.TryGetValue(k, out v) && v != null) return v.ToString();
            return null;
        }

        private static Dictionary<string, string> LoadClient()
        {
            string[] candidates = new string[]
            {
                Path.Combine(BaseDir(), "google-client.json"),
                Path.Combine(BaseDir(), "www", "google-client.json"),
            };
            foreach (string p in candidates)
            {
                try
                {
                    if (!File.Exists(p)) continue;
                    Dictionary<string, object> root =
                        Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(p));
                    object inst;
                    if (root != null && root.TryGetValue("installed", out inst))
                    {
                        Dictionary<string, object> d = inst as Dictionary<string, object>;
                        if (d != null)
                        {
                            return new Dictionary<string, string>()
                            {
                                { "id", Str(d, "client_id") },
                                { "secret", Str(d, "client_secret") },
                            };
                        }
                    }
                }
                catch { }
            }
            return null;
        }

        private static string B64Url(byte[] b)
        {
            return Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }

        private static int FreePort()
        {
            System.Net.Sockets.TcpListener l =
                new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
            l.Start();
            int port = ((IPEndPoint)l.LocalEndpoint).Port;
            l.Stop();
            return port;
        }

        private static string Ok(params object[] kv)
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["ok"] = true;
            for (int i = 0; i + 1 < kv.Length; i += 2) r[(string)kv[i]] = kv[i + 1];
            return Json.Serialize(r);
        }

        private static string Fail(string message)
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["ok"] = false;
            r["error"] = message;
            return Json.Serialize(r);
        }

        public async Task<string> GetState()
        {
            await Task.Yield();
            Dictionary<string, object> t = LoadToken();
            bool signed = t != null && Str(t, "refresh_token") != null;
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["signedIn"] = signed;
            r["email"] = signed ? Str(t, "email") : null;
            r["reachable"] = false; // verificado apenas em operacoes reais
            return Json.Serialize(r);
        }

        public async Task<string> Logout()
        {
            await Task.Yield();
            try { File.Delete(TokenPath()); }
            catch { }
            return Ok();
        }

        // Privacidade: o app nao usa camera, microfone, localizacao nem notificacoes.
        public static void DenyPermissions(object sender, CoreWebView2PermissionRequestedEventArgs e)
        {
            try { e.State = CoreWebView2PermissionState.Deny; e.Handled = true; } catch { }
        }

        // Versao real do pacote instalado (lida do AppxManifest).
        public async Task<string> GetAppVersion()
        {
            await Task.Yield();
            try
            {
                string mf = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "AppxManifest.xml");
                if (File.Exists(mf))
                {
                    Match m = Regex.Match(File.ReadAllText(mf), "Version=\"([0-9.]+)\"");
                    if (m.Success) return m.Groups[1].Value;
                }
            }
            catch { }
            return null;
        }

        // Encerra o aplicativo.
        public string Quit()
        {
            try
            {
                Form f = Application.OpenForms.Count > 0 ? Application.OpenForms[0] : null;
                if (f != null) f.BeginInvoke(new Action(() => Application.Exit()));
                else Task.Run(() => System.Threading.Thread.Sleep(800)).ContinueWith(delegate { try { Environment.Exit(0); } catch { } });
            }
            catch { }
            return "closing";
        }

        // Salva um arquivo (Excel exportado) pelo dialogo nativo do Windows.
        // O JS envia base64 para atravessar a ponte COM como string.
        public async Task<string> SaveFile(string fileName, string base64)
        {
            await Task.Yield();
            try
            {
                if (string.IsNullOrEmpty(base64)) return Fail("Arquivo vazio.");
                byte[] bytes;
                try { bytes = Convert.FromBase64String(base64); }
                catch { return Fail("Arquivo invalido."); }

                string safe = SanitizeFileName(fileName);
                if (string.IsNullOrEmpty(safe)) safe = "dimensionamento.xlsx";
                string ext = Path.GetExtension(safe);
                string filter = string.IsNullOrEmpty(ext)
                    ? "Planilha do Excel (*.xlsx)|*.xlsx|Todos os arquivos (*.*)|*.*"
                    : "Planilha do Excel (*" + ext + ")|*" + ext + "|Todos os arquivos (*.*)|*.*";

                string chosen = null;
                Action pick = () =>
                {
                    using (SaveFileDialog dlg = new SaveFileDialog())
                    {
                        dlg.Title = "Salvar planilha";
                        dlg.FileName = safe;
                        dlg.Filter = filter;
                        dlg.AddExtension = true;
                        dlg.OverwritePrompt = true;
                        try
                        {
                            string downloads = Path.Combine(
                                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
                            if (Directory.Exists(downloads)) dlg.InitialDirectory = downloads;
                        }
                        catch { }
                        if (dlg.ShowDialog(_owner) == DialogResult.OK) chosen = dlg.FileName;
                    }
                };
                if (_owner != null && _owner.IsHandleCreated)
                {
                    if (_owner.InvokeRequired) _owner.Invoke(pick);
                    else pick();
                }
                else pick();

                if (string.IsNullOrEmpty(chosen)) return Fail("cancelado");
                File.WriteAllBytes(chosen, bytes);
                return Ok("path", chosen, "size", bytes.Length);
            }
            catch (Exception ex)
            {
                return Fail(ex.Message);
            }
        }

        private static string SanitizeFileName(string name)
        {
            if (string.IsNullOrEmpty(name)) return null;
            name = Path.GetFileName(name);
            foreach (char c in Path.GetInvalidFileNameChars())
                name = name.Replace(c, '-');
            return name.Trim();
        }

        // Abre o navegador padrao e espera o redirect de loopback. O listener
        // aceita IPv4 e IPv6, responde uma pagina amigavel e devolve a URL.
        private static async Task<string> WaitForOAuthRedirect(string redirectUrl, string authUrl)
        {
            Uri uri = new Uri(redirectUrl);
            int port = uri.Port;
            TcpListener v4 = new TcpListener(IPAddress.Loopback, port);
            TcpListener v6 = null;
            try
            {
                v4.Start();
                try
                {
                    v6 = new TcpListener(IPAddress.IPv6Loopback, port);
                    v6.Start();
                }
                catch { v6 = null; }

                try
                {
                    Process.Start(new ProcessStartInfo { FileName = authUrl, UseShellExecute = true });
                }
                catch (Exception ex)
                {
                    throw new InvalidOperationException(
                        "Nao foi possivel abrir o navegador padrao: " + ex.Message);
                }

                Task<TcpClient> accept4 = v4.AcceptTcpClientAsync();
                Task<TcpClient> accept6 = v6 != null ? v6.AcceptTcpClientAsync() : null;
                Task timeout = Task.Delay(TimeSpan.FromMinutes(5));

                while (true)
                {
                    Task<TcpClient> which;
                    if (accept6 == null)
                    {
                        which = accept4;
                    }
                    else
                    {
                        Task first = await Task.WhenAny(accept4, accept6, timeout);
                        if (first == timeout) return null;
                        which = first == (Task)accept4 ? accept4 : accept6;
                    }

                    Task done = await Task.WhenAny(which, timeout);
                    if (done == timeout) return null;

                    TcpClient client = await which;
                    if (which == accept4) accept4 = v4.AcceptTcpClientAsync();
                    else accept6 = v6.AcceptTcpClientAsync();

                    string requestPath = null;
                    try
                    {
                        using (client)
                        {
                            client.ReceiveTimeout = 5000;
                            using (NetworkStream ns = client.GetStream())
                            {
                                StreamReader reader = new StreamReader(ns, Encoding.ASCII, false, 2048, true);
                                string requestLine = await reader.ReadLineAsync();
                                string header;
                                int guard = 0;
                                while (!string.IsNullOrEmpty(header = await reader.ReadLineAsync()) && guard++ < 100)
                                {
                                }
                                if (!string.IsNullOrEmpty(requestLine))
                                {
                                    string[] parts = requestLine.Split(' ');
                                    if (parts.Length >= 2) requestPath = parts[1];
                                }

                                bool ok = requestPath != null
                                    && (requestPath.Contains("code=") || requestPath.Contains("error="));
                                byte[] body = Encoding.UTF8.GetBytes(ok ? AuthOkHtml : AuthNotFoundHtml);
                                string head = "HTTP/1.1 " + (ok ? "200 OK" : "404 Not Found") + "\r\n" +
                                    "Content-Type: text/html; charset=utf-8\r\n" +
                                    "Content-Length: " + body.Length + "\r\n" +
                                    "Cache-Control: no-store\r\nConnection: close\r\n\r\n";
                                byte[] headerBytes = Encoding.ASCII.GetBytes(head);
                                await ns.WriteAsync(headerBytes, 0, headerBytes.Length);
                                await ns.WriteAsync(body, 0, body.Length);
                                await ns.FlushAsync();
                            }
                        }
                    }
                    catch
                    {
                        // Conexao interrompida (favicon, preflight): segue esperando.
                    }

                    if (requestPath != null
                        && (requestPath.Contains("code=") || requestPath.Contains("error=")))
                    {
                        string full = "http://localhost:" + port + requestPath;
                        string code, error, state;
                        if (TryParseAuthRedirect(full, out code, out error, out state)) return full;
                    }
                }
            }
            finally
            {
                try { v4.Stop(); } catch { }
                try { if (v6 != null) v6.Stop(); } catch { }
            }
        }

        public Task<string> Login()
        {
            return LoginCore(true);
        }

        // Alternativa quando o Google recusa o navegador embutido.
        public Task<string> LoginExternal()
        {
            return LoginCore(false);
        }

        private async Task<string> LoginCore(bool usePopup)
        {
            try
            {
                Dictionary<string, string> client = LoadClient();
                if (client == null || string.IsNullOrEmpty(client["id"]))
                    return Fail("Arquivo de configuracao do Google ausente no pacote.");

                byte[] rnd = new byte[32];
                byte[] rndState = new byte[16];
                using (RandomNumberGenerator rng = RandomNumberGenerator.Create())
                {
                    rng.GetBytes(rnd);
                    rng.GetBytes(rndState);
                }
                string verifier = B64Url(rnd);
                string state = B64Url(rndState);
                byte[] chBytes;
                using (SHA256 sha = SHA256.Create())
                    chBytes = sha.ComputeHash(Encoding.ASCII.GetBytes(verifier));
                string challenge = B64Url(chBytes);

                int port = FreePort();
                // Regra W13: loopback com "localhost" (IP literal e recusado pelo Google).
                string redirect = "http://localhost:" + port + "/";
                string authUrl = "https://accounts.google.com/o/oauth2/auth" +
                    "?client_id=" + Uri.EscapeDataString(client["id"]) +
                    "&redirect_uri=" + Uri.EscapeDataString(redirect) +
                    "&response_type=code" +
                    "&scope=" + Uri.EscapeDataString(Scopes) +
                    "&state=" + Uri.EscapeDataString(state) +
                    "&code_challenge=" + challenge +
                    "&code_challenge_method=S256" +
                    "&access_type=offline&prompt=consent";

                string redirectUrl;
                if (usePopup)
                {
                    if (_popup == null)
                        return Fail("A janela de login nao esta disponivel. Use a opcao de conectar pelo navegador.");
                    redirectUrl = await _popup(authUrl);
                    if (string.IsNullOrEmpty(redirectUrl))
                        return Fail("Login cancelado ou tempo esgotado. Se a janela do Google nao abriu, "
                            + "use a opcao \"Conectar pelo navegador\".");
                }
                else
                {
                    redirectUrl = await WaitForOAuthRedirect(redirect, authUrl);
                    if (string.IsNullOrEmpty(redirectUrl))
                        return Fail("Login cancelado ou tempo esgotado. Tente novamente.");
                }

                string code = null, authErr = null, gotState = null;
                TryParseAuthRedirect(redirectUrl, out code, out authErr, out gotState);

                if (!string.IsNullOrEmpty(authErr))
                    return Fail(authErr == "access_denied"
                        ? "Você cancelou a autorização no Google."
                        : "Login recusado pelo Google: " + authErr);

                if (string.IsNullOrEmpty(code))
                    return Fail("O Google não devolveu o código de autorização. Tente novamente.");

                if (!string.Equals(gotState, state, StringComparison.Ordinal))
                    return Fail("A resposta do Google não confere com esta tentativa. Feche e tente novamente.");

                FormUrlEncodedContent body = new FormUrlEncodedContent(new Dictionary<string, string>()
                {
                    { "client_id", client["id"] },
                    { "client_secret", client["secret"] ?? "" },
                    { "code", code },
                    { "code_verifier", verifier },
                    { "grant_type", "authorization_code" },
                    { "redirect_uri", redirect },
                });
                HttpResponseMessage tr = await Http.PostAsync("https://oauth2.googleapis.com/token", body);
                string ts = await tr.Content.ReadAsStringAsync();
                if (!tr.IsSuccessStatusCode)
                    return Fail(DescribeTokenError(ts));
                Dictionary<string, object> tok = Json.Deserialize<Dictionary<string, object>>(ts);
                string access = Str(tok, "access_token");
                string refresh = Str(tok, "refresh_token");
                string granted = Str(tok, "scope");
                if (string.IsNullOrEmpty(granted) || granted.IndexOf("drive.appdata",
                        StringComparison.Ordinal) < 0)
                {
                    return Fail("A permissao do Google Drive nao foi concedida. "
                        + "Entre novamente e marque a caixa de acesso ao Google Drive.");
                }
                if (string.IsNullOrEmpty(refresh))
                {
                    Dictionary<string, object> old = LoadToken();
                    refresh = Str(old, "refresh_token"); // re-login pode nao devolver refresh_token
                }
                if (string.IsNullOrEmpty(access) || string.IsNullOrEmpty(refresh))
                    return Fail("O Google nao devolveu a credencial de renovacao.");

                string email = await FetchEmail(access);
                Dictionary<string, object> save = new Dictionary<string, object>();
                save["refresh_token"] = refresh;
                save["email"] = email;
                SaveToken(save);

                return Ok("email", email);
            }
            catch (Exception ex)
            {
                return Fail(ex.Message);
            }
        }

        // Upload do workspace (payload JSON produzido pelo app).
        public async Task<string> Upload(string payloadJson)
        {
            try
            {
                string access = await AccessToken();
                if (access == null) return Fail("A sessao do Google expirou. Desconecte e conecte novamente.");

                string fileId = await FindBackup(access);
                byte[] data = Encoding.UTF8.GetBytes(payloadJson ?? "{}");
                if (fileId == null)
                {
                    // multipart/related: metadados JSON + midia (form-data e rejeitado pelo Drive)
                    string meta = "{\"name\":\"" + BackupName + "\",\"parents\":[\"appDataFolder\"]}";
                    MultipartContent mp = new MultipartContent("related");
                    StringContent metaPart = new StringContent(meta, Encoding.UTF8, "application/json");
                    ByteArrayContent mediaPart = new ByteArrayContent(data);
                    mediaPart.Headers.ContentType = new MediaTypeHeaderValue("application/json");
                    mp.Add(metaPart);
                    mp.Add(mediaPart);
                    HttpRequestMessage req = new HttpRequestMessage(HttpMethod.Post,
                        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id");
                    req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
                    req.Content = mp;
                    HttpResponseMessage resp = await Http.SendAsync(req);
                    string rs = await resp.Content.ReadAsStringAsync();
                    if (!resp.IsSuccessStatusCode) return Fail("Upload: " + Snip(rs));
                    try
                    {
                        Dictionary<string, object> created = Json.Deserialize<Dictionary<string, object>>(rs);
                        fileId = Str(created, "id");
                    }
                    catch { }
                }
                else
                {
                    ByteArrayContent content = new ByteArrayContent(data);
                    content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
                    HttpRequestMessage req = new HttpRequestMessage(new HttpMethod("PATCH"),
                        "https://www.googleapis.com/upload/drive/v3/files/" + fileId + "?uploadType=media");
                    req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
                    req.Content = content;
                    HttpResponseMessage resp = await Http.SendAsync(req);
                    string rs = await resp.Content.ReadAsStringAsync();
                    if (!resp.IsSuccessStatusCode) return Fail("Upload: " + Snip(rs));
                }

                long modified = fileId == null ? 0 : await FileModified(access, fileId);
                return Ok("backedUpAt", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    "modifiedTime", modified, "size", data.Length);
            }
            catch (Exception ex)
            {
                return Fail(ex.Message);
            }
        }

        // Download do workspace. Valida o marcador do app antes de devolver.
        public async Task<string> Download()
        {
            try
            {
                string access = await AccessToken();
                if (access == null) return Fail("A sessao do Google expirou. Desconecte e conecte novamente.");
                string fileId = await FindBackup(access);
                if (fileId == null) return Fail("Nenhum backup na nuvem.");
                HttpRequestMessage req = new HttpRequestMessage(HttpMethod.Get,
                    "https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media");
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
                HttpResponseMessage resp = await Http.SendAsync(req);
                string payload = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode) return Fail("Download: " + Snip(payload));
                try
                {
                    Dictionary<string, object> p = Json.Deserialize<Dictionary<string, object>>(payload);
                    if (p == null || Str(p, "app") != AppMarker)
                        return Fail("O arquivo do Drive nao e um backup deste aplicativo.");
                }
                catch
                {
                    return Fail("O arquivo do Google Drive esta corrompido.");
                }
                long modified = await FileModified(access, fileId);
                return Ok("payload", payload, "modifiedTime", modified,
                    "size", Encoding.UTF8.GetByteCount(payload));
            }
            catch (Exception ex)
            {
                return Fail(ex.Message);
            }
        }

        // ---- internos ----

        private static async Task<string> AccessToken()
        {
            Dictionary<string, object> t = LoadToken();
            string refresh = Str(t, "refresh_token");
            if (refresh == null) return null;
            Dictionary<string, string> client = LoadClient();
            if (client == null) return null;
            FormUrlEncodedContent body = new FormUrlEncodedContent(new Dictionary<string, string>()
            {
                { "client_id", client["id"] },
                { "client_secret", client["secret"] ?? "" },
                { "refresh_token", refresh },
                { "grant_type", "refresh_token" },
            });
            HttpResponseMessage resp = await Http.PostAsync("https://oauth2.googleapis.com/token", body);
            string s = await resp.Content.ReadAsStringAsync();
            if (!resp.IsSuccessStatusCode) return null; // refresh revogado/expirado -> relogar
            Dictionary<string, object> tok = Json.Deserialize<Dictionary<string, object>>(s);
            return Str(tok, "access_token");
        }

        // Consulta leve: existe backup? Quando foi modificado? (sem baixar o conteudo)
        public async Task<string> CheckRemote()
        {
            try
            {
                string access = await AccessToken();
                if (access == null) return Fail("A sessao do Google expirou. Desconecte e conecte novamente.");
                string url = "https://www.googleapis.com/drive/v3/files" +
                    "?spaces=appDataFolder" +
                    "&q=" + Uri.EscapeDataString("name='" + BackupName + "' and trashed=false") +
                    "&fields=files(id,modifiedTime,size)&pageSize=100&orderBy=modifiedTime%20desc";
                HttpRequestMessage req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
                HttpResponseMessage resp = await Http.SendAsync(req);
                string s = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode) return Fail("Consulta: " + Snip(s));
                Dictionary<string, object> d = Json.Deserialize<Dictionary<string, object>>(s);
                object files;
                Dictionary<string, object> r = new Dictionary<string, object>();
                r["ok"] = true;
                if (d != null && d.TryGetValue("files", out files))
                {
                    // JavaScriptSerializer devolve arrays como ArrayList.
                    // Ignora backups vazios: um upload de base vazia esconderia o bom.
                    ArrayList arr = files as ArrayList;
                    Dictionary<string, object> f = PickNewestNonEmpty(arr);
                    if (f != null)
                    {
                        r["exists"] = true;
                        long size;
                        long.TryParse(Str(f, "size"), out size);
                        r["size"] = size;
                        try
                        {
                            DateTime mt = DateTime.Parse(Str(f, "modifiedTime"),
                                null, System.Globalization.DateTimeStyles.RoundtripKind);
                            r["modifiedTime"] = new DateTimeOffset(mt).ToUnixTimeMilliseconds();
                        }
                        catch { r["modifiedTime"] = 0; }
                        return Json.Serialize(r);
                    }
                }
                r["exists"] = false;
                return Json.Serialize(r);
            }
            catch (Exception ex)
            {
                return Fail(ex.Message);
            }
        }

        private static Dictionary<string, object> PickNewestNonEmpty(ArrayList arr)
        {
            if (arr == null) return null;
            Dictionary<string, object> best = null;
            long bestTime = 0;
            foreach (object o in arr)
            {
                Dictionary<string, object> f = o as Dictionary<string, object>;
                if (f == null) continue;
                long size;
                long.TryParse(Str(f, "size"), out size);
                if (size < 1000) continue;
                long t = 0;
                try
                {
                    DateTime mt = DateTime.Parse(Str(f, "modifiedTime"),
                        null, System.Globalization.DateTimeStyles.RoundtripKind);
                    t = new DateTimeOffset(mt).ToUnixTimeMilliseconds();
                }
                catch { }
                if (best == null || t > bestTime) { best = f; bestTime = t; }
            }
            return best;
        }

        private static async Task<string> FindBackup(string access)
        {
            string url = "https://www.googleapis.com/drive/v3/files" +
                "?spaces=appDataFolder" +
                "&q=" + Uri.EscapeDataString("name='" + BackupName + "' and trashed=false") +
                "&fields=files(id,size,modifiedTime)&pageSize=100&orderBy=modifiedTime%20desc";
            HttpRequestMessage req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
            HttpResponseMessage resp = await Http.SendAsync(req);
            if (!resp.IsSuccessStatusCode) return null;
            string s = await resp.Content.ReadAsStringAsync();
            Dictionary<string, object> d = Json.Deserialize<Dictionary<string, object>>(s);
            object files;
            if (d == null || !d.TryGetValue("files", out files)) return null;
            ArrayList arr = files as ArrayList;
            Dictionary<string, object> f = PickNewestNonEmpty(arr);
            return f == null ? null : Str(f, "id");
        }

        private static async Task<long> FileModified(string access, string fileId)
        {
            try
            {
                HttpRequestMessage req = new HttpRequestMessage(HttpMethod.Get,
                    "https://www.googleapis.com/drive/v3/files/" + fileId + "?fields=modifiedTime");
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
                HttpResponseMessage resp = await Http.SendAsync(req);
                if (!resp.IsSuccessStatusCode) return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                string s = await resp.Content.ReadAsStringAsync();
                Dictionary<string, object> d = Json.Deserialize<Dictionary<string, object>>(s);
                DateTime mt = DateTime.Parse(Str(d, "modifiedTime"),
                    null, System.Globalization.DateTimeStyles.RoundtripKind);
                return new DateTimeOffset(mt).ToUnixTimeMilliseconds();
            }
            catch { return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); }
        }

        private static async Task<string> FetchEmail(string access)
        {
            try
            {
                HttpRequestMessage req = new HttpRequestMessage(HttpMethod.Get,
                    "https://openidconnect.googleapis.com/v1/userinfo");
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
                HttpResponseMessage resp = await Http.SendAsync(req);
                if (!resp.IsSuccessStatusCode) return "";
                string s = await resp.Content.ReadAsStringAsync();
                Dictionary<string, object> d = Json.Deserialize<Dictionary<string, object>>(s);
                return Str(d, "email") ?? "";
            }
            catch { return ""; }
        }

        private static string Snip(string s)
        {
            if (s == null) return "";
            s = s.Replace("\r", " ").Replace("\n", " ");
            return s.Length > 220 ? s.Substring(0, 220) : s;
        }

        private static string DescribeTokenError(string ts)
        {
            string raw = ts ?? "";
            if (raw.IndexOf("invalid_client", StringComparison.OrdinalIgnoreCase) >= 0)
                return "O Google recusou a identificacao do aplicativo. Confira se o cliente OAuth e do tipo "
                    + "\"Aplicativo para computador\" (Desktop app).";
            if (raw.IndexOf("redirect_uri_mismatch", StringComparison.OrdinalIgnoreCase) >= 0)
                return "A URL de retorno nao esta autorizada no cliente OAuth. Use um cliente Desktop e "
                    + "mantenha http://localhost como retorno.";
            if (raw.IndexOf("invalid_grant", StringComparison.OrdinalIgnoreCase) >= 0)
                return "O codigo de autorizacao expirou ou ja foi usado. Tente conectar novamente.";
            if (raw.IndexOf("invalid_scope", StringComparison.OrdinalIgnoreCase) >= 0)
                return "A permissao drive.appdata nao esta habilitada na tela de consentimento do Google.";
            return "Token: " + Snip(raw);
        }
    }
}

