"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Headphones, Radio } from "lucide-react";
import { api, getSession } from "@/lib/client";
import type { ShowEnvelope } from "@/lib/contracts";
import { useMediaRoom } from "@/media/use-media-room";
import { VideoSurface } from "@/media/video-surface";
import {
  programAuthorityIssue,
  rejectedProgramGrant,
} from "@/media/program-status";
import { PortalMark } from "./brand";
import { Spinner } from "./ui";
const RehearsalCanvas = dynamic(() => import("@/stage/stage-canvas"), {
  ssr: false,
  loading: () => (
    <div className="program-holding">
      <Spinner label="Preparing the illustrated rehearsal…" />
    </div>
  ),
});

export function ProgramClient({
  showId,
  transportTest = false,
}: {
  showId?: string;
  transportTest?: boolean;
}) {
  const [localHost, setLocalHost] = useState(false);
  useEffect(() => {
    setLocalHost(
      ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname),
    );
  }, []);
  const [envelope, setEnvelope] = useState<ShowEnvelope | null>(null),
    [error, setError] = useState(""),
    [code, setCode] = useState(""),
    [id, setId] = useState(showId || ""),
    [loading, setLoading] = useState(!!showId),
    [pairing, setPairing] = useState(false),
    [serverClock, setServerClock] = useState(0);
  const serverSample = envelope?.serverNow;
  const clockOffset = useMemo(
    () => (serverSample === undefined ? 0 : serverSample - Date.now()),
    [serverSample],
  );
  useEffect(() => {
    if (serverSample === undefined) return;
    const update = () => setServerClock(Date.now() + clockOffset);
    update();
    const timer = window.setInterval(update, 250);
    return () => clearInterval(timer);
  }, [serverSample, clockOffset]);
  useEffect(() => {
    if (!showId) return;
    let active = true,
      timer: number;
    async function poll() {
      try {
        const value = await api<ShowEnvelope>(
          `/api/program?show=${encodeURIComponent(showId!)}`,
        );
        if (active) {
          setEnvelope(value);
          setError("");
          setLoading(false);
        }
      } catch (e) {
        if (active) {
          if (rejectedProgramGrant(e)) setEnvelope(null);
          setError(
            rejectedProgramGrant(e)
              ? "Program pairing is no longer valid. Picture and audio have stopped. Ask the director for a new pairing code."
              : e instanceof Error
                ? e.message
                : "Pair this output with your director.",
          );
          setLoading(false);
        }
      }
      if (active) timer = window.setTimeout(poll, 1300);
    }
    void getSession()
      .then(poll)
      .catch(() => {
        if (active) {
          setLoading(false);
          setError("The output session could not be opened.");
        }
      });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [showId]);
  async function pair() {
    setPairing(true);
    setError("");
    try {
      await getSession();
      const value = await api<ShowEnvelope>("/api/program", {
        method: "POST",
        body: JSON.stringify({ showId: id.trim(), code: code.trim() }),
      });
      setEnvelope(value);
      setCode("");
      if (!showId || showId !== id.trim())
        window.location.replace(
          `/program?show=${encodeURIComponent(id.trim())}`,
        );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "That pairing code could not be used.",
      );
    } finally {
      setPairing(false);
    }
  }
  if (loading && !envelope)
    return (
      <main className="program-page program-holding" id="main-content">
        <PortalMark />
        <Spinner label="Finding your Program stream…" />
      </main>
    );
  if (!envelope)
    return (
      <main className="program-page program-pair-page" id="main-content">
        <div className="program-pair-card">
          <PortalMark />
          <p className="eyebrow">A CLEAN VIEW OF THE MAGIC</p>
          <h1>Pair your Program.</h1>
          <p>
            The director creates a one-time pairing code in{" "}
            <strong>Program output</strong>. This screen receives their single
            composed stream.
          </p>
          <form
            className="program-pair-form"
            onSubmit={(e) => {
              e.preventDefault();
              void pair();
            }}
          >
            <label className="field-label">
              Show identifier
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                required
                autoComplete="off"
                placeholder="ps_…"
              />
            </label>
            <label className="field-label">
              One-time pairing code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoComplete="off"
                placeholder="Enter the director’s code"
              />
            </label>
            <button
              type="submit"
              className="button button-gold full-width"
              disabled={pairing || !id.trim() || !code.trim()}
            >
              {pairing ? "Pairing the output…" : "Open Program"}
              <ArrowRight size={17} />
            </button>
          </form>
          {error ? (
            <p className="panel-error" role="alert">
              {error}
            </p>
          ) : null}
          <Link className="text-link" href="/studio">
            <ArrowLeft size={15} /> Return to the studio
          </Link>
        </div>
      </main>
    );
  const authorityIssue = programAuthorityIssue(
    envelope.show,
    serverClock || envelope.serverNow,
  );
  return envelope.show.mode === "rehearsal" && !(transportTest && localHost) ? (
    <main className="program-page rehearsal-program" id="main-content">
      <div className="program-frame">
        <RehearsalCanvas show={envelope.show} serverOffset={clockOffset} />
      </div>
      <span className="program-rehearsal-label">
        SYNTHETIC REHEARSAL · LOCAL SCENE PREVIEW · NO LIVE CAMERAS OR AUDIENCE
      </span>
      {error || authorityIssue ? (
        <p className="program-transport-label" role="alert">
          {error || authorityIssue}
        </p>
      ) : null}
    </main>
  ) : (
    <LiveProgram
      envelope={envelope}
      controlError={error}
      authorityIssue={authorityIssue}
      syntheticTransport={
        transportTest && localHost && envelope.show.mode === "rehearsal"
      }
    />
  );
}
function LiveProgram({
  envelope,
  controlError,
  authorityIssue,
  syntheticTransport = false,
}: {
  envelope: ShowEnvelope;
  controlError: string;
  authorityIssue: string | null;
  syntheticTransport?: boolean;
}) {
  const { show } = envelope;
  const ended = show.phase === "ended";
  const media = useMediaRoom({
    show,
    role: "program",
    slot: null,
    serverNow: envelope.serverNow,
    allowSyntheticMedia: syntheticTransport,
  });
  useEffect(() => {
    if (!ended) void media.connect().catch(() => undefined);
    return () => {
      void media.disconnect();
    };
  }, [show.id, ended, media.connect, media.disconnect]);
  return (
    <main className="program-page" id="main-content">
      {controlError ? (
        <p className="program-transport-label" role="alert">
          Program state could not refresh. {controlError}
        </p>
      ) : syntheticTransport ? (
        <span className="program-transport-label">
          SYNTHETIC MEDIA · LOCAL WEBRTC TRANSPORT TEST · NO REAL PERFORMERS
        </span>
      ) : null}
      {media.programVideo && !ended && !authorityIssue ? (
        <div className="program-frame">
          <VideoSurface
            video={media.programVideo}
            fit="contain"
            label="Canonical director Program stream"
          />
        </div>
      ) : (
        <div className="program-holding">
          <span className="program-holding-spark" aria-hidden="true">
            ✦
          </span>
          <h1>
            {ended
              ? "Until the next impossible thing."
              : authorityIssue
                ? "Program is on hold."
                : "A moment in the wings."}
          </h1>
          <p>
            {ended
              ? "Thank you for sharing the stage."
              : authorityIssue
                ? authorityIssue
                : "Waiting for the director’s Program stream."}
          </p>
          <span>PORTAL STAGE</span>
          {media.error ? (
            <p className="program-connection-note" role="status">
              {media.error.message}
            </p>
          ) : null}
          {!ended &&
          !authorityIssue &&
          (media.status === "error" || media.status === "disconnected") ? (
            <button
              className="button button-dark"
              onClick={() => {
                void media.connect().catch(() => undefined);
              }}
            >
              <Radio size={17} /> Reconnect Program
            </button>
          ) : null}
        </div>
      )}
      {!ended &&
      !authorityIssue &&
      (media.audioBlocked || media.videoBlocked) ? (
        <button
          className="program-enable-audio button button-gold"
          onClick={() => {
            void media.startAudio();
          }}
        >
          <Headphones size={17} /> Enable Program playback
        </button>
      ) : null}
    </main>
  );
}
