/* PORTAL STAGE worker. Upstream MediaPipe runtime/model: Apache-2.0, see LICENSE.mediapipe.txt. */
"use strict";

// All inference assets are same-origin. Block the SDK's optional aggregate metrics
// endpoint as well as accidental external fetches; no frames or landmarks leave this worker.
const nativeFetch = self.fetch.bind(self);
self.fetch = (input, init) => {
  const address = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
    self.location.href,
  );
  if (address.origin !== self.location.origin)
    return Promise.reject(
      new Error("Vision worker permits same-origin assets only."),
    );
  return nativeFetch(input, init);
};
const nativeOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (method, url, ...rest) {
  if (new URL(url, self.location.href).origin !== self.location.origin)
    throw new Error("Vision worker blocks external requests.");
  return nativeOpen.call(this, method, url, ...rest);
};

let landmarker = null;
let busy = false;
self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      importScripts("/vision/tasks-vision-1.2.0.js");
      const assets =
        await Vision.FilesetResolver.forVisionTasks("/vision/wasm/1.2.0");
      landmarker = await Vision.HandLandmarker.createFromOptions(assets, {
        baseOptions: {
          modelAssetPath: "/vision/hand_landmarker-float16-v1.task",
          delegate: "CPU",
        },
        canvas: new OffscreenCanvas(640, 360),
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.8,
        minHandPresenceConfidence: 0.8,
        minTrackingConfidence: 0.8,
      });
      self.postMessage({ type: "ready" });
    } catch {
      landmarker?.close();
      landmarker = null;
      self.postMessage({
        type: "error",
        message:
          "On-device hand tracking could not load. Offer / Accept buttons remain available.",
      });
    }
    return;
  }
  if (data.type === "frame") {
    const bitmap = data.bitmap;
    if (!landmarker || busy) {
      bitmap?.close();
      return;
    }
    busy = true;
    const started = performance.now();
    try {
      const result = landmarker.detectForVideo(bitmap, data.timestamp);
      // Keep only the transient signal needed for intent; no world/body model or image returns.
      self.postMessage({
        type: "result",
        timestamp: data.timestamp,
        inferenceMs: performance.now() - started,
        detection: {
          landmarks: result.landmarks,
          handedness: result.handedness,
        },
      });
    } catch {
      self.postMessage({
        type: "error",
        message:
          "Hand tracking paused. Use buttons, then enable gestures again when ready.",
      });
    } finally {
      bitmap?.close();
      busy = false;
    }
  }
};
