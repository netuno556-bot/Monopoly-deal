// Controles de áudio fixos (efeitos, música, narrador, voz)
import { useState } from 'react';
import { audioFlags } from '../audio';

export default function AudioControls() {
  const [sfxOn, setSfxOn] = useState(audioFlags.sfx);
  const [musicOn, setMusicOn] = useState(audioFlags.music);
  const [narrOn, setNarrOn] = useState(audioFlags.narrator);
  const [voice, setVoice] = useState(audioFlags.voiceName);

  return (
    <div className="corner-tools" aria-label="Áudio do jogo">
      <button
        className={sfxOn ? '' : 'off'}
        title={sfxOn ? 'Efeitos sonoros: ligados' : 'Efeitos sonoros: desligados'}
        onClick={() => setSfxOn(audioFlags.toggleSfx())}
      >
        {sfxOn ? '🔊' : '🔇'}
      </button>
      <button
        className={musicOn ? '' : 'off'}
        title={musicOn ? 'Música de fundo: ligada' : 'Música de fundo: desligada'}
        onClick={() => setMusicOn(audioFlags.toggleMusic())}
      >
        🎵
      </button>
      <button
        className={narrOn ? '' : 'off'}
        title={narrOn ? 'Narrador: ligado' : 'Narrador: desligado'}
        onClick={() => setNarrOn(audioFlags.toggleNarrator())}
      >
        🎙️
      </button>
      <button
        title={`Voz do narrador: ${voice} — clique para trocar`}
        onClick={() => setVoice(audioFlags.cycleVoice())}
      >
        🗣️
      </button>
    </div>
  );
}
