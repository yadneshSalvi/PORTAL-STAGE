import { describe, expect, it, vi } from "vitest";
import { bindVideoPresentation } from "../src/media/video-presentation";

class Video extends EventTarget {
  srcObject: unknown;
  autoplay = false;
  playsInline = false;
  defaultMuted = false;
  muted = false;
  controls = true;
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  style = { transform: "canonical-style" };
  constructor(
    stream: unknown = null,
    public paused = true,
  ) {
    super();
    this.srcObject = stream;
  }
  setAttribute = (name: string, value: string) =>
    this.attributes.set(name, value);
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  remove = vi.fn();
  element() {
    return this as unknown as HTMLVideoElement;
  }
}
function stream() {
  const track = { stop: vi.fn() };
  return { getTracks: () => [track], track, clone: vi.fn() };
}

describe("presentation video ownership", () => {
  it("plays a separate muted element without moving, styling, pausing or starting the canonical decoder", () => {
    const media = stream(),
      decoder = new Video(media, false),
      preview = new Video();
    const cleanup = bindVideoPresentation(decoder.element(), preview.element());
    expect(preview.srcObject).toBe(media);
    expect(decoder.srcObject).toBe(media);
    expect(preview).toMatchObject({
      autoplay: true,
      muted: true,
      defaultMuted: true,
      playsInline: true,
      controls: false,
    });
    expect(preview.attributes.has("muted")).toBe(true);
    expect(preview.play).toHaveBeenCalledTimes(1);
    expect(decoder.play).not.toHaveBeenCalled();
    expect(decoder.pause).not.toHaveBeenCalled();
    expect(decoder.remove).not.toHaveBeenCalled();
    expect(decoder.style.transform).toBe("canonical-style");
    expect(decoder.attributes.size).toBe(0);
    cleanup();
    expect(decoder.paused).toBe(false);
    expect(decoder.srcObject).toBe(media);
    expect(media.track.stop).not.toHaveBeenCalled();
    expect(media.clone).not.toHaveBeenCalled();
  });
  it("closing one surface leaves the renderer decoder and another surface playing", () => {
    const media = stream(),
      decoder = new Video(media, false),
      first = new Video(),
      second = new Video();
    const closeFirst = bindVideoPresentation(
      decoder.element(),
      first.element(),
    );
    const closeSecond = bindVideoPresentation(
      decoder.element(),
      second.element(),
    );
    closeFirst();
    closeFirst();
    expect(first.srcObject).toBeNull();
    expect(first.pause).toHaveBeenCalledTimes(1);
    expect(second.srcObject).toBe(media);
    expect(second.paused).toBe(false);
    expect(decoder.srcObject).toBe(media);
    expect(decoder.paused).toBe(false);
    expect(decoder.pause).not.toHaveBeenCalled();
    closeSecond();
    expect(media.track.stop).not.toHaveBeenCalled();
  });
  it("follows SDK source replacement and removes listeners on surface cleanup", () => {
    const initial = stream(),
      replacement = stream(),
      decoder = new Video(initial, false),
      preview = new Video();
    const cleanup = bindVideoPresentation(decoder.element(), preview.element());
    decoder.srcObject = replacement;
    decoder.dispatchEvent(new Event("loadedmetadata"));
    expect(preview.srcObject).toBe(replacement);
    expect(preview.play).toHaveBeenCalledTimes(2);
    cleanup();
    decoder.srcObject = initial;
    decoder.dispatchEvent(new Event("loadedmetadata"));
    expect(preview.srcObject).toBeNull();
    expect(preview.play).toHaveBeenCalledTimes(2);
    expect(decoder.srcObject).toBe(initial);
    expect(initial.track.stop).not.toHaveBeenCalled();
    expect(replacement.track.stop).not.toHaveBeenCalled();
  });
  it("clears a presentation when its owner clears the stream without stopping any source track itself", () => {
    const media = stream(),
      decoder = new Video(media, false),
      preview = new Video();
    const cleanup = bindVideoPresentation(decoder.element(), preview.element());
    decoder.srcObject = null;
    decoder.dispatchEvent(new Event("emptied"));
    expect(preview.srcObject).toBeNull();
    expect(preview.paused).toBe(true);
    expect(media.track.stop).not.toHaveBeenCalled();
    expect(decoder.pause).not.toHaveBeenCalled();
    cleanup();
  });
  it("does not let a presentation autoplay rejection interrupt its canonical decoder", async () => {
    const media = stream(),
      decoder = new Video(media, false),
      preview = new Video();
    preview.play.mockRejectedValueOnce(
      new DOMException("blocked presentation", "NotAllowedError"),
    );
    const cleanup = bindVideoPresentation(decoder.element(), preview.element());
    await Promise.resolve();
    expect(decoder.paused).toBe(false);
    expect(decoder.pause).not.toHaveBeenCalled();
    cleanup();
    expect(media.track.stop).not.toHaveBeenCalled();
  });
  it("refuses a caller accidentally using the canonical decoder as its presentation", () => {
    const decoder = new Video(stream(), false);
    expect(() =>
      bindVideoPresentation(decoder.element(), decoder.element()),
    ).toThrow("own element");
    expect(decoder.pause).not.toHaveBeenCalled();
    expect(decoder.play).not.toHaveBeenCalled();
  });
});
