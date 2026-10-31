import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramAudioMixer } from "../src/media/audio-mix";

function parameter(value = 0) {
  const param = {
    value,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn((next: number, _at: number) => {
      param.value = next;
    }),
  };
  return param;
}
function node() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}
function context() {
  const sources: ReturnType<typeof node>[] = [];
  const gains: Array<
    ReturnType<typeof node> & { gain: ReturnType<typeof parameter> }
  > = [];
  const track = { stop: vi.fn() };
  const destination = { ...node(), stream: { getTracks: () => [track] } };
  const limiter = {
    ...node(),
    threshold: parameter(),
    knee: parameter(),
    ratio: parameter(),
    attack: parameter(),
    release: parameter(),
  };
  const result = {
    state: "running",
    currentTime: 10,
    destination: { physicalSpeakers: true },
    createMediaStreamDestination: vi.fn(() => destination),
    createDynamicsCompressor: vi.fn(() => limiter),
    createMediaStreamSource: vi.fn(() => {
      const source = node();
      sources.push(source);
      return source;
    }),
    createGain: vi.fn(() => {
      const gain = { ...node(), gain: parameter() };
      gains.push(gain);
      return gain;
    }),
    createAnalyser: vi.fn(() => ({
      ...node(),
      fftSize: 0,
      getFloatTimeDomainData: (array: Float32Array) => array.fill(0.1),
    })),
    resume: vi.fn(async () => {
      result.state = "running";
    }),
    close: vi.fn(async () => {
      result.state = "closed";
    }),
  };
  return { result, sources, gains, destination, limiter, track };
}
beforeEach(() => {
  vi.stubGlobal(
    "MediaStream",
    class {
      constructor(readonly tracks: unknown[]) {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("the single public audio mix", () => {
  it("has no connection to physical speakers and defaults every voice to zero gain", () => {
    const graph = context();
    const mix = new ProgramAudioMixer(graph.result as unknown as AudioContext);
    const input = {
      readyState: "live",
      enabled: true,
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
    mix.setInput("A", input);
    mix.setInput("B", input);
    expect(graph.gains.map((gain) => gain.gain.value)).toEqual([0, 0]);
    expect(graph.limiter.connect).toHaveBeenCalledWith(graph.destination);
    for (const source of [...graph.sources, ...graph.gains, graph.limiter])
      expect(source.connect).not.toHaveBeenCalledWith(graph.result.destination);
  });
  it("gates admission immediately and refuses an ended or disabled voice even if admitted", () => {
    const graph = context();
    const mix = new ProgramAudioMixer(graph.result as unknown as AudioContext);
    const input = { readyState: "live", enabled: true } as MediaStreamTrack;
    mix.setInput("A", input);
    mix.setAdmitted("A", true);
    expect(graph.gains[0].gain.value).toBe(0.8);
    mix.setAdmitted("A", false);
    expect(graph.gains[0].gain.value).toBe(0);
    input.enabled = false;
    mix.setAdmitted("A", true);
    expect(graph.gains[0].gain.value).toBe(0);
    expect(graph.gains[0].gain.cancelScheduledValues).toHaveBeenCalledWith(10);
  });
  it("meters a backstage microphone without adding that voice to the public output", () => {
    const graph = context();
    const mix = new ProgramAudioMixer(graph.result as unknown as AudioContext);
    mix.setInput("B", {
      readyState: "live",
      enabled: true,
    } as MediaStreamTrack);
    expect(mix.levels().B).toBeCloseTo(0.4);
    expect(mix.levels().program).toBe(0);
    mix.setAdmitted("B", true);
    expect(mix.levels().program).toBeCloseTo(0.32);
  });
  it("disconnects graph nodes and stops the mix track without stopping a peer's source track", async () => {
    const graph = context();
    const mix = new ProgramAudioMixer(graph.result as unknown as AudioContext);
    const source = {
      readyState: "live",
      enabled: true,
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
    mix.setInput("B", source);
    await mix.close();
    expect(graph.sources[0].disconnect).toHaveBeenCalled();
    expect(graph.track.stop).toHaveBeenCalled();
    expect(source.stop).not.toHaveBeenCalled();
    expect(graph.result.close).toHaveBeenCalled();
  });
});
