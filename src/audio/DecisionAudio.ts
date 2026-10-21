import { pathFor, type Scenario } from '../animation/scenario';
import { pinContacts, timing } from '../animation/timeline';
import type { Outcome } from '../animation/mechanism';

type Note = { time: number; frequency: number; endFrequency?: number; duration: number; volume: number; type?: OscillatorType };

// Original synthesized sound: soft mechanical pips, a spiral glide and a final
// three-note chord. No film recordings, audio files, randomness or microphone.
export function decisionNotes(scenario: Scenario, outcome: Outcome): Note[] {
  const path = pathFor(scenario);
  return [
    { time: timing[path].release, frequency: 180, endFrequency: 120, duration: .16, volume: .38, type: 'triangle' },
    ...pinContacts[path].map(([time, , color], i) => ({ time, frequency: (color === 'yes' ? 640 : 480) + i * 35, endFrequency: 260, duration: .09, volume: .22 })),
    { time: timing[path].entry, frequency: 190, endFrequency: 920, duration: timing[path].exit - timing[path].entry, volume: .18, type: 'triangle' },
    { time: 5.80, frequency: 150, endFrequency: 75, duration: .22, volume: .4, type: 'triangle' },
    ...resultNotes(outcome, 6.20),
  ];
}

function resultNotes(outcome: Outcome, time = 0): Note[] {
  const root = outcome === 'yes' ? 392 : 261.63;
  return [1, 1.25, 1.5].map((ratio, index) => ({ time: time + index * .065, frequency: root * ratio, duration: .48, volume: .16 }));
}

export function scheduleNote(context: BaseAudioContext, destination: AudioNode, note: Note, start: number, rate = 1) {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  const duration = note.duration / rate;
  oscillator.type = note.type || 'sine';
  oscillator.frequency.setValueAtTime(note.frequency, start);
  if (note.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(note.endFrequency, start + duration);
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(note.volume, start + Math.min(.012, duration * .15));
  envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
  envelope.gain.setValueAtTime(0, start + duration + .005);
  oscillator.connect(envelope).connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + .01);
  return { oscillator, envelope };
}

export class DecisionAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Set<ReturnType<typeof scheduleNote>>();
  private answerAt = Infinity;

  // Called exclusively from the SOUND button's user gesture.
  async enable() {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.gain.value = .18;
      this.master.connect(this.context.destination);
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.context.resume(),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Audio output is unavailable.')), 4000); }),
      ]);
    } finally { clearTimeout(timeout); }
    if (this.context.state !== 'running') throw new Error('Audio is unavailable. Tap SOUND to retry.');
  }

  private notes(notes: Note[], from: number, rate = 1) {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.master) return;
    for (const note of notes) {
      if (note.time < from - .02) continue;
      const start = context.currentTime + Math.max(0, (note.time - from) / rate);
      const voice = scheduleNote(context, this.master, note, start, rate);
      this.voices.add(voice);
      voice.oscillator.onended = () => {
        voice.oscillator.disconnect(); voice.envelope.disconnect(); this.voices.delete(voice);
      };
    }
  }

  play(scenario: Scenario, outcome: Outcome, from: number, rate: number) {
    this.stop();
    this.answerAt = this.context ? this.context.currentTime + (6.20 - from) / rate : Infinity;
    this.notes(decisionNotes(scenario, outcome), from, rate);
  }

  finish(outcome: Outcome) {
    // A normal run has already played its chord. Skipping, reduced motion and
    // WebGL failure still produce one short result sound when sound is on.
    const heard = !!this.context && this.answerAt <= this.context.currentTime;
    this.stop();
    if (!heard) this.notes(resultNotes(outcome), 0);
  }

  stop() {
    for (const { oscillator, envelope } of this.voices) {
      // Ramp an audible note down rather than cutting a waveform abruptly.
      const now = this.context?.currentTime || 0;
      if (typeof envelope.gain.cancelAndHoldAtTime === 'function') {
        envelope.gain.cancelAndHoldAtTime(now);
      } else {
        // Firefox does not implement cancelAndHoldAtTime. Preserve the current
        // level before cancelling automation, then use the same short fade.
        const level = envelope.gain.value;
        envelope.gain.cancelScheduledValues(now);
        envelope.gain.setValueAtTime(level, now);
      }
      envelope.gain.linearRampToValueAtTime(0, now + .015);
      oscillator.stop(now + .02);
    }
    this.voices.clear();
    this.answerAt = Infinity;
  }

  async suspend() { this.stop(); if (this.context?.state === 'running') await this.context.suspend(); }
  async resume() { if (this.context?.state === 'suspended') await this.context.resume(); }
  dispose() { this.stop(); void this.context?.close().catch(() => {}); this.context = null; this.master = null; }
}
