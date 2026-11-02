/**
 * Tasks Vision labels the subject's own hand for unmirrored input pixels.
 * Only mirrored input needs a swap; CSS mirroring of a preview does not count.
 * https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js#handle_and_display_results
 * The task graph changed its labels in MediaPipe 0.10.5 (unlike legacy Hands):
 * https://github.com/google-ai-edge/mediapipe/commit/ed0c8d8d8bbd466eac1e483ab62a42dd7d486e96
 */
export function subjectHandedness(
  categoryName: string,
  inputMirrored = false,
): "left" | "right" | null {
  const hand = categoryName.toLowerCase();
  if (hand !== "left" && hand !== "right") return null;
  return inputMirrored ? (hand === "left" ? "right" : "left") : hand;
}
