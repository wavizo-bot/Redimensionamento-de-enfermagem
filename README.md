# Dimensionamento de Enfermagem

Aplicativo Windows (MSIX) para dimensionamento de pessoal de enfermagem pelo
método WISN/WPSN, conforme o Parecer Normativo COFEN nº 1/2024.

Importa a planilha oficial da unidade, calcula o quadro necessário de
enfermeiros e técnicos/auxiliares, compara com o quadro atual e exporta o
resultado em Excel. Os dados ficam no computador do usuário, com backup
opcional no Google Drive.

Site do projeto: https://wavizo-bot.github.io/Redimensionamento-de-enfermagem/

## Recursos

- Entrada amigável de produção, tempos médios, atividades indiretas e ausências.
- Cálculo de horas diretas, indiretas, TTD e WISN para as duas categorias.
- Equipe flexível: adicionar, remover e renomear profissionais.
- Importação da planilha oficial (`DIMENSIONAMENTO -ENF - 20252026` e
  `DIMENSIONAMENTO - 20252026 - T.`) com preenchimento automático dos campos.
- Normalização de OOXML fora do padrão (prefixo `x:` e células sem referência),
  comum em arquivos gerados por outros sistemas.
- Leitura do relatório "Detalhamento de procedimentos lançados" nos formatos
  resumido (total por mês) e expandido (por profissional e procedimento), com
  totais mensais, por categoria, últimos 12 meses e gráfico.
- Exportação em Excel com as abas:
  - `DIMENSIONAMENTO -ENF - 20252026`
  - `DIMENSIONAMENTO - 20252026 - T.`
  - `AVALIAÇÃO DIM. - <tag>`
  - `MEMÓRIA DE CÁLCULO`
- Backup e restauração pelo Google Drive (`drive.appdata`), com OAuth + PKCE e
  janela de login dentro do próprio aplicativo.
- Páginas públicas de apresentação, privacidade, termos e aviso legal em `docs/`.

## Estrutura

```
.
├── src/                     # Aplicativo React + TypeScript
│   ├── components/          # Componentes e modais
│   ├── lib/                 # Cálculo, importação, exportação, armazenamento, Drive
│   ├── views/               # Telas do fluxo
│   └── styles/              # CSS global, impressão e responsivo
├── docs/                    # GitHub Pages (apresentação + páginas legais)
│   └── app/                 # Build web do aplicativo
├── msix/                    # Empacotamento Windows
│   ├── src/Launcher.cs      # Host WinForms + WebView2 e ponte do Google Drive
│   ├── AppxManifest.xml     # Identidade e capacidades do pacote
│   ├── make-assets.ps1      # Ícones e arte da loja
│   └── Build-MSIX.ps1       # Build reproduzível do MSIX
├── store/                   # Arte para o Microsoft Partner Center
├── tools/verify.ts          # Verificação dos cálculos e do Excel exportado
├── manual.txt               # Documentação técnica e de operação
└── log.txt                  # Diário de desenvolvimento (não versionado)
```

## Desenvolvimento

Pré-requisitos: Node.js 18+.

```powershell
npm install
npm run dev      # http://localhost:5173
npm run build    # gera dist/
```

A verificação numérica e a geração de uma planilha de teste podem ser
executadas com:

```powershell
npx esbuild tools/verify.ts --bundle --platform=node --format=cjs --target=node18 --outfile=tools/verify.cjs
node tools/verify.cjs
```

## Build do MSIX

Pré-requisitos:

- Node.js 18+
- .NET Framework 4.8 (`csc.exe`)
- Windows SDK 10.0.26100 (MakeAppx)
- DLLs do WebView2 (copiadas do staging local no build)

```powershell
powershell -ExecutionPolicy Bypass -File msix/Build-MSIX.ps1 -Version 1.0.2.0
```

O pacote é gerado em `msix/output/` e a versão web em `docs/app/`.
O build copia o cliente OAuth apenas para o staging local; credenciais não
são versionadas. A assinatura de teste é opcional — a Microsoft Store
reassina o pacote na publicação.

## Identidade do pacote

- Nome: `wavizo.Dimensionamentodeenfermagem`
- Publisher: `CN=57BB464E-553F-45B6-A4ED-B253157408EB`
- PublisherDisplayName: `wavizo`
- Versão: `1.0.2.0`

## Privacidade e dados

O aplicativo não mantém servidor próprio. Os dados de dimensionamento ficam
no armazenamento local e, se o usuário optar, em uma pasta privada do Google
Drive (`drive.appdata`). Nenhum dado é enviado ao desenvolvedor. Consulte a
política de privacidade publicada no site do projeto.

## Contato

- E-mail: mmr05@hotmail.com
- Telefone: (11) 97883-1938
