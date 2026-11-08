# 🎴 Monopoly Deal — Jogo de Cartas Multijogador

Jogo digital de cartas multijogador inspirado no Monopoly Deal, com salas por código,
lógica **100% autoritativa no servidor** e jogo entre plataformas: Web / Android (APK) / PC.

> **Status:** ✅ Fase 1 (análise) · ✅ Backend completo e testado · ✅ Frontend completo e testado (E2E)
>
> **Crédito:** projeto **100% criado com inteligência artificial** (desenvolvido por IA, do zero ao deploy).

---

## 🛠 Stack Tecnológica

| Camada | Tecnologia | Justificativa |
|---|---|---|
| **Frontend** | React 18 + TypeScript + Vite | Multiplataforma (Web/PWA → APK via Capacitor), recarga quente, ecossistema grande |
| **Estado** | Zustand | Simples e rápido, ideal para estado de jogo em tempo real |
| **Tempo real** | Socket.io (cliente) | Reconexão automática, alternância WebSocket/HTTP, salas no servidor |
| **Arrastar e soltar** | @dnd-kit | Mouse (PC) + toque/deslize (celular) com a mesma API |
| **Android** | Capacitor 6 | Empacota o mesmo pacote web em APK assinado |
| **PC** | PWA instalável (+ Electron opcional) | Ícone/executável sem reescrever nada |
| **Backend** | Node.js + TypeScript + Socket.io | Um só código para Web/Android/PC, autoridade total no servidor |
| **Testes** | Suíte de testes + teste de integração (socket.io-client) | Valida regras, protocolo, privacidade das mãos e invariantes |

---

## 📁 Estrutura do Projeto

```
monopoly-deal/
├── package.json                  # workspaces npm (shared + server + client)
├── render.yaml                   # config de deploy na nuvem (Render)
├── shared/                       # código compartilhado cliente<->servidor
│   └── src/
│       ├── cards.ts              # 🎴 baralho completo (107 cartas, PT-BR)
│       ├── types.ts              # estado do jogo, ações, configurações
│       ├── protocol.ts           # eventos do Socket.io (contrato)
│       └── index.ts
├── server/                       # ⚙️ backend autoritativo
│   └── src/
│       ├── index.ts              # bootstrap HTTP + Socket.io + handlers + SPA estática
│       ├── roomManager.ts        # salas (código de 6 dígitos), lobby, bots, timers
│       ├── engine.ts             # motor do jogo (regras validadas)
│       └── bot.ts                # CPU com heurística
├── scripts/
│   ├── rent.test.ts              # testes de aluguel
│   ├── rules.test.ts             # testes de limite de mão e pagamento
│   ├── steal.test.ts             # testes de roubos e cadeia de "Não!"
│   ├── wild.test.ts              # curinga na mesa + valores únicos por cor
│   └── smoke.mjs                 # teste de integração ponta a ponta
└── client/                       # 🖥️ frontend React (Vite)
    ├── index.html
    ├── vite.config.ts            # proxy /socket.io → :3001 em dev + acesso pela rede local
    ├── public/                   # manifest PWA + ícone
    └── src/
        ├── main.tsx / App.tsx    # bootstrap + roteador de telas
        ├── store.ts              # Zustand: estado + eventos do socket + fluxos de modal
        ├── net/socket.ts         # conexão Socket.io única
        ├── styles.css            # design system responsivo (retrato/paisagem)
        ├── screens/              # Home (criar/entrar) · Lobby · Game (mesa)
        └── components/           # Card · Hand (arrastar) · MyArea (soltar) · Opponents · Modals
```

---

## ▶️ Como Rodar o Projeto (desenvolvimento)

```bash
npm install                 # uma vez (instala shared + server + client)

# terminal 1 — servidor autoritativo
npm run dev:server          # http://localhost:3001

# terminal 2 — frontend (Vite com proxy do socket)
npm run dev -w client       # http://localhost:5173
```

Atalhos da raiz: `npm run typecheck` (tsc de tudo) · `npm run build` (pacote web em `client/dist`).

Testes automatizados (os unitários rodam sem servidor; o de integração exige o servidor rodando):

```bash
npx tsx scripts/rent.test.ts     # regra de aluguel (31 verificações)
npx tsx scripts/rules.test.ts    # limite de mão + pagamento automático (17 verificações)
npx tsx scripts/steal.test.ts    # roubos + cadeia de "Não!" (21 verificações)
npx tsx scripts/wild.test.ts     # curinga na mesa + valores únicos por cor (24 verificações)
node scripts/smoke.mjs           # cria sala, inicia com bots, valida invariantes (107 cartas)
```

Variáveis de ambiente do servidor: `PORT` (padrão 3001), `CORS_ORIGIN` (padrão `*`),
`CLIENT_DIST` (caminho do build do client, padrão `client/dist`).

### Conexão fora do localhost (celular na mesma rede)

O Vite já escuta em **todas as interfaces** — na mesma rede Wi-Fi, basta o celular
abrir `http://IP-DO-PC:5173` (ex.: `http://192.168.2.113:5173`). O proxy repassa o
Socket.io ao servidor automaticamente.

### Jogar de qualquer lugar (sem estar na mesma rede)

**Opção 1 — nuvem (recomendada):** o `render.yaml` está pronto; o servidor
único (backend + SPA) sobe no Render e ganha uma URL permanente. Veja
[Deploy na Nuvem](#-deploy-na-nuvem-render).

**Opção 2 — túnel temporário:** algo como Cloudflare Tunnel expõe o
`:5173` numa URL pública enquanto o PC está ligado.

Sem variável extra, o client usa o proxy do Vite (dev) ou a mesma origem (produção).

---

## 🎯 Regras Implementadas

- **Baralho de 107 cartas** (valores oficiais): 20 dinheiro, 28 propriedades,
  11 curingas (9 de 2 cores + 2 multicoloridos), 13 cartas de aluguel
  (5 pares duplos ×2 + 3 curingas de aluguel), 29 ações (**3 "Não!"**,
  **2 "Quebra de Acordo"**, 10 Pass Go, 4 Cobrador, 4 Esperta, 4 Forçada,
  3 Aluguel em Dobro), 3 casas, 3 hotéis
- **Valor de banco ÚNICO por cor** (como no jogo real): marrom 1M · azul-claro 1M ·
  rosa 2M · laranja 2M · vermelho 3M · amarelo 3M · verde 4M · azul-escuro 4M ·
  ferrovia 2M · utilidade 2M (os curingas mantêm o valor impresso próprio)
- **Tabela de aluguel oficial**: marrom [1,2] · azul-claro [1,2,3] · rosa [1,2,4] ·
  laranja [1,3,5] · vermelho [2,3,6] · amarelo [2,4,6] · verde [2,4,7] ·
  azul-escuro [3,8] · ferrovias [1,2,3,4] · utilidades [1,2]
- **Distribuição**: 5 cartas iniciais + 2 por turno — **sempre respeitando o limite de 7**
  (mão com 7 → não compra nada; mão com 6 → compra só 1; Pass Go também respeita o limite)
- **3 jogadas por turno** (configurável 2–5): jogar propriedade, dinheiro, casa/hotel,
  cobrar aluguel, carta de ação ou Pass Go
- **Fim automático do turno**: ao gastar as 3 jogadas a vez passa sozinha — mas o
  botão **🏁 Encerrar sessão** continua disponível para acabar o turno quando quiser
  (se houver aluguel/cobrança pendente, o turno espera a resposta resolver)
- **Aluguel**: cobrado de **todos os oponentes** com base nas **suas propriedades**
  da cor (regra oficial — o oponente não precisa ter a cor), com bônus de Casa (+3) e
  Hotel (+4), "Aluguel em Dobro" (×2, custa 1 jogada extra); quem não tem nada para
  pagar não paga e não é eliminado (regra oficial)
- **Cartas de aluguel reais**: apenas pares de 2 cores (ex.: Vermelho + Amarelo) e
  curingas de aluguel — sem carta de cor única (como no baralho oficial)
- **Curingas**: continuam sendo **curinga na mesa** (selo da cor atual no canto da
  carta) e podem **trocar de cor depois** — toque no curinga e escolha a nova cor
  (custa 1 jogada); os de 2 cores podem **abrir um grupo novo** (você escolhe o lado),
  o multicolorido só vai para um grupo que você já tem
- **Ações**: Pass Go, Cobrador de Dívidas (5M), Negociação Esperta, Quebra de Acordo,
  Negociação Forçada, **Não!** (cadeia de respostas alternadas — com botões explícitos
  de "Revidar"/"Desistir" no estado invertido), Casa/Hotel
- **Banco**: **qualquer carta** (aluguel, ação, casa, hotel, propriedade…) pode ir para o
  banco e virar dinheiro — **exceto o curinga** (sempre propriedade); o menu pergunta o
  destino da carta (banco ou uso na mesa) antes de jogar — e o **dinheiro vai para o
  banco com UM clique** (ele não tem outra utilidade)
- **Pagamento com ESCOLHA**: ao aceitar uma cobrança (aluguel/Cobrador de Dívidas), o
  jogador **escolhe com o que paga** — dinheiro do banco e/ou propriedades de conjuntos
  **incompletos**; a seleção tem que cobrir a dívida ou entregar **tudo** que tem na
  mesa (paga só o que tiver) — **nunca fica devendo e não há falência/eliminação**;
  no tempo esgotado o pagamento sai automático (dinheiro primeiro);
  a tela pode ser **minimizada** (vira um chip 💸 flutuante) e volta quando você tocar,
  **sem perder a seleção**
- **Mobile**: a mão **rola com o dedo** no celular (scroll horizontal) e o arrasto
  para a mesa continua funcionando
- **Mesa visível**: cada jogador (inclusive você) mostra as cartas jogadas como
  **cartas em miniatura** por cor (com contador n/total, ★ quando completo e aluguel
  atual) e o **banco com o dinheiro** — estilo "mesa" do Monopoly Deal online
- **Limite de mão**: 7 cartas (as compras nunca ultrapassam; descarte de segurança no
  fim do turno caso exceda)
- **Vitória**: N conjuntos completos (padrão 3, configurável 1–5) ou último jogador de pé
- **Tempo por turno** (0/15/30/60/120s) com ações automáticas ao expirar
- **Bots** jogam sozinhos com heurística (preenchem a sala)
- **Chat da sala** em tempo real (até 200 caracteres, histórico das últimas 50 mensagens)
- **Áudio**: efeitos sonoros, música de fundo suave e **narrador** — tudo gerado em
  tempo real, com controles 🔊🎵🎙️ e **seletor de voz 🗣️** no canto superior direito
  (a voz oficial do "Homem do Monopoly" não existe em TTS de navegador; escolhemos
  automaticamente a voz pt-BR **mais natural** disponível — "Natural" da Microsoft >
  Google — com ritmo/tons menos robóticos, e o 🗣️ troca entre as vozes do sistema)
- **Visual fiel às cartas físicas**: cabeçalho "CARTA DE AÇÃO", círculo central branco
  com borda preta, moldura interna dupla, tons pastéis por carta e selo de valor em
  elipse rotacionada nos cantos

### Simplificações documentadas
- Curinga escolhe a cor **ao jogar** e pode **trocar depois** (1 jogada) — ver botões na mesa
- Sem troca negociada entre jogadores (só Negociação Forçada) — pode ser adicionada
- Sem reconexão: saiu/desconectou = eliminado da partida

---

## 📡 Protocolo (Socket.io)

**Cliente → Servidor** (todos com resposta `{ok}` ou `{ok:false, error}`):

| Evento | Carga | Quem |
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

1. O servidor é a **única fonte de verdade** — o cliente só envia *intenções*
2. Toda validação (turno, jogadas, cartas, pagamentos) acontece no `engine.ts`
3. Cada jogador recebe uma **visão diferente** do mesmo estado
4. Baralho embaralhado e sorteado só no servidor (Fisher–Yates)
5. O teste de integração verifica que mãos alheias chegam ocultas

---

## ✅ Testes executados

| Teste | Resultado |
|---|---|
| `tsc` (shared + server + client) | saída 0 (sem erros) |
| `npm run build` (Vite) | ✅ ~283 kB JS / ~28 kB CSS (gzip ~91 kB / ~7 kB) |
| `npx tsx scripts/rent.test.ts` | ✅ 31 verificações (aluguel pelas MINHAS propriedades, fila, ESCOLHA de pagamento, pagamento parcial) |
| `npx tsx scripts/rules.test.ts` | ✅ 17 verificações (limite de mão 7, Pass Go, pagamento parcial sem falência) |
| `npx tsx scripts/steal.test.ts` | ✅ 21 verificações (roubo muda de dono; cadeia "Não!" revidar/desistir) |
| `npx tsx scripts/wild.test.ts` | ✅ 24 verificações (curinga troca de cor, grupos, prédios, 3 "Não!", 2 "Quebra", valores por cor) |
| `node scripts/smoke.mjs` | ✅ sala, 2 humanos + 4 bots, mãos ocultas, 107 cartas |
| E2E navegador (Chrome/CDP): Home → Criar sala → Bot → Iniciar → Mesa (cartas visíveis) → Menu de carta → Voz 🗣️ → Chat | ✅ 18/18 etapas, 0 erros de console |

---

## ☁️ Deploy na Nuvem (Render)

O servidor **também serve o jogo pronto** (SPA) — sobe **um único serviço** com tudo dentro.

1. **GitHub**: crie o repositório e envie o código:
   ```powershell
   git remote add origin https://github.com/SEU_USUARIO/monopoly-deal.git
   git push -u origin master
   ```
2. **Render**: https://render.com → **New + → Web Service** → conecte o repositório.
   O `render.yaml` já traz a configuração:
   - **Compilação:** `npm install && npm run build`
   - **Início:** `npx tsx server/src/index.ts`
3. **Jogar**: use a URL que o Render gerar (ex.: `https://monopoly-deal-xxxx.onrender.com`)
   em qualquer celular/PC, de qualquer lugar — basta criar sala e repassar o código.

> **Plano grátis**: o serviço dorme após ~15 min sem acesso; na primeira jogada
> depois do silêncio, espere ~30s para ele acordar. Salas vivem na memória — se o
> serviço reiniciar, as salas antigas são perdidas.

---

## 📦 Compilação: Web, Android (.apk) e PC (.exe)

### A) Web / PWA (mais simples)

```bash
npm run build -w client          # gera client/dist
```

- **Desenvolvimento local:** `npx serve client/dist` (ou qualquer servidor estático)
- **Produção:** o próprio servidor Node serve o `client/dist` — ou suba o `dist` em
  Vercel/Netlify/VPS e defina `VITE_SERVER_URL` na hora do build apontando para o backend
- **PWA instalável:** o `manifest.webmanifest` já está pronto — no Chrome/Edge,
  menu ⋮ → *Instalar aplicativo* → vira um app com ícone na barra de tarefas

### B) Android (.apk) via Capacitor

> Requisitos: **Node 18+**, **Android Studio** (com Android SDK 34) e **JDK 17**.

```powershell
# 1) dependências do Capacitor (no client)
cd C:\Users\Alexandre\monopoly-deal
npm.cmd install -w client @capacitor/core @capacitor/cli @capacitor/android

# 2) build web APONTANDO para o servidor (obrigatório no celular!)
$env:VITE_SERVER_URL="http://SEU_IP:3001"    # ex.: http://192.168.2.113:3001
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
   (`PORT=3001`, firewall liberando a porta, IP da máquina na rede local).

**Gerar o APK:**

```powershell
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

```powershell
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
  // Em desenvolvimento: aponte para o Vite. Em produção: arquivo local.
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

```powershell
# 4) desenvolvimento (janela Electron + recarga quente do Vite)
$env:VITE_DEV_SERVER_URL="http://localhost:5173"
npm.cmd run dev -w client        # terminal 1
npm.cmd run desktop              # terminal 2

# 5) gerar o .exe instalável (NSIS) — gera dist_electron/Deal Livre Setup.exe
npm.cmd run build -w client      # primeiro o pacote web (com VITE_SERVER_URL definido!)
npm.cmd run dist:win
```

Alternativa **sem Electron**: use o PWA (item A) — no Chrome/Edge dá para
*Instalar aplicativo* e até *criar atalho .exe* manualmente (arraste o ícone da
página para a área de trabalho).

### D) multiplataforma de verdade (jogo entre plataformas)

Basta **um** servidor Node rodando em algum lugar (seu PC na rede local, nuvem ou
VPS). Cada cliente (web, APK, PWA, Electron) conecta no mesmo endereço — jogadores
no celular e no PC entram na mesma sala pelo código de 6 dígitos. A lógica é toda do
servidor, então **ninguém consegue trapacear alterando o cliente**.
