import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("bundled, versioned on-device assets", () => {
  it("ships the verified HandLandmarker v1 model rather than fetching a floating remote model", () => {
    const model = readFileSync(
      new URL(
        "../public/vision/hand_landmarker-float16-v1.task",
        import.meta.url,
      ),
    );
    expect(model.byteLength).toBe(7_819_105);
    expect(createHash("sha256").update(model).digest("hex")).toBe(
      "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1",
    );
  });
  it("preserves exact SDK/wasm checksums and the upstream license", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL("../public/vision/assets.json", import.meta.url),
        "utf8",
      ),
    ) as {
      sdk: string;
      files: Array<{ path: string; bytes: number; sha256: string }>;
    };
    expect(manifest.sdk).toBe("@mediapipe/tasks-vision@1.2.0");
    for (const file of manifest.files) {
      const bytes = readFileSync(
        new URL(`../public/vision/${file.path}`, import.meta.url),
      );
      expect(bytes.byteLength).toBe(file.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        file.sha256,
      );
    }
    expect(
      readFileSync(
        new URL("../public/vision/LICENSE.mediapipe.txt", import.meta.url),
        "utf8",
      ),
    ).toContain("Apache License");
  });
});
