import type { Slot } from "../lib/contracts";

type Input = {
  track: MediaStreamTrack;
  source: MediaStreamAudioSourceNode;
  gate: GainNode;
  analyser: AnalyserNode;
  samples: Float32Array<ArrayBuffer>;
};

/** No node connects to context.destination: the director never monitors their own mix. */
export class ProgramAudioMixer {
  readonly context: AudioContext;
  readonly destination: MediaStreamAudioDestinationNode;
  private inputs = new Map<Slot, Input>();
  private limiter: DynamicsCompressorNode;

  constructor(
    context = new AudioContext({
      latencyHint: "interactive",
      sampleRate: 48000,
    }),
  ) {
    this.context = context;
    this.destination = context.createMediaStreamDestination();
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    this.limiter.connect(this.destination);
  }

  setInput(slot: Slot, track: MediaStreamTrack | null) {
    if (this.inputs.get(slot)?.track === track) return;
    this.removeInput(slot);
    if (!track || track.readyState === "ended") return;
    const source = this.context.createMediaStreamSource(
      new MediaStream([track]),
    );
    const gate = this.context.createGain();
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 256;
    gate.gain.value = 0;
    source.connect(analyser);
    analyser.connect(gate);
    gate.connect(this.limiter);
    this.inputs.set(slot, {
      track,
      source,
      gate,
      analyser,
      samples: new Float32Array(256),
    });
  }

  setAdmitted(slot: Slot, admitted: boolean) {
    const input = this.inputs.get(slot);
    if (!input) return;
    input.gate.gain.cancelScheduledValues(this.context.currentTime);
    input.gate.gain.setValueAtTime(
      admitted && input.track.enabled && input.track.readyState === "live"
        ? 0.8
        : 0,
      this.context.currentTime,
    );
  }

  removeInput(slot: Slot) {
    const input = this.inputs.get(slot);
    if (!input) return;
    input.source.disconnect();
    input.analyser.disconnect();
    input.gate.disconnect();
    this.inputs.delete(slot);
  }

  levels(): Record<Slot | "program", number> {
    const result = { A: 0, B: 0, program: 0 };
    for (const [slot, input] of this.inputs) {
      input.analyser.getFloatTimeDomainData(input.samples);
      let squareSum = 0;
      for (const sample of input.samples) squareSum += sample * sample;
      result[slot] = Math.min(
        1,
        Math.sqrt(squareSum / input.samples.length) * 4,
      );
      result.program = Math.min(
        1,
        result.program + result[slot] * input.gate.gain.value,
      );
    }
    return result;
  }

  async resume() {
    if (this.context.state === "suspended") await this.context.resume();
  }

  async close() {
    this.removeInput("A");
    this.removeInput("B");
    this.limiter.disconnect();
    this.destination.stream.getTracks().forEach((track) => track.stop());
    if (this.context.state !== "closed") await this.context.close();
  }
}
