"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  Clapperboard,
  CloudRain,
  CodeXml,
  ExternalLink,
  Eye,
  EyeOff,
  Hand,
  Headphones,
  Link2,
  Mic,
  Monitor,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Umbrella,
  Users,
  WandSparkles,
} from "lucide-react";
import type { ShowAction, ShowEnvelope, Slot } from "@/lib/contracts";
import { getSession } from "@/lib/client";
import type { SessionInfo } from "@/lib/contracts";
import { TwitchConnector } from "@/lib/twitch-client";
import { useMediaRoom } from "@/media/use-media-room";
import { LocalVideoDiagnostics } from "@/media/local-video-diagnostics";
import { type GestureCalibration } from "@/vision/calibration";
import { useGestureInput } from "@/vision/use-gesture-input";
import { Wordmark, SiteHeader, SiteFooter } from "./brand";
import { TheaterPoster } from "./theater-poster";
import { NewShowButton } from "./new-show-button";
import { EmptyRoom, ErrorNotice, LoadingScreen, Modal, StatusPill } from "./ui";
import { CueDeck, AudienceChoice, nextCue } from "./cue-deck";
import { DeviceSetup } from "./device-setup";
import {
  EvidencePanel,
  InvitePanel,
  OutputPanel,
  PresetPanel,
} from "./studio-panels";
import { useNow, useShowController } from "./use-show-controller";
import {
  StudioAuthorityNotice,
  StudioVisibilityNotice,
} from "./studio-notices";
import { canIssueDirectorAction } from "./studio-controls";

const StageCanvas = dynamic(() => import("@/stage/stage-canvas"), {
  ssr: false,
  loading: () => (
    <div className="stage-loading">
      <span className="spin">✦</span>
      <span>Lighting the stage…</span>
    </div>
  ),
});
type Controller = ReturnType<typeof useShowController>;
type Panel =
  "invite" | "output" | "preset" | "evidence" | "devices" | "end" | null;
export function StudioClient({ showId }: { showId?: string }) {
  return showId ? <ConnectedStudio showId={showId} /> : <StudioLobby />;
}
function StudioLobby() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  useEffect(() => {
    let active = true;
    void getSession()
      .then((s) => {
        if (active) setSession(s);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <SiteHeader active="studio" />
      <main className="studio-lobby" id="main-content">
        <div className="lobby-heading">
          <p className="eyebrow">YOUR OWN LITTLE THEATER</p>
          <h1>
            Shall we make
            <br />
            <em>something happen?</em>
          </h1>
          <p>
            Start with an illustrated rehearsal, or bring two real cameras onto
            the stage.
          </p>
        </div>
        <div className="lobby-options">
          <article className="lobby-rehearsal">
            <div className="lobby-poster">
              <TheaterPoster compact />
            </div>
            <div className="lobby-option-copy">
              <span className="eyebrow">EXPLORE AT YOUR OWN PACE</span>
              <h2>A little dress rehearsal.</h2>
              <p>
                Try the whole story with original test plates. Cue the rain,
                pass the umbrella, meet Pip, and save your own version.
              </p>
              <NewShowButton className="button button-ink">
                Start a rehearsal
              </NewShowButton>
              <span className="lobby-small">
                Synthetic scenery and test ballots. No camera or Twitch
                permission needed.
              </span>
            </div>
          </article>
          <article className="lobby-live">
            <div className="live-arch-icon">
              <Radio size={34} strokeWidth={1.2} />
              <span aria-hidden="true">✦</span>
            </div>
            <span className="eyebrow">BRING A FRIEND & YOUR COMMUNITY</span>
            <h2>The real thing.</h2>
            <p>
              Two consenting performers, one director, a Twitch channel, and a
              clean Program for OBS.
            </p>
            {session?.hostAllowed && session.services.mediaConfigured ? (
              <NewShowButton mode="live" className="button button-gold">
                Create a live show
              </NewShowButton>
            ) : session?.hostAllowed ? (
              <Link className="button button-dark" href="/guide#program">
                Read the live setup guide <ArrowRight size={17} />
              </Link>
            ) : (
              <a className="button button-dark" href="/api/auth/twitch/login">
                Connect your Twitch account <ArrowUpRight size={17} />
              </a>
            )}
            {session && !session.services.mediaConfigured ? (
              <p className="lobby-small" role="status">
                <strong>Live media setup is unavailable.</strong> Try the full
                public rehearsal while live media is prepared. Twitch account
                setup remains available.
              </p>
            ) : null}
            {session?.authenticated && !session.hostAllowed ? (
              <p className="lobby-small">
                You’re signed in as {session.displayName}. Live hosting is
                currently available to approved hosts. Rehearsal is open to
                everyone.
              </p>
            ) : (
              <span className="lobby-small">
                Broadcast setup stays backstage until you open the curtain.
              </span>
            )}
            <Link className="text-link" href="/guide">
              What you’ll need <ArrowRight size={15} />
            </Link>
          </article>
        </div>
        {session?.currentShowId ? (
          <Link
            href={`/studio?show=${encodeURIComponent(session.currentShowId)}`}
            className="resume-show-link"
          >
            <RotateCcw size={16} /> Return to your most recent stage{" "}
            <ArrowRight size={16} />
          </Link>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
function ConnectedStudio({ showId }: { showId: string }) {
  const controller = useShowController(showId),
    { envelope, error } = controller;
  if (!envelope)
    return error ? (
      <EmptyRoom title="We couldn’t open this room.">{error}</EmptyRoom>
    ) : (
      <LoadingScreen />
    );
  if (envelope.role !== "director")
    return (
      <EmptyRoom title="Your place is backstage.">
        <span>This studio belongs to the director. </span>
        <Link
          className="underlined-link"
          href={`/backstage?show=${encodeURIComponent(showId)}`}
        >
          Open your backstage controls <ArrowRight size={16} />
        </Link>
      </EmptyRoom>
    );
  return <StudioWorkspace controller={controller} envelope={envelope} />;
}
function StudioWorkspace({
  controller,
  envelope,
}: {
  controller: Controller;
  envelope: ShowEnvelope;
}) {
  const { show } = envelope,
    {
      run: act,
      busy,
      error,
      setError,
      rendererId,
      serverOffset,
      refresh,
    } = controller;
  const [panel, setPanel] = useState<Panel>(null),
    [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null),
    [forceCurtain, setForceCurtain] = useState(false),
    [hint, setHint] = useState(""),
    [health, setHealth] = useState({
      fps: 0,
      width: 1920,
      height: 1080,
      webgl: true,
    }),
    [calibration, setCalibration] = useState<GestureCalibration | null>(null),
    [gestureArmed, setGestureArmed] = useState(false),
    [chatEnabled, setChatEnabled] = useState(false),
    [chatMessage, setChatMessage] = useState(""),
    [localTest, setLocalTest] = useState(false),
    [localHost, setLocalHost] = useState(false);
  const panicGeneration = useRef(0);
  const now = useNow(),
    leaseValid =
      controller.leaseStatus === "active" &&
      show.renderLease.clientId === rendererId &&
      show.renderLease.epoch === show.epoch &&
      !show.renderLease.releasedAt &&
      show.renderLease.expiresAt > now + serverOffset,
    isRehearsal = show.mode === "rehearsal",
    solo = isRehearsal && show.transport !== "livekit";
  const canOffer =
    leaseValid &&
    show.phase === "live" &&
    (solo || show.umbrella.owner === "A") &&
    !["offered", "accepted"].includes(show.umbrella.transfer?.status || "") &&
    (["A", "B"] as Slot[]).every((slot) => {
      const p = show.participants[slot];
      return (
        p.ready && p.admitted && p.connected && p.camera && p.consentBroadcast
      );
    });
  const onPresence = useCallback(
    (presence: { connected: boolean; camera: boolean; microphone: boolean }) =>
      solo && !localTest
        ? Promise.resolve(null)
        : act({ type: "presence", ...presence, slot: "A" }, true),
    [act, solo, localTest],
  );
  const media = useMediaRoom({
    show: forceCurtain ? { ...show, phase: "hold" } : show,
    role: "director",
    slot: "A",
    rendererId,
    rendererIncarnationId: controller.rendererIncarnationId,
    rendererIncarnationSequence: controller.rendererIncarnationSequence,
    epoch: show.epoch,
    serverNow: envelope.serverNow,
    onPresence,
    onStateHint: setHint,
    allowSyntheticMedia: localTest,
  });
  useEffect(() => {
    setLocalHost(
      ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname),
    );
  }, []);
  const run = useCallback(
    async (action: ShowAction) => {
      if (!canIssueDirectorAction(action, leaseValid)) {
        setError(
          "This director window does not control the stage. Recover the current stage before sending a cue.",
        );
        return null;
      }
      const generation = panicGeneration.current;
      const result = await act(action);
      if (
        result &&
        generation === panicGeneration.current &&
        (action.type === "resume" ||
          action.type === "start" ||
          action.type === "reset")
      )
        setForceCurtain(false);
      return result;
    },
    [act, leaseValid, setError],
  );
  const offer = useCallback(() => run({ type: "offer", from: "A" }), [run]);
  const accept = useCallback(() => {
    const transfer = show.umbrella.transfer;
    return leaseValid && transfer?.status === "offered" && transfer.to === "A"
      ? run({ type: "accept", transferId: transfer.id, slot: "A" })
      : Promise.resolve(null);
  }, [run, show.umbrella.transfer, leaseValid]);
  const onAnchor = useCallback(
    (anchor: { x: number; y: number }) => media.sendAnchor(anchor),
    [media.sendAnchor],
  );
  const gesture = useGestureInput(media.localPreview, {
    armed: gestureArmed && show.phase === "live" && leaseValid,
    calibration,
    slot: "A",
    owner: show.umbrella.owner,
    expectedReceiver:
      show.umbrella.transfer?.status === "offered"
        ? show.umbrella.transfer.to
        : null,
    offerId:
      show.umbrella.transfer?.status === "offered"
        ? show.umbrella.transfer.id
        : null,
    canOffer: canOffer && !busy,
    onOffer: offer,
    onAccept: accept,
    onAnchor,
  });
  const authority = useRef({
    rendererId,
    epoch: show.epoch,
    incarnationId: controller.rendererIncarnationId,
    incarnationSequence: controller.rendererIncarnationSequence,
  });
  useEffect(() => {
    authority.current = {
      rendererId,
      epoch: show.epoch,
      incarnationId: controller.rendererIncarnationId,
      incarnationSequence: controller.rendererIncarnationSequence,
    };
  }, [
    rendererId,
    show.epoch,
    controller.rendererIncarnationId,
    controller.rendererIncarnationSequence,
  ]);
  useEffect(() => {
    if (!chatEnabled || !leaseValid || isRehearsal || show.phase === "ended")
      return;
    const connector = new TwitchConnector(
      show.id,
      (_state, message) => setChatMessage(message),
      () => {
        void refresh();
      },
      () => authority.current,
    );
    connector.start();
    return () => connector.stop();
  }, [
    chatEnabled,
    leaseValid,
    isRehearsal,
    show.id,
    show.phase === "ended",
    refresh,
  ]);
  const canPublish =
    !!canvas &&
    leaseValid &&
    media.connected &&
    show.phase !== "ended" &&
    (!isRehearsal || localTest);
  useEffect(() => {
    if (canPublish && canvas)
      void media.publishProgram(canvas).catch(() => undefined);
    else void media.stopProgram();
    return () => {
      void media.stopProgram();
    };
  }, [canvas, canPublish, media.publishProgram, media.stopProgram]);
  const panic = useCallback(() => {
    panicGeneration.current += 1;
    setForceCurtain(true);
    setGestureArmed(false);
    void run({ type: "panic" });
  }, [run]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (show.phase === "ended") return;
      const target = e.target as HTMLElement;
      if (document.querySelector("dialog[open]")) return;
      if (e.code === "Escape") {
        e.preventDefault();
        panic();
        return;
      }
      if (
        target.closest("input,textarea,select,button,a,[contenteditable=true]")
      )
        return;
      if (e.code === "Space" && !e.repeat && !busy && leaseValid) {
        const cue = nextCue(show);
        if (cue.act) {
          e.preventDefault();
          void run(cue.act);
        }
      } else if (
        e.key.toLowerCase() === "o" &&
        !e.repeat &&
        !busy &&
        canOffer
      ) {
        e.preventDefault();
        void run({ type: "offer", from: solo ? show.umbrella.owner : "A" });
      } else if (
        e.key.toLowerCase() === "a" &&
        !e.repeat &&
        !busy &&
        leaseValid &&
        show.umbrella.transfer?.status === "offered"
      ) {
        const t = show.umbrella.transfer;
        if (solo || t.to === "A") {
          e.preventDefault();
          void run({
            type: "accept",
            transferId: t.id,
            slot: solo ? t.to : "A",
          });
        }
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [show, busy, isRehearsal, solo, leaseValid, canOffer, panic, run]);
  const arrive = useCallback(
    async (transferId: string) =>
      Boolean(await act({ type: "arrive", transferId }, true)),
    [act],
  );
  const transfer = show.umbrella.transfer,
    currentOffer = transfer?.status === "offered",
    liveReady = ["A", "B"].every(
      (s) =>
        show.participants[s as Slot].ready &&
        show.participants[s as Slot].admitted,
    );
  return (
    <div className="studio-shell">
      <header className="studio-header">
        <div className="studio-header-left">
          <Wordmark light />
          <span className="header-divider" />
          <Link className="desk-label" href="/studio">
            THE DIRECTOR’S DESK
          </Link>
        </div>
        <div className="studio-header-right">
          <StatusPill
            tone={
              isRehearsal ? "gold" : show.phase === "live" ? "coral" : "muted"
            }
            pulse={show.phase === "live"}
          >
            {isRehearsal
              ? show.phase === "ended"
                ? "Show ended"
                : "Rehearsal"
              : show.phase === "live"
                ? "On stage"
                : show.phase === "ended"
                  ? "Show ended"
                  : "Backstage"}
          </StatusPill>
          <Link href="/guide" className="studio-guide-link">
            <CircleHelp size={17} />
            <span>Field guide</span>
          </Link>
          <button
            className="icon-button"
            onClick={() => setPanel("preset")}
            aria-label="Edit your show preset"
          >
            <Settings2 size={18} />
          </button>
        </div>
      </header>
      <main id="main-content" className="studio-main">
        <div className="studio-title-row">
          <div>
            <div className="show-breadcrumb">
              <Link href="/studio">YOUR THEATER</Link>
              <span>/</span>
              <span>EPISODE 001</span>
            </div>
            <h1>
              {show.preset.episodeTitle}
              <span className="title-spark" aria-hidden="true">
                ✦
              </span>
            </h1>
            <p>
              {isRehearsal
                ? solo
                  ? "A private dress rehearsal. Play both parts. Create a live show to invite a performer."
                  : "Synthetic media transport test. Each performer controls their own entrance."
                : "Two rooms. One scene. Leave a little room for the unexpected."}
            </p>
          </div>
          <div className="studio-title-actions">
            <button
              className="button button-dark"
              disabled={
                show.phase === "ended" ||
                (isRehearsal && !(localHost && localTest))
              }
              title={
                isRehearsal && !(localHost && localTest)
                  ? "Create a live show to invite a performer"
                  : "Invite a performer backstage"
              }
              onClick={() => setPanel("invite")}
            >
              <Users size={16} />
              <span>Invite a performer</span>
            </button>
            <button
              className="button button-gold"
              onClick={() => setPanel("output")}
              disabled={show.phase === "ended"}
            >
              <Monitor size={16} />
              <span>
                {isRehearsal && !localTest ? "Scene preview" : "Program output"}
              </span>
              <ExternalLink size={14} />
            </button>
          </div>
        </div>
        {error ? (
          <ErrorNotice onDismiss={() => setError("")}>{error}</ErrorNotice>
        ) : null}
        <StudioAuthorityNotice
          phase={show.phase}
          leaseValid={leaseValid}
          status={controller.leaseStatus}
          error={controller.leaseError}
          recovery={controller.leaseRecovery}
          onTakeover={() => void controller.claimLease(true)}
        />
        <StudioVisibilityNotice
          hidden={controller.documentHidden}
          phase={show.phase}
        />
        <div className="studio-grid">
          <aside className="studio-sidebar">
            <section className="cast-panel">
              <div className="panel-eyebrow">
                <span>IN THE WINGS</span>
                <Users size={14} />
              </div>
              {(["A", "B"] as Slot[]).map((slot) => {
                const p = show.participants[slot];
                return (
                  <article className="cast-member" key={slot}>
                    <div className={`cast-avatar avatar-${slot.toLowerCase()}`}>
                      <span>{slot}</span>
                      <i className={p.connected ? "connected-dot" : ""} />
                    </div>
                    <div className="cast-member-info">
                      <strong>
                        {isRehearsal
                          ? `Test performer ${slot}`
                          : p.name ||
                            (slot === "A" ? "You, the host" : "Your guest")}
                      </strong>
                      <span>
                        {isRehearsal
                          ? "Original illustrated plate"
                          : p.admitted
                            ? "Admitted to Program"
                            : p.ready
                              ? "Ready · awaiting admission"
                              : p.joined
                                ? "Preparing backstage"
                                : "An empty place, for now"}
                      </span>
                      <div className="cast-device-status">
                        <Camera
                          size={12}
                          className={p.camera ? "is-ready" : ""}
                        />
                        <Mic
                          size={12}
                          className={p.microphone ? "is-ready" : ""}
                        />
                        <span>{p.ready ? "Ready" : "Not ready"}</span>
                        {p.admitted ? (
                          <Check size={12} className="is-ready" />
                        ) : null}
                      </div>
                    </div>
                    {(!isRehearsal || localTest) && p.ready ? (
                      <button
                        className="icon-button cast-admit"
                        aria-label={
                          p.admitted
                            ? `Hide performer ${slot}`
                            : `Admit performer ${slot}`
                        }
                        title={
                          p.admitted ? "Hide from Program" : "Admit to Program"
                        }
                        disabled={busy || (!p.admitted && !leaseValid)}
                        onClick={() =>
                          void run({
                            type: p.admitted ? "hide" : "admit",
                            slot,
                          })
                        }
                      >
                        {p.admitted ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    ) : null}
                  </article>
                );
              })}
              {isRehearsal && !localTest ? (
                <p className="panel-footnote">
                  These are synthetic camera plates. They let you rehearse the
                  story without opening a camera.
                </p>
              ) : (
                <>
                  <button
                    className="button button-dark button-small full-width"
                    onClick={() => setPanel("devices")}
                    disabled={show.phase === "ended"}
                  >
                    <Camera size={15} /> Your camera & consent
                  </button>
                  {(!isRehearsal || localTest) &&
                  show.participants.A.connected &&
                  !show.participants.A.ready ? (
                    <button
                      className="button button-teal button-small full-width"
                      disabled={
                        busy ||
                        !leaseValid ||
                        !show.participants.A.calibrated ||
                        !show.participants.A.consentBroadcast
                      }
                      onClick={() =>
                        void run({ type: "ready", ready: true, slot: "A" })
                      }
                    >
                      Mark yourself ready <Check size={15} />
                    </button>
                  ) : null}
                </>
              )}
            </section>
            <section className="connections-panel">
              <div className="panel-eyebrow">
                <span>THE STAGE DOOR</span>
                <Link2 size={14} />
              </div>
              <div className="connection-item">
                <span
                  className={`connection-indicator ${media.connected ? "connected" : ""}`}
                />
                <span>Camera room</span>
                <strong>
                  {isRehearsal && !localTest
                    ? "Test plates"
                    : media.connected
                      ? media.quality === "poor"
                        ? "Poor connection"
                        : "Connected"
                      : "Not connected"}
                </strong>
              </div>
              <div className="connection-item">
                <span
                  className={`connection-indicator ${show.twitch.connected ? "connected" : ""}`}
                />
                <span>Twitch chat</span>
                <strong>
                  {isRehearsal
                    ? "Test ballots"
                    : show.twitch.connected
                      ? "Listening"
                      : "Not connected"}
                </strong>
              </div>
              <div className="connection-item">
                <span
                  className={`connection-indicator ${media.programPublishing || isRehearsal ? "connected" : ""}`}
                />
                <span>Program</span>
                <strong>
                  {isRehearsal && !localTest
                    ? "Local rehearsal"
                    : media.programPublishing
                      ? "Publishing"
                      : "Not publishing"}
                </strong>
              </div>
              {!isRehearsal ? (
                <>
                  <button
                    className="button button-dark button-small full-width"
                    disabled={!leaseValid || show.phase === "ended"}
                    onClick={() => setChatEnabled((v) => !v)}
                  >
                    <Radio size={15} />
                    {chatEnabled ? "Disconnect chat" : "Connect Twitch chat"}
                  </button>
                  {chatMessage ? (
                    <p className="panel-footnote" role="status">
                      {chatMessage}
                    </p>
                  ) : null}
                </>
              ) : null}
            </section>
            <div className="sidebar-postcard">
              <span aria-hidden="true">✦</span>
              <p>
                “The best part is
                <br />
                what you didn’t plan.”
              </p>
              <small>A NOTE FROM THE WINGS</small>
            </div>
          </aside>
          <section className="stage-workspace" aria-label="The canonical stage">
            <div className="stage-monitor">
              <div className="monitor-topbar">
                <span>
                  <span
                    className={`monitor-status-dot ${show.phase === "live" ? "is-live" : ""}`}
                  />
                  {isRehearsal ? "REHEARSAL STAGE" : "CANONICAL PROGRAM"}
                </span>
                <span>
                  1920 × 1080 <i /> 16:9
                </span>
              </div>
              {leaseValid || show.phase === "ended" ? (
                <StageCanvas
                  show={show}
                  videoA={!isRehearsal || localTest ? media.videos.A : null}
                  videoB={!isRehearsal || localTest ? media.videos.B : null}
                  serverOffset={serverOffset}
                  anchors={media.anchors}
                  forceCurtain={forceCurtain}
                  onCanvas={setCanvas}
                  onArrive={arrive}
                  onRenderHealth={setHealth}
                />
              ) : (
                <div className="stage-awaiting-authority">
                  <ShieldCheck size={34} />
                  <h2>One stage. One director.</h2>
                  <p>This studio is waiting for its render lease.</p>
                </div>
              )}
              <div className="monitor-bottom">
                <span>
                  <Headphones size={13} />
                  {isRehearsal
                    ? "Synthetic rehearsal · no live cameras or audience"
                    : "Director preview · headphone monitoring"}
                </span>
                <span className={health.fps ? "render-health" : ""}>
                  {health.fps ? `${health.fps} fps` : "WebGL"}
                  <span className="render-health-dot" />
                </span>
              </div>
            </div>
            <div className="story-progress" aria-label="Story progress">
              {[
                {
                  icon: Clapperboard,
                  title: "Open",
                  done: show.phase !== "backstage",
                },
                { icon: CloudRain, title: "Weather", done: !!show.weather },
                {
                  icon: Umbrella,
                  title: "Cross",
                  done: show.events.some(
                    (e) =>
                      e.type === "action.accept" &&
                      e.propId === show.umbrella.id,
                  ),
                },
                {
                  icon: Sparkles,
                  title: show.preset.creatureName,
                  done: show.creature.hatched,
                },
                {
                  icon: Users,
                  title: "Shelter",
                  done: show.beat === "shelter",
                },
              ].map((step, i) => (
                <div className={step.done ? "step-done" : ""} key={step.title}>
                  <span className="story-step-icon">
                    {step.done ? <Check size={13} /> : <step.icon size={14} />}
                  </span>
                  <span>{step.title}</span>
                  {i < 4 ? <i /> : null}
                </div>
              ))}
            </div>
            <section className="prop-card">
              <div className="prop-emblem">
                <Umbrella size={29} strokeWidth={1.3} />
                <span className="prop-patch" />
              </div>
              <div className="prop-card-copy">
                <span className="panel-eyebrow">THE SAME LITTLE UMBRELLA</span>
                <h3>
                  {currentOffer
                    ? `Offered to performer ${transfer.to}`
                    : transfer?.status === "accepted"
                      ? "The patched umbrella is crossing."
                      : `In performer ${show.umbrella.owner}’s care.`}
                </h3>
                <p>
                  <span className="coral-swatch" />
                  Coral repair patch <span>·</span>{" "}
                  {Math.round(show.umbrella.wetness * 100)}% wet <span>·</span>{" "}
                  v{show.umbrella.version}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setPanel("evidence")}
                aria-label="Inspect persistent prop state"
              >
                <CodeXml size={20} />
              </button>
            </section>
            <div className="performer-button-row">
              <button
                className="button button-dark"
                disabled={busy || !canOffer}
                onClick={() =>
                  void run({
                    type: "offer",
                    from: solo ? show.umbrella.owner : "A",
                  })
                }
              >
                <Hand size={16} /> Offer umbrella <kbd>O</kbd>
              </button>
              <button
                className="button button-dark"
                disabled={
                  busy ||
                  !leaseValid ||
                  !currentOffer ||
                  (!solo && transfer.to !== "A")
                }
                onClick={() => {
                  if (transfer)
                    void run({
                      type: "accept",
                      transferId: transfer.id,
                      slot: solo ? transfer.to : "A",
                    });
                }}
              >
                <Check size={16} /> Accept <kbd>A</kbd>
              </button>
              {currentOffer ? (
                <button
                  className="button button-text"
                  disabled={busy || !leaseValid}
                  onClick={() => {
                    if (transfer)
                      void run({
                        type:
                          !solo && transfer.to === "A"
                            ? "decline"
                            : "cancel-offer",
                        transferId: transfer.id,
                        slot: solo ? transfer.from : "A",
                      });
                  }}
                >
                  Cancel offer
                </button>
              ) : (
                <button
                  className="button button-text"
                  onClick={() => setPanel("preset")}
                >
                  <WandSparkles size={15} /> Make it yours
                </button>
              )}
            </div>
            {isRehearsal ? (
              <div className="rehearsal-truth">
                <ShieldCheck size={16} />
                <p>
                  Practice the mechanics here. Real remote cameras, audience
                  input, and latency need a live run.
                </p>
              </div>
            ) : null}
          </section>
          <aside className="cue-sidebar">
            <CueDeck
              show={show}
              busy={busy}
              run={run}
              locked={!leaseValid || (show.phase === "backstage" && !liveReady)}
            />
            <AudienceChoice
              show={show}
              busy={busy}
              run={run}
              serverOffset={serverOffset}
              locked={!leaseValid}
            />
          </aside>
        </div>
        <div className="stage-safety-bar">
          <div className="safety-bar-left">
            <button
              onClick={() =>
                void run({ type: show.phase === "hold" ? "resume" : "hold" })
              }
              disabled={
                busy || show.phase === "ended" || show.phase === "backstage"
              }
            >
              {show.phase === "hold" ? <Play size={16} /> : <Pause size={16} />}{" "}
              {show.phase === "hold" ? "Resume stage" : "Hold stage"}
            </button>
            <button
              onClick={() => void run({ type: "recall", to: "A" })}
              disabled={busy || !leaseValid || show.phase === "ended"}
            >
              <RotateCcw size={15} /> Return umbrella
            </button>
            <button
              onClick={() => void run({ type: "hide", slot: "B" })}
              disabled={busy || !show.participants.B.admitted}
            >
              <EyeOff size={15} /> Hide guest
            </button>
          </div>
          <div className="safety-bar-right">
            <button
              className="curtain-safety"
              onClick={panic}
              disabled={show.phase === "ended"}
            >
              <ShieldCheck size={15} /> Close curtain <kbd>Esc</kbd>
            </button>
            <button
              className="end-show-button"
              onClick={() => setPanel("end")}
              disabled={show.phase === "ended"}
            >
              <Square size={12} /> End show
            </button>
          </div>
        </div>
        <div className="studio-bottom-note">
          <span>PORTAL STAGE · A LITTLE THEATER BETWEEN ROOMS</span>
          <button onClick={() => setPanel("evidence")}>
            Sequence {show.sequence} <span>·</span> Inspect the record{" "}
            <ArrowUpRight size={13} />
          </button>
        </div>
        {localHost && isRehearsal && show.phase !== "ended" ? (
          <details className="transport-test-panel">
            <summary>
              Local transport testing · synthetic media only{" "}
              <ChevronDown size={14} />
            </summary>
            <p>
              This development-only check sends moving test plates through
              WebRTC. It does not use real cameras or prove remote performance.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={localTest}
                onChange={async (e) => {
                  if (e.target.checked) {
                    setLocalTest(true);
                    if (show.phase === "live") await run({ type: "hold" });
                  } else {
                    setLocalTest(false);
                    await media.disconnect();
                    await run({ type: "restore-rehearsal" });
                  }
                }}
              />
              <span>Enable the local synthetic transport test</span>
            </label>
            {localTest ? (
              <div className="transport-test-actions">
                <button
                  className="button button-dark"
                  onClick={() => {
                    void media.enableTestCamera().catch(() => undefined);
                  }}
                >
                  Enable labeled test camera
                </button>
                <button
                  className="button button-dark"
                  onClick={() => {
                    void media.connect().catch(() => undefined);
                  }}
                >
                  Connect test room
                </button>
                <button
                  className="button button-dark"
                  onClick={() => {
                    void media.disconnect();
                  }}
                >
                  Disconnect
                </button>
                <span>
                  {media.status} · Program {media.programStatus}
                </span>
              </div>
            ) : null}
            {localTest ? (
              <section aria-label="Local transport diagnostic">
                <p className="field-help">
                  LOCAL TRANSPORT DIAGNOSTIC · CANONICAL DECODER
                </p>
                <LocalVideoDiagnostics video={media.localPreview} />
              </section>
            ) : null}
          </details>
        ) : null}
        {hint ? (
          <p className="media-hint" role="status">
            {hint}
          </p>
        ) : null}
        {media.audioBlocked || media.videoBlocked ? (
          <button
            className="audio-unlock button button-teal"
            onClick={() => {
              void media.startAudio();
            }}
          >
            <Headphones size={17} />{" "}
            {media.videoBlocked ? "Enable playback" : "Enable room audio"}
          </button>
        ) : null}
      </main>
      <InvitePanel
        show={show}
        open={panel === "invite" && show.phase !== "ended"}
        onClose={() => setPanel(null)}
        onChanged={() => void refresh()}
      />
      <OutputPanel
        show={show}
        open={panel === "output" && show.phase !== "ended"}
        onClose={() => setPanel(null)}
        publishing={media.programPublishing}
        transportTesting={localHost && localTest}
        onChanged={() => void refresh()}
      />
      <EvidencePanel
        show={show}
        open={panel === "evidence"}
        onClose={() => setPanel(null)}
      />
      <PresetPanel
        show={show}
        open={panel === "preset"}
        onClose={() => setPanel(null)}
        run={run}
        busy={busy || !leaseValid}
      />
      <Modal
        open={panel === "devices" && show.phase !== "ended"}
        onClose={() => setPanel(null)}
        title="Find your place in the frame."
        eyebrow="HOST CAMERA & CONSENT"
      >
        <DeviceSetup
          show={show}
          slot="A"
          media={media}
          run={run}
          busy={busy}
          onCalibrated={setCalibration}
          cueCalibration={gesture.enabled ? calibration : null}
        />
        <div className="gesture-settings">
          <div>
            <Hand size={18} />
            <strong>Optional on-device hand cues</strong>
          </div>
          <p>
            Open palm to offer or accept after calibration. Every cue also has a
            button.
          </p>
          <button
            className="button button-dark full-width"
            disabled={!calibration || !media.localPreview}
            onClick={() => {
              if (gesture.enabled) {
                gesture.disable();
                setGestureArmed(false);
              } else void gesture.enable();
            }}
          >
            {gesture.enabled ? "Turn hand cues off" : "Enable hand cues"}
          </button>
          {gesture.enabled ? (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={gestureArmed}
                onChange={(e) => setGestureArmed(e.target.checked)}
              />
              <span>Arm deliberate hand cues</span>
            </label>
          ) : null}
          <span className="field-help">{gesture.status}</span>
          <div className="gesture-progress">
            <span style={{ width: `${gesture.dwellProgress * 100}%` }} />
          </div>
          {gesture.error ? (
            <span className="panel-error">{gesture.error}</span>
          ) : null}
        </div>
      </Modal>
      <Modal
        open={panel === "end"}
        onClose={() => setPanel(null)}
        title="Take a bow?"
        eyebrow="END THIS SHOW"
      >
        <p className="dialog-copy">
          The curtain closes, new cues stop, and Program publishing ends. Your
          saved version and stage record stay with the show.
        </p>
        <div className="dialog-actions">
          <button className="button button-dark" onClick={() => setPanel(null)}>
            Stay on stage
          </button>
          <button
            className="button button-gold"
            disabled={busy}
            onClick={async () => {
              const result = await run({ type: "end" });
              if (result) {
                setChatEnabled(false);
                void media.disconnect();
                setPanel(null);
              }
            }}
          >
            End the show <ArrowRight size={16} />
          </button>
        </div>
      </Modal>
    </div>
  );
}
