import { describe, expect, it, vi } from "vitest";
import { VideoTexture } from "three";
import { VideoFrameUpload } from "./video-frame-upload";

function decoder() {
  return {
    readyState: 1,
    currentTime: 0,
    srcObject: {} as unknown,
    requestVideoFrameCallback: vi.fn(() => 1),
    cancelVideoFrameCallback: vi.fn(),
  };
}
describe("canonical video texture uploads", () => {
  it("uploads the initial ready frame even when a detached decoder never invokes rVFC", () => {
    const video = decoder(),
      texture = new VideoTexture(video as unknown as HTMLVideoElement),
      upload = new VideoFrameUpload();
    expect(upload.update(video, texture)).toBe(false);
    expect(texture.version).toBe(0);
    video.readyState = 2;
    expect(upload.update(video, texture)).toBe(true);
    expect(texture.version).toBe(1);
    expect(upload.update(video, texture)).toBe(false);
    expect(texture.version).toBe(1);
    video.currentTime = 1 / 30;
    expect(upload.update(video, texture)).toBe(true);
    expect(texture.version).toBe(2);
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(1);
    texture.dispose();
  });
  it("uploads an advanced or restarted timestamp without requiring a DOM presentation surface", () => {
    const video = { readyState: 4, currentTime: 10, srcObject: {} },
      texture = { needsUpdate: false },
      upload = new VideoFrameUpload();
    expect(upload.update(video, texture)).toBe(true);
    texture.needsUpdate = false;
    video.currentTime = 10.033;
    expect(upload.update(video, texture)).toBe(true);
    texture.needsUpdate = false;
    video.currentTime = 0;
    expect(upload.update(video, texture)).toBe(true);
  });
  it("uploads a replaced source even when its first timestamp equals the previous source", () => {
    const video = { readyState: 2, currentTime: 0, srcObject: {} },
      texture = { needsUpdate: false },
      upload = new VideoFrameUpload();
    upload.update(video, texture);
    texture.needsUpdate = false;
    video.srcObject = {};
    expect(upload.update(video, texture)).toBe(true);
    expect(texture.needsUpdate).toBe(true);
  });
  it("waits for current data and reuploads after readiness recovers at the same timestamp", () => {
    const video = { readyState: 2, currentTime: 0, srcObject: {} },
      texture = { needsUpdate: false },
      upload = new VideoFrameUpload();
    upload.update(video, texture);
    texture.needsUpdate = false;
    video.readyState = 1;
    expect(upload.update(video, texture)).toBe(false);
    expect(texture.needsUpdate).toBe(false);
    video.readyState = 2;
    expect(upload.update(video, texture)).toBe(true);
  });
});
