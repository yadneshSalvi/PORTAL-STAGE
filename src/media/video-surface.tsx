"use client";

import { useEffect, useRef } from "react";
import { bindVideoPresentation } from "./video-presentation";

/** Owns a presentation element; modal visibility never reparents the canonical decoder. */
export function VideoSurface({
  video,
  mirrored = false,
  className,
  label = "Live video",
  fit = "cover",
}: {
  video: HTMLVideoElement | null;
  mirrored?: boolean;
  className?: string;
  label?: string;
  fit?: "cover" | "contain";
}) {
  const presentation = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!presentation.current || !video) return;
    return bindVideoPresentation(video, presentation.current);
  }, [video]);
  return (
    <div
      className={className}
      role="img"
      aria-label={label}
      style={{ width: "100%", height: "100%", overflow: "hidden" }}
    >
      <video
        ref={presentation}
        autoPlay
        muted
        playsInline
        controls={false}
        aria-label={label}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: fit,
          transform: mirrored ? "scaleX(-1)" : "none",
        }}
      />
    </div>
  );
}
