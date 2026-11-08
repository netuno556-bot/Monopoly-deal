// ============================================================
//  ÁUDIO DO JOGO — efeitos sonoros, música de fundo e narrador
//  Tudo gerado em tempo real (Web Audio + SpeechSynthesis),
//  sem nenhum arquivo externo. Preferências ficam no localStorage.
// ============================================================

export type SfxName =
  | 'click'    // clique em botão/menu
  | 'card'     // carta jogada na mesa
  | 'draw'     // compra do baralho
  | 'coin'     // pagamento recebido
  | 'chime'    // início do seu turno
  | 'error'    // ação recusada / cobrança recebida
  | 'pop'      // mensagem de chat
  | 'win';     // fim de jogo

const LS = { sfx: 'md.sfx', music: 'md.music', narr: 'md.narrator', voice: 'md.voice' };

const readFlag = (k: string): boolean => localStorage.getItem(k) !== '0';
const writeFlag = (k: string, v: boolean): void => localStorage.setItem(k, v ? '1' : '0');

let sfxOn = readFlag(LS.sfx);
let musicOn = readFlag(LS.music);
let narrOn = readFlag(LS.narr);

// ------------------------------------------------------------
//  Contexto de áudio (criado sob demanda — política de autoplay)
// ------------------------------------------------------------
let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;

function ac(): AudioContext | null {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try { ctx = new AC(); } catch { return null; }
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

// ------------------------------------------------------------
//  Efeitos sonoros (osciladores + ruído, envelopes curtos)
// ------------------------------------------------------------
function tone(
  c: AudioContext, freq: number, t0: number, dur: number,
  gain: number, type: OscillatorType = 'sine', toFreq?: number,
): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (toFreq) o.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(sfxBus!);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(c: AudioContext, t0: number, dur: number, gain: number, freq: number): void {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 1.1;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(sfxBus!);
  src.start(t0);
}

export function sfx(name: SfxName): void {
  if (!sfxOn) return;
  const c = ac();
  if (!c || !sfxBus) return;
  const t = c.currentTime;
  switch (name) {
    case 'click': tone(c, 760, t, 0.06, 0.05, 'sine', 980); break;
    case 'card': noise(c, t, 0.14, 0.16, 1900); tone(c, 320, t, 0.07, 0.03, 'triangle'); break;
    case 'draw': noise(c, t, 0.1, 0.1, 2600); noise(c, t + 0.07, 0.1, 0.1, 2200); break;
    case 'coin':
      tone(c, 988, t, 0.09, 0.09, 'triangle');
      tone(c, 1319, t + 0.09, 0.16, 0.09, 'triangle');
      break;
    case 'chime':
      tone(c, 523, t, 0.5, 0.07, 'sine');
      tone(c, 659, t + 0.1, 0.5, 0.07, 'sine');
      tone(c, 784, t + 0.2, 0.6, 0.07, 'sine');
      break;
    case 'error': tone(c, 240, t, 0.2, 0.08, 'sawtooth', 140); break;
    case 'pop': tone(c, 520, t, 0.07, 0.06, 'sine', 880); break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.13, 0.4, 0.08, 'triangle'));
      break;
  }
}

// ------------------------------------------------------------
//  Música de fundo suave (acorde ambiente em loop)
//  Progressão lenta Am7 → Fmaj7 → Cmaj7 → G6 com pad filtrado
//  e uma melodia pontual bem discreta.
// ------------------------------------------------------------
const CHORDS: number[][] = [
  [220.0, 261.63, 329.63, 392.0],   // Am7
  [174.61, 220.0, 261.63, 329.63],  // Fmaj7
  [261.63, 329.63, 392.0, 493.88],  // Cmaj7
  [196.0, 246.94, 293.66, 392.0],   // G
];
const CHORD_SEC = 4.5;

let musicTimer: ReturnType<typeof setInterval> | null = null;
let nextChordAt = 0;
let chordIdx = 0;

function scheduleChord(c: AudioContext, at: number): void {
  const chord = CHORDS[chordIdx % CHORDS.length];
  chordIdx++;

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 950;
  filter.Q.value = 0.4;
  filter.connect(musicBus!);

  for (const freq of chord) {
    for (const detune of [0, 4]) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      o.detune.value = detune;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.03, at + 1.6);
      g.gain.linearRampToValueAtTime(0.022, at + CHORD_SEC - 1.2);
      g.gain.linearRampToValueAtTime(0.0001, at + CHORD_SEC + 0.6);
      o.connect(g).connect(filter);
      o.start(at);
      o.stop(at + CHORD_SEC + 0.7);
    }
  }

  // melodia discreta: 2 notas agudas por acorde
  const melodic = [chord[2] * 2, chord[3] * 2, chord[1] * 2];
  melodic.forEach((freq, i) => {
    const t0 = at + 1.2 + i * 1.4;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.02, t0 + 0.25);
    g.gain.linearRampToValueAtTime(0.0001, t0 + 1.1);
    o.connect(g).connect(musicBus!);
    o.start(t0);
    o.stop(t0 + 1.2);
  });
}

function musicStart(): void {
  const c = ac();
  if (!c || !musicBus || musicTimer) return;
  musicBus.gain.cancelScheduledValues(c.currentTime);
  musicBus.gain.setValueAtTime(0, c.currentTime);
  musicBus.gain.linearRampToValueAtTime(1, c.currentTime + 2);
  nextChordAt = c.currentTime + 0.15;
  chordIdx = 0;
  scheduleChord(c, nextChordAt);
  nextChordAt += CHORD_SEC;
  musicTimer = setInterval(() => {
    if (!ctx) return;
    while (nextChordAt < ctx.currentTime + 2) {
      scheduleChord(ctx, nextChordAt);
      nextChordAt += CHORD_SEC;
    }
  }, 1000);
}

function musicStop(): void {
  if (!ctx || !musicBus) return;
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
  musicBus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.7);
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

// ------------------------------------------------------------
//  Narrador (SpeechSynthesis pt-BR)
//  O navegador não tem a voz oficial do "Homem do Monopoly", então
//  escolhemos a voz pt-BR MAIS NATURAL disponível (vozes "Natural"
//  da Microsoft > Google > demais) e deixamos taxa/pitch menos robóticos.
// ------------------------------------------------------------

/** Preferências de vozes (do mais natural para o mais comum) */
const VOICE_PREFS = [
  'natural', 'google', 'francisca', 'luciana', 'thalita', 'valeria',
  'maria', 'ana', 'yuri', 'daniel', 'felipe', 'helena',
];

/** Índice escolhido pelo usuário (-1 = automática/melhor pontuada) */
let voiceIdx = Number(localStorage.getItem(LS.voice) ?? '-1');
if (!Number.isFinite(voiceIdx)) voiceIdx = -1;

function ptVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  const all = speechSynthesis.getVoices();
  const pt = all.filter(v => v.lang?.toLowerCase().startsWith('pt'));
  const br = pt.filter(v => v.lang.toLowerCase().includes('-br') || v.lang.toLowerCase().includes('br'));
  return br.length > 0 ? br : pt;
}

function voiceScore(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  let s = 0;
  if (n.includes('natural')) s += 100;          // Microsoft pt-BR Natural
  if (n.includes('google')) s += 60;            // Google português do Brasil
  if (n.includes('online')) s += 30;            // Microsoft online
  VOICE_PREFS.forEach((k, i) => { if (n.includes(k)) s += 20 - i; });
  if (v.lang?.toLowerCase().includes('br')) s += 15;
  if (v.localService) s += 5;
  return s;
}

/** Voz ativa: a escolhida pelo usuário ou a melhor pontuada */
function pickVoice(): SpeechSynthesisVoice | null {
  const list = ptVoices();
  if (list.length === 0) return null;
  if (voiceIdx >= 0 && voiceIdx < list.length) return list[voiceIdx];
  return [...list].sort((a, b) => voiceScore(b) - voiceScore(a))[0];
}

let lastSpoke = 0;

export function narrate(text: string): void {
  if (!narrOn || typeof speechSynthesis === 'undefined') return;
  try {
    const now = Date.now();
    if (now - lastSpoke < 900) return; // não acumula falas
    lastSpoke = now;
    if (speechSynthesis.speaking) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    // Taxa/pitch levemente variáveis → menos robótico e mais "personagem"
    u.rate = 0.98 + Math.random() * 0.08;   // 0.98–1.06
    u.pitch = 1.06 + Math.random() * 0.1;   // 1.06–1.16 (um pouco mais quente)
    u.volume = 1;
    const voice = pickVoice();
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  } catch { /* navegador sem TTS */ }
}

// ------------------------------------------------------------
//  Preferências / toggles
// ------------------------------------------------------------
export const audioFlags = {
  get sfx() { return sfxOn; },
  get music() { return musicOn; },
  get narrator() { return narrOn; },
  toggleSfx(): boolean { sfxOn = !sfxOn; writeFlag(LS.sfx, sfxOn); if (sfxOn) sfx('click'); return sfxOn; },
  toggleMusic(): boolean {
    musicOn = !musicOn; writeFlag(LS.music, musicOn);
    if (musicOn) musicStart(); else musicStop();
    return musicOn;
  },
  toggleNarrator(): boolean {
    narrOn = !narrOn; writeFlag(LS.narr, narrOn);
    if (!narrOn && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    else narrate('Narrador ativado.');
    return narrOn;
  },
  /** Nome da voz pt-BR ativa (a mais natural encontrada ou a escolhida) */
  get voiceName(): string { return pickVoice()?.name ?? 'padrão do sistema'; },
  /** Avança para a próxima voz pt-BR disponível (persiste no navegador) */
  cycleVoice(): string {
    const list = ptVoices();
    if (list.length === 0) return 'nenhuma voz pt-BR encontrada';
    voiceIdx = voiceIdx + 1 >= list.length ? 0 : voiceIdx + 1;
    localStorage.setItem(LS.voice, String(voiceIdx));
    narrate('Voz alterada.');
    return list[voiceIdx].name;
  },
};

/** Instala cliques globais + desbloqueia a música na primeira interação */
export function installAudio(): void {
  document.addEventListener('click', e => {
    const el = (e.target as HTMLElement | null)?.closest?.('button, .card, .opt');
    if (el && !(el as HTMLButtonElement).disabled) sfx('click');
    // primeira interação do usuário → libera a música (autoplay policy)
    if (musicOn && !musicTimer) musicStart();
  }, { capture: true });
  // pré-carrega vozes pt-BR (Chrome carrega de forma assíncrona)
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }
}
