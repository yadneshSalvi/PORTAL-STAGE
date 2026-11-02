import { Camera, Scene } from "three";
import { describe, expect, it, vi } from "vitest";
import { createProgramFrame, presentCanonicalFrame } from "./program-frame";

describe("canonical capture before director feedback", () => {
  it("copies one clean 1080p frame before each local overlay, with no previous-frame leak", () => {
    const source = { width: 1920, height: 1080, pixels: "" };
    const output = { width: 0, height: 0, pixels: "", getContext: vi.fn() };
    const copy = vi.fn(() => {
      output.pixels = source.pixels;
    });
    output.getContext.mockReturnValue({ drawImage: copy });
    const program = createProgramFrame(
      source as unknown as HTMLCanvasElement,
      () => output as unknown as HTMLCanvasElement,
    );
    const scene = new Scene(),
      feedback = new Scene(),
      camera = new Camera();
    let frame = 0;
    const renderer = {
      autoClear: true,
      clearDepth: vi.fn(),
      render: vi.fn((renderScene: Scene) => {
        if (renderer.autoClear) source.pixels = "";
        source.pixels +=
          renderScene === scene ? `stage-${++frame}` : ":local-ring";
      }),
    };
    presentCanonicalFrame(renderer, scene, camera, program, null);
    expect(output.pixels).toBe("stage-1");
    expect(source.pixels).toBe("stage-1");
    for (let count = 2; count <= 4; count++) {
      presentCanonicalFrame(renderer, scene, camera, program, feedback);
      expect(output.pixels).toBe(`stage-${count}`);
      expect(source.pixels).toBe(`stage-${count}:local-ring`);
      expect(copy).toHaveBeenCalledTimes(count);
      expect(copy).toHaveBeenLastCalledWith(source, 0, 0, 1920, 1080);
      expect(renderer.autoClear).toBe(true);
    }
    presentCanonicalFrame(renderer, scene, camera, program, null);
    expect(output.pixels).toBe("stage-5");
    expect(source.pixels).toBe("stage-5");
    expect(renderer.clearDepth).toHaveBeenCalledTimes(3);
    expect(program.canvas).not.toBe(source);
    expect(output.width).toBe(1920);
    expect(output.height).toBe(1080);
    program.dispose();
    expect(output.width).toBe(0);
    expect(output.height).toBe(0);
  });

  it("does not silently publish a director overlay if a clean capture context is unavailable", () => {
    expect(() =>
      createProgramFrame(
        { width: 1920, height: 1080 } as HTMLCanvasElement,
        () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
      ),
    ).toThrow("clean Program capture");
  });
});
