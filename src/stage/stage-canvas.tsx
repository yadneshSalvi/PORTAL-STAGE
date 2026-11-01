"use client";
import { useEffect, useRef, useState } from "react";
import { TheaterPoster } from "@/components/theater-poster";
import { ParcelPoster } from "@/components/parcel-poster";
import { StatusPill } from "@/components/ui";
import { createTheaterRenderer, type RenderInput } from "./renderer";
import { propLabel } from "@/lib/show-grammar";
export type StageCanvasProps = RenderInput;
export default function StageCanvas(props: StageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    latest = useRef(props);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    latest.current = props;
  }, [props]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      return createTheaterRenderer(
        canvas,
        () => latest.current,
        () => setFailed(true),
      );
    } catch {
      setFailed(true);
      latest.current.onRenderHealth?.({
        fps: 0,
        width: 1920,
        height: 1080,
        webgl: false,
      });
    }
  }, []);
  if (failed)
    return (
      <div className="stage-fallback">
        {props.show.episode === "midnight-parcel" ? (
          <ParcelPoster />
        ) : (
          <TheaterPoster compact showLabel={false} />
        )}
        <div className="stage-fallback-label" role="alert">
          {props.show.mode === "rehearsal" ? (
            <StatusPill tone="gold">Rehearsal</StatusPill>
          ) : null}
          <p>Stage unavailable. Enable hardware acceleration.</p>
          <button
            className="button button-dark"
            onClick={() => window.location.reload()}
          >
            Reload stage
          </button>
        </div>
      </div>
    );
  return (
    <canvas
      ref={canvasRef}
      width="1920"
      height="1080"
      className="canonical-canvas"
      aria-label={`Canonical ${props.show.mode} stage for ${props.show.preset.episodeTitle}. The ${propLabel(props.show)} is in ${props.show.mode === "solo" && props.show.umbrella.owner === "B" ? "the illustrated Audience Room" : `performer ${props.show.umbrella.owner}`}’s care.${props.localPreviewA ? " Camera A is local to this browser and is not uploaded." : ""}`}
    />
  );
}
