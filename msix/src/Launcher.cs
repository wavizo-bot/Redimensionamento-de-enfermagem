using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
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
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
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

        // Login Google em janela filha com WebView2 proprio:
        // abre a URL de autorizacao, intercepta o redirect de loopback
        // (http://localhost:PORTA/?code=...), devolve a URL de retorno e fecha
        // a janela sozinha. Sem navegador externo, sem HttpListener.
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
                    if (done) return; // sem reentrancia: Close() dentro de FormClosed nao refaz nada
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

        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
        private static readonly HttpClient Http = new HttpClient();

        // Abre a URL de autorizacao numa janela propria e devolve a URL de
        // retorno (ou null). Injetado pelo MainForm (padrao popup interno).
        private readonly Func<string, Task<string>> _popup;
        private readonly MainForm _owner;

        public DriveSync() : this(null, null) { }

        public DriveSync(Func<string, Task<string>> popupOpener, MainForm owner)
        {
            _popup = popupOpener;
            _owner = owner;
        }

        // Extrai ?code= / ?error= da URL de retorno do Google. Publico para teste.
        public static bool TryParseAuthRedirect(string url, out string code, out string error)
        {
            code = null;
            error = null;
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
                }
                return true;
            }
            catch { return false; }
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

        public async Task<string> Login()
        {
            try
            {
                Dictionary<string, string> client = LoadClient();
                if (client == null || string.IsNullOrEmpty(client["id"]))
                    return Fail("Arquivo de configuracao do Google ausente no pacote.");

                byte[] rnd = new byte[32];
                using (RandomNumberGenerator rng = RandomNumberGenerator.Create()) rng.GetBytes(rnd);
                string verifier = B64Url(rnd);
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
                    "&code_challenge=" + challenge +
                    "&code_challenge_method=S256" +
                    "&access_type=offline&prompt=consent";

                if (_popup == null)
                    return Fail("Login Google disponivel somente no app instalado.");

                string redirectUrl = await _popup(authUrl);
                string code = null, authErr = null;
                if (!string.IsNullOrEmpty(redirectUrl))
                    TryParseAuthRedirect(redirectUrl, out code, out authErr);

                if (!string.IsNullOrEmpty(authErr))
                    return Fail("Login recusado: " + authErr);

                if (string.IsNullOrEmpty(code))
                    return Fail("Login cancelado ou tempo esgotado.");

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
                    return Fail("Token: " + Snip(ts));
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
                if (access == null) return Fail("Desconectado do Google.");

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
                if (access == null) return Fail("Desconectado do Google.");
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
                if (access == null) return Fail("Desconectado do Google.");
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
    }
}

