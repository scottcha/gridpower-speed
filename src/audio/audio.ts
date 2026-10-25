/** Synthesised audio: no external assets, everything generated with WebAudio. */
interface AudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

type Sfx = 'click' | 'build' | 'claim' | 'research' | 'turn' | 'error' | 'victory' | 'link';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private step = 0;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const audioWindow: AudioWindow = window;
    const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : audioWindow.webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.55;
    master.connect(ctx.destination);
    const music = ctx.createGain();
    music.gain.value = 0.3;
    music.connect(master);
    const sfx = ctx.createGain();
    sfx.gain.value = 0.65;
    sfx.connect(master);
    this.ctx = ctx;
    this.master = master;
    this.musicGain = music;
    this.sfxGain = sfx;
    return ctx;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.04);
  }

  resume(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
    this.startMusic();
  }

  stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  startMusic(): void {
    if (this.musicTimer !== null) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const chords = [
      [110, 164.81, 220, 277.18],
      [98, 146.83, 196, 246.94],
      [87.31, 130.81, 174.61, 220],
      [123.47, 185, 246.94, 311.13],
    ];
    const playChord = () => {
      if (!this.ctx || !this.musicGain) return;
      const now = this.ctx.currentTime;
      const chord = chords[this.step % chords.length];
      const length = 7.5;
      chord.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = (i % 2 ? 4 : -4);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.055 / (i + 1), now + 1.8);
        gain.gain.linearRampToValueAtTime(0, now + length);
        osc.connect(gain);
        gain.connect(this.musicGain!);
        osc.start(now);
        osc.stop(now + length + 0.1);
      });
      // sparse bell motif
      if (this.step % 2 === 0) {
        const bell = this.ctx.createOscillator();
        const bg = this.ctx.createGain();
        bell.type = 'sine';
        bell.frequency.value = chord[2] * 2;
        bg.gain.setValueAtTime(0, now + 2.2);
        bg.gain.linearRampToValueAtTime(0.045, now + 2.4);
        bg.gain.exponentialRampToValueAtTime(0.0001, now + 5.8);
        bell.connect(bg);
        bg.connect(this.musicGain);
        bell.start(now + 2.2);
        bell.stop(now + 6);
      }
      this.step++;
    };
    playChord();
    this.musicTimer = window.setInterval(playChord, 7000);
  }

  sfx(name: Sfx): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const tone = (freq: number, dur: number, type: OscillatorType, gainValue: number, delay = 0, slide?: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + delay);
      if (slide) osc.frequency.exponentialRampToValueAtTime(slide, now + delay + dur);
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(gainValue, now + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.02);
    };
    switch (name) {
      case 'click':
        tone(520, 0.06, 'triangle', 0.08, 0, 380);
        break;
      case 'build':
        tone(140, 0.22, 'sine', 0.22, 0, 70);
        tone(660, 0.12, 'triangle', 0.09, 0.08);
        tone(990, 0.18, 'sine', 0.05, 0.12);
        break;
      case 'claim':
        tone(392, 0.12, 'triangle', 0.09);
        tone(587.33, 0.18, 'triangle', 0.08, 0.09);
        break;
      case 'research':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.24, 'sine', 0.07, i * 0.075));
        break;
      case 'turn':
        tone(196, 0.5, 'sine', 0.1, 0, 196);
        tone(293.66, 0.4, 'triangle', 0.06, 0.1);
        break;
      case 'error':
        tone(150, 0.16, 'sawtooth', 0.06, 0, 90);
        break;
      case 'link':
        tone(220, 0.16, 'sine', 0.12, 0, 440);
        tone(660, 0.2, 'triangle', 0.06, 0.1);
        break;
      case 'victory':
        [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.7, 'triangle', 0.085, i * 0.12));
        break;
    }
  }
}

export const audio = new AudioEngine();
