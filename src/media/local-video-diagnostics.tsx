"use client";

import { useEffect, useState } from "react";
import { decoderDiagnostics, playCanonicalVideo } from "./video-diagnostics";

/** Caller must restrict this inspection panel to the local transport test. */
export function LocalVideoDiagnostics({
  video,
}: {
  video: HTMLVideoElement | null;
}) {
  const [state, setState] = useState(() => decoderDiagnostics(video));
  useEffect(() => {
    const refresh = () => setState(decoderDiagnostics(video));
    refresh();
    const timer = setInterval(refresh, 500);
    return () => clearInterval(timer);
  }, [video]);
  return (
    <div data-testid="local-video-diagnostics">
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {JSON.stringify(state, null, 2)}
      </pre>
      <button
        type="button"
        disabled={!video}
        onClick={() => {
          if (!video) return;
          void playCanonicalVideo(video, "user-resume").then(() =>
            setState(decoderDiagnostics(video)),
          );
        }}
      >
        Resume test decoder
      </button>
    </div>
  );
}
