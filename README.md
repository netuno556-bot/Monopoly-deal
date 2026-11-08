# 🎴 Monopoly Deal Clone — Multiplayer Cross-Play

Jogo digital de cartas multiplayer inspirado no Monopoly Deal, com salas por código,
lógica **100% autoritativa no servidor** e cross-play Web / Android (APK) / PC.

> **Status:** ✅ Fase 1 (análise) · ✅ Backend completo e testado · ✅ Frontend completo e testado (E2E)

---

## 🛠 Stack Tecnológica

| Camada | Tecnologia | Justificativa |
|---|---|---|
| **Frontend** | React 18 + TypeScript + Vite | Multiplataforma (Web/PWA → APK via Capacitor), hot reload, eco grande |
| **Estado** | Zustand | Simples e rápido, ideal para estado de jogo em tempo real |
| **Tempo real** | Socket.io (client) | Reconexão automária, fallback WebSocket/HTTP, salas no servidor |
| **Drag & Drop** | @dnd-kit | Mouse (PC) + toque/deslize (celular) com a mesma API |
| **Android** | Capacitor 6 | Empacota o mesmo bundle web em APK assinado |
| **PC** | PWA instalável (+ Electron opcional) | Executável/ícone sem reescrever nada |
| **Backend** | Node.js + TypeScript + Socket.io | Um só código para Web/Android/PC, autoridade total no servidor |
| **Testes** | Script de fumaça (socket.io-client) | Valida protocolo, privacidade das mãos e invariantes |

---

## 📁 Estrutura do Projeto

```
monopoly-deal/
├── package.json                  # workspaces npm (shared + server + client)
├── shared/                       # código compartilhado cliente<->servidor
│   └── src/
│       ├── cards.ts              # 🎴 baralho completo (106 cartas, PT-BR)
│       ├── types.ts              # estado do jogo, ações, configurações
│       ├── protocol.ts           # eventos do Socket.io (contrato)
│       └── index.ts
├── server/                       # ⚙️ backend autoritativo
│   └── src/
│       ├── index.ts              # bootstrap HTTP + Socket.io + handlers
│       ├── roomManager.ts        # salas (código 6 dígitos), lobby, bots, timers
│       ├── engine.ts             # motor do jogo (regras validadas)
│       └── bot.ts                # CPU com heurística
├── scripts/
│   └── smoke.mjs                 # teste de integração ponta a ponta
└── client/                       # 🖥️ frontend React (Vite)
    ├── index.html
    ├── vite.config.ts            # proxy /socket.io → :3001 em dev
    ├── public/                   # manifest PWA + ícone
    └── src/
        ├── main.tsx / App.tsx    # bootstrap + roteador de telas
        ├── store.ts              # Zustand: estado + eventos do socket + fluxos de modal
        ├── net/socket.ts         # conexão Socket.io única
        ├── styles.css            # design system responsivo (retrato/paisagem)
        ├── screens/              # Home (criar/entrar) · Lobby · Game (mesa)
        └── components/           # Card · Hand (drag) · MyArea (drop) · Opponents · Modals
```

---

## ▶️ Como Rodar o Projeto (dev)

```bash
npm install                 # uma vez (instala shared + server + client)

# terminal 1 — servidor autoritativo
npm run dev:server          # http://localhost:3001

# terminal 2 — frontend (Vite com proxy do socket)
npm run dev -w client       # http://localhost:5173
```

Atalhos da raiz: `npm run typecheck` (tsc de tudo) · `npm run build` (bundle web em `client/dist`).

Testes automatizados (unitários rodam sem servidor; o smoke exige o servidor rodando):

```bash
npx tsx scripts/rent.test.ts     # regra de aluguel (31 verificações)
npx tsx scripts/rules.test.ts    # limite de mão + pagamento automático (18 verificações)
npx tsx scripts/steal.test.ts    # roubos + cadeia de "Não!" (18 verificações)
node scripts/smoke.mjs           # cria sala, inicia com bots, valida invariantes
```

Variáveis de ambiente do servidor: `PORT` (padrão 3001), `CORS_ORIGIN` (padrão `*`).

### Conexão fora do localhost (celular / outra máquina)

O client lê `VITE_SERVER_URL` no **momento do build**:

```bash
# build apontando para o servidor publicado (ex.: seu PC na LAN)
$env:VITE_SERVER_URL="http://192.168.0.10:3001"   # PowerShell
npm run build -w client
```

Sem essa variável, o client usa o proxy do Vite (dev) ou mesma origem (produção).

---

## 🎯 Regras Implementadas

- **Baralho de 106 cartas**: 20 dinheiro, 28 propriedades, 8 curingas, 14 aluguéis, 36 ações
- **Distribuição**: 5 cartas iniciais + 2 por turno — **sempre respeitando o limite de 7**
  (mão com 7 → não compra nada; mão com 6 → compra só 1; Pass Go também respeita o limite)
- **3 jogadas por turno** (configurável 2–5): jogar propriedade, dinheiro, casa/hotel,
  cobrar aluguel, carta de ação ou Pass Go
- **Aluguel**: cobrado de **todos os oponentes** com base nas **suas propriedades**
  da cor (regra oficial — o oponente não precisa ter a cor), com bônus de Casa (+3) e
  Hotel (+4), "Aluguel em Dobro" (×2, custa 1 jogada extra); quem não tem nada para
  pagar não paga e não é eliminado (regra oficial)
- **Ações**: Pass Go, Cobrador de Dívidas (5M), Negociação Esperta, Quebra de Acordo,
  Negociação Forçada, **Não!** (cadeia de respostas alternadas — com botões explícitos
  de "Revidar"/"Desistir" no estado invertido), Casa/Hotel
- **Banco**: **qualquer carta** (aluguel, ação, casa, hotel, propriedade…) pode ir para o
  banco e virar dinheiro — **exceto o curinga** (sempre propriedade); o menu pergunta o
  destino da carta (banco ou uso na mesa) antes de jogar
- **Pagamento com ESCOLHA**: ao aceitar uma cobrança (aluguel/Cobrador de Dívidas), o
  jogador **escolhe com o que paga** — dinheiro do banco e/ou propriedades de conjuntos
  **incompletos**; a seleção tem que cobrir a dívida ou entregar **tudo** que tem na
  mesa (paga só o que tiver) — **nunca fica devendo e não há falência/eliminação**;
  no tempo esgotado o pagamento sai automático (dinheiro primeiro)
- **Mesa visível**: cada jogador (inclusive você) mostra as cartas jogadas como
  **cartas em miniatura** por cor (com contador n/total, ★ quando completo e aluguel
  atual) e o **banco com o dinheiro** — estilo "mesa" do Monopoly Deal online
- **Limite de mão**: 7 cartas (as compras nunca ultrapassam; descarte de segurança no
  fim do turno caso exceda)
- **Vitória**: N conjuntos completos (padrão 3, configurável 1–5) ou último jogador de pé
- **Timer por turno** (0/15/30/60/120s) com ações automáticas ao expirar
- **Bots** jogam sozinhos com heurística (preenchem a sala)
- **Chat da sala** em tempo real (até 200 caracteres, histórico das últimas 50 mensagens)
- **Áudio**: efeitos sonoros, música de fundo suave e **narrador** — tudo gerado em
  tempo real, com toggles 🔊🎵🎙️ e **seletor de voz 🗣️** no canto superior direito
  (a voz oficial do "Homem do Monopoly" não existe em TTS de navegador; escolhemos
  automaticamente a voz pt-BR **mais natural** disponível — "Natural" da Microsoft >
  Google — com taxa/pitch menos robóticos, e o 🗣️ troca entre as vozes do sistema)

### Simplificações documentadas
- Curinga escolhe a cor **no momento de jogar** (não há fila de atribuição)
- Valores de banco das propriedades = 1º valor da tabela de aluguel (ajustável em `cards.ts`)
- Sem troca negociada entre jogadores (só Negociação Forçada) — pode ser adicionada
- Sem reconexão: saiu/disconectou = eliminado da partida

---

## 📡 Protocolo (Socket.io)

**Cliente → Servidor** (todos com ack `{ok}` ou `{ok:false, error}`):

| Evento | Payload | Quem |
|---|---|---|
| `room:create` | `{name, visibility}` | qualquer um (vira anfitrião) |
| `room:join` | `{code, name}` | qualquer um |
| `room:list` | — | lista salas públicas |
| `room:start` / `room:settings` / `room:addBot` / `room:removePlayer` / `room:rematch` | — / `{settings}` / — / `{playerId}` / — | anfitrião |
| `game:action` | `{action}` | jogador atual/defensor |
| `room:leave` | — | qualquer um |

**Ações de jogo** (`game:action.action`): `PLAY_PROPERTY`, `PLAY_BANK`, `BUILD`, `RENT`,
`ACTION` (passGo/debt/…), `SAY_NO`, `ACCEPT`, `PAY`, `DISCARD`, `END_TURN`.

**Servidor → Cliente**: `state` (visão **por jogador**: mãos alheias e baralho ocultos),
`joined`, `error`, `notice`.

---

## 🔒 Anti-trapaças

1. O servidor é a **única fonte de verdade** — cliente só envia *intenções*
2. Toda validação (turno, jogadas, cartas, pagamentos) acontece no `engine.ts`
3. Cada jogador recebe uma **visão diferente** do mesmo estado
4. Baralho embaralhado e sorteado só no servidor (`crypto`-independente, Fisher–Yates)
5. Teste de fumaça verifica que mãos alheias chegam ocultas

---

## ✅ Testes executados

| Teste | Resultado |
|---|---|
| `tsc` (shared + server + client) | exit 0 |
| `npm run build` (Vite) | ✅ 274 kB JS / 18 kB CSS (gzip 88 kB) |
| `npx tsx scripts/rent.test.ts` | ✅ 31 verificações (aluguel pelas MINHAS propriedades, fila, ESCOLHA de pagamento, pagamento parcial) |
| `npx tsx scripts/rules.test.ts` | ✅ 18 verificações (limite de mão 7, Pass Go, pagamento parcial sem falência) |
| `npx tsx scripts/steal.test.ts` | ✅ 18 verificações (roubo muda de dono; flip "Não!" revidar/desistir) |
| `node scripts/smoke.mjs` | ✅ sala, 2 humanos + 4 bots, mãos ocultas, 106 cartas |
| E2E browser (Chrome/CDP): Home → Criar sala → Bot → Iniciar → Mesa (cartas visíveis) → Menu de carta → Voz 🗣️ → Chat | ✅ 18/18 passos, 0 erros de console |

---

## 📦 Compilação: Web, Android (.apk) e PC (.exe)

### A) Web / PWA (mais simples)

```bash
npm run build -w client          # gera client/dist
```

- **Dev local:** `npx.cmd serve client/dist` (ou qualquer servidor estático)
- **Deploy:** suba `client/dist` em Vercel/Netlify/VPS e aponte `VITE_SERVER_URL`
  para o backend na hora do build (ou sirva backend + frontend na mesma origem)
- **PWA instalável:** o `manifest.webmanifest` já está pronto — no Chrome/Edge,
  menu ⋮ → *Instalar aplicativo* → vira um app com ícone na barra de tarefas

### B) Android (.apk) via Capacitor

> Requisitos: **Node 18+**, **Android Studio** (com Android SDK 34) e **JDK 17**.

```bash
# 1) dependências do Capacitor (no client)
cd C:\Users\Alexandre\monopoly-deal
npm.cmd install -w client @capacitor/core @capacitor/cli @capacitor/android

# 2) build web APONTANDO para o servidor (obrigatório no celular!)
$env:VITE_SERVER_URL="http://SEU_IP:3001"    # ex.: http://192.168.0.10:3001
npm.cmd run build -w client

# 3) inicializar e criar o projeto Android
cd client
npx.cmd cap init "Deal Livre" com.deallivre.game --web-dir=dist
npx.cmd cap add android
npx.cmd cap sync
```

**Ajustes manuais importantes:**

1. `client/android/app/src/main/AndroidManifest.xml` — libere tráfego HTTP na LAN:
   `<application ... android:usesCleartextTraffic="true">`
2. Servidor rodando com CORS liberado (padrão `*`) e acessível na rede
   (`PORT=3001`, firewall liberando a porta, IP da máquina na LAN).

**Gerar o APK:**

```bash
npx.cmd cap open android       # abre o Android Studio
# Android Studio → Build → Build Bundle(s)/APK(s) → Build APK(s)
# APK de teste:  android/app/build/outputs/apk/debug/app-debug.apk
```

**APK assinado (para publicar):**

```powershell
# 1) keystore único (guarde bem!)
keytool -genkey -v -keystore deallivre.keystore -alias deallivre -keyalg RSA -keysize 2048 -validity 10000
# 2) em client/android/key.properties:
#    storeFile=../../deallivre.keystore
#    storePassword=SENHA
#    keyAlias=deallivre
#    keyPassword=SENHA
# 3) no Android Studio: Build → Generate Signed Bundle / APK → APK → Release
```

**Atualizar o app depois:** alterou o frontend → repita os passos 2 (`build`) e
`npx.cmd cap sync` → novo APK.

### C) PC — executável Windows (.exe) via Electron

> Requisitos: Node 18+ (sem nada mais — o Electron é baixado automaticamente).

```bash
# 1) na raiz do projeto
npm.cmd install -D electron electron-builder

# 2) electron/main.js
```

```js
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900,
    backgroundColor: '#0f3d2e',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  });
  // Em dev: aponte para o Vite. Em produção: arquivo local.
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '../client/dist/index.html'));
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
```

```jsonc
// 3) adicione no package.json da RAIZ
// "main": "electron/main.js",
// "scripts": {
//   "desktop": "electron .",
//   "dist:win": "electron-builder --win"
// },
// "build": {
//   "appId": "com.deallivre.game",
//   "files": ["electron/**", "client/dist/**"],
//   "win": { "target": "nsis", "icon": "client/public/icon.svg" }
// }
```

```bash
# 4) desenvolvimento (janela Electron + hot reload do Vite)
$env:VITE_DEV_SERVER_URL="http://localhost:5173"
npm.cmd run dev -w client        # terminal 1
npm.cmd run desktop              # terminal 2

# 5) gerar o .exe instalável (NSIS) — gera dist_electron/Deal Livre Setup.exe
npm.cmd run build -w client      # primeiro o bundle web (com VITE_SERVER_URL definido!)
npm.cmd run dist:win
```

Alternativa **sem Electron**: use o PWA (item A) — no Chrome/Edge dá para
*Instalar aplicativo* e até *criar atalho .exe* manualmente (arraste o ícone da
página para a área de trabalho).

### D) multiplataforma de verdade (cross-play)

Basta **um** servidor Node rodando em algum lugar (seu PC na LAN, VPS ou
hosting barato). Cada cliente (web, APK, PWA, Electron) conecta no mesmo
`VITE_SERVER_URL` — jogadores no celular e no PC entram na mesma sala pelo
código de 6 dígitos. A lógica é toda do servidor, então **ninguém consegue
trapacear alterando o cliente**.
