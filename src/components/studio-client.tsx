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
  Monitor,
  Pause,
  Package,
  Play,
  Radio,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Umbrella,
  Users,
} from "lucide-react";
import type {
  EpisodeId,
  Point,
  ShowAction,
  ShowEnvelope,
  Slot,
} from "@/lib/contracts";
import { isAudienceRoom, isStageReady, propLabel } from "@/lib/show-grammar";
import { getSession } from "@/lib/client";
import type { SessionInfo } from "@/lib/contracts";
import {
  TwitchConnector,
  type ClientState as TwitchClientState,
} from "@/lib/twitch-client";
import { useMediaRoom } from "@/media/use-media-room";
import { useLocalRehearsalCamera } from "@/media/use-local-rehearsal-camera";
import { LocalVideoDiagnostics } from "@/media/local-video-diagnostics";
import { type GestureCalibration } from "@/vision/calibration";
import { useGestureInput } from "@/vision/use-gesture-input";
import { Wordmark, SiteHeader, SiteFooter } from "./brand";
import { TheaterPoster } from "./theater-poster";
import { ParcelPoster } from "./parcel-poster";
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
  StudioChatStatus,
  StudioChatWarning,
  StudioMediaHint,
  StudioVisibilityNotice,
  chatToggleAction,
} from "./studio-notices";
import { canIssueDirectorAction } from "./studio-controls";
import { RehearsalCameraControls } from "./rehearsal-camera-controls";

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
  | "invite"
  | "output"
  | "preset"
  | "evidence"
  | "devices"
  | "rehearsal-camera"
  | "end"
  | null;
export function StudioClient({ showId }: { showId?: string }) {
  return showId ? <ConnectedStudio showId={showId} /> : <StudioLobby />;
}
function StudioLobby() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [episode, setEpisode] = useState<EpisodeId>("borrowed-weather");
  useEffect(() => {
    let active = true;
    void getSession()
      .then((value) => {
        if (active) setSession(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const soloReady =
    session?.soloAllowed &&
    session.services.mediaConfigured &&
    session.soloUsage?.available !== false;
  return (
    <>
      <SiteHeader active="studio" />
      <main className="studio-lobby" id="main-content">
        <div className="lobby-heading">
          <h1>Studio</h1>
        </div>
        <section className="lobby-episodes" aria-labelledby="episode-heading">
          <h2 id="episode-heading">Episode</h2>
          <div
            className="episode-picker"
            role="group"
            aria-label="Choose your episode"
          >
            <button
              aria-pressed={episode === "borrowed-weather"}
              onClick={() => setEpisode("borrowed-weather")}
            >
              <div className="episode-art" aria-hidden="true">
                <TheaterPoster compact showLabel={false} />
              </div>
              <span>
                <strong>Borrowed Weather</strong>
                {episode === "borrowed-weather" ? (
                  <Check size={20} aria-hidden="true" />
                ) : (
                  <Umbrella size={20} aria-hidden="true" />
                )}
              </span>
            </button>
            <button
              aria-pressed={episode === "midnight-parcel"}
              onClick={() => setEpisode("midnight-parcel")}
            >
              <div className="episode-art" aria-hidden="true">
                <ParcelPoster />
              </div>
              <span>
                <strong>The Midnight Parcel</strong>
                {episode === "midnight-parcel" ? (
                  <Check size={20} aria-hidden="true" />
                ) : (
                  <Package size={20} aria-hidden="true" />
                )}
              </span>
            </button>
          </div>
        </section>
        <section className="lobby-modes" aria-labelledby="mode-heading">
          <h2 id="mode-heading">Mode</h2>
          <div className="lobby-options">
            <article className="mode-card">
              <Clapperboard size={28} strokeWidth={1.4} aria-hidden="true" />
              <h3>Rehearse</h3>
              <NewShowButton episode={episode} className="button button-ink">
                Start rehearsal
              </NewShowButton>
            </article>
            <article className="mode-card">
              <Radio size={28} strokeWidth={1.4} aria-hidden="true" />
              <h3>Solo with chat</h3>
              {soloReady ? (
                <NewShowButton
                  mode="solo"
                  episode={episode}
                  className="button button-ink"
                >
                  Start solo show
                </NewShowButton>
              ) : session?.authenticated ? (
                <button
                  className="button button-ink"
                  disabled
                  title={
                    session.soloUsage?.reason ||
                    "Solo hosting is unavailable for this account."
                  }
                >
                  Solo unavailable
                </button>
              ) : (
                <a className="button button-ink" href="/api/auth/twitch/login">
                  Sign in with Twitch{" "}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              )}
              {session?.authenticated && session.soloUsage ? (
                <StatusPill
                  title={
                    session.soloUsage.reason ||
                    `${session.soloUsage.minutes} minutes per show`
                  }
                >
                  {session.soloUsage.remaining} left today
                </StatusPill>
              ) : null}
            </article>
            <DuetModeCard session={session} episode={episode} />
          </div>
        </section>
        {session?.currentShowId ? (
          <Link
            href={`/studio?show=${encodeURIComponent(session.currentShowId)}`}
            className="resume-show-link"
          >
            <RotateCcw size={16} /> Resume show <ArrowRight size={16} />
          </Link>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
/** Duet hosting is invite-only; uninvited accounts see why instead of a dead end. */
export function DuetModeCard({
  session,
  episode,
}: {
  session: SessionInfo | null;
  episode: EpisodeId;
}) {
  const invited = !!session?.hostAllowed;
  return (
    <article className="mode-card">
      <Users size={28} strokeWidth={1.4} aria-hidden="true" />
      <div className="mode-card-title">
        <h3>Duet</h3>
        {invited ? null : <StatusPill>Invite only</StatusPill>}
      </div>
      {invited && session?.services.mediaConfigured ? (
        <NewShowButton
          mode="live"
          episode={episode}
          className="button button-ink"
        >
          Start duet show
        </NewShowButton>
      ) : session?.authenticated ? (
        <button
          className="button button-ink"
          disabled
          title={
            invited
              ? "Live media is not configured for this deployment."
              : "Duet hosting is limited to invited hosts."
          }
        >
          Start duet show
        </button>
      ) : (
        <a className="button button-ink" href="/api/auth/twitch/login">
          Sign in with Twitch <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      )}
    </article>
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
    [chatAttempt, setChatAttempt] = useState(0),
    [chatState, setChatState] = useState<TwitchClientState>("disconnected"),
    [chatMessage, setChatMessage] = useState(""),
    [localTest, setLocalTest] = useState(false),
    [localHost, setLocalHost] = useState(false),
    [visibilityReminder, setVisibilityReminder] = useState(false),
    [localCameraConsent, setLocalCameraConsent] = useState(false),
    [localAnchor, setLocalAnchor] = useState<Point | null>(null);
  const panicGeneration = useRef(0);
  const stopGesture = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (controller.documentHidden) setVisibilityReminder(true);
  }, [controller.documentHidden]);
  const now = useNow(),
    leaseValid =
      controller.leaseStatus === "active" &&
      show.renderLease.clientId === rendererId &&
      show.renderLease.epoch === show.epoch &&
      !show.renderLease.releasedAt &&
      show.renderLease.expiresAt > now + serverOffset,
    isRehearsal = show.mode === "rehearsal",
    fixtureRehearsal = isRehearsal && show.transport !== "livekit",
    isSoloShow = show.mode === "solo",
    isParcel = show.episode === "midnight-parcel",
    propName = propLabel(show);
  const canOffer =
    leaseValid &&
    show.phase === "live" &&
    (fixtureRehearsal || show.umbrella.owner === "A") &&
    !["offered", "accepted"].includes(show.umbrella.transfer?.status || "") &&
    (["A", "B"] as Slot[]).every((slot) => isStageReady(show, slot));
  const onPresence = useCallback(
    (presence: { connected: boolean; camera: boolean; microphone: boolean }) =>
      fixtureRehearsal && !localTest
        ? Promise.resolve(null)
        : act({ type: "presence", ...presence, slot: "A" }, true),
    [act, fixtureRehearsal, localTest],
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
  const localCamera = useLocalRehearsalCamera({
    showId: show.id,
    available: fixtureRehearsal && !localTest,
    ended: show.phase === "ended",
    consented: localCameraConsent && leaseValid,
  });
  useEffect(() => {
    setLocalHost(
      ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname),
    );
  }, []);
  const run = useCallback(
    async (action: ShowAction) => {
      if (action.type === "end" || action.type === "leave") {
        localCamera.disable();
        stopGesture.current?.();
        setLocalCameraConsent(false);
        setLocalAnchor(null);
        setGestureArmed(false);
      }
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
    [act, leaseValid, setError, localCamera.disable],
  );
  const offer = useCallback(() => run({ type: "offer", from: "A" }), [run]);
  const accept = useCallback(() => {
    const transfer = show.umbrella.transfer;
    return leaseValid && transfer?.status === "offered" && transfer.to === "A"
      ? run({ type: "accept", transferId: transfer.id, slot: "A" })
      : Promise.resolve(null);
  }, [run, show.umbrella.transfer, leaseValid]);
  const onAnchor = useCallback(
    (anchor: Point) => {
      if (fixtureRehearsal && !localTest) setLocalAnchor(anchor);
      else media.sendAnchor(anchor);
    },
    [media.sendAnchor, fixtureRehearsal, localTest],
  );
  const gesture = useGestureInput(
    fixtureRehearsal && !localTest ? localCamera.preview : media.localPreview,
    {
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
    },
  );
  stopGesture.current = gesture.disable;
  useEffect(() => {
    if (
      fixtureRehearsal &&
      !localTest &&
      (!localCamera.enabled || show.phase === "ended")
    ) {
      gesture.disable();
      setGestureArmed(false);
      setCalibration(null);
      setLocalAnchor(null);
    }
  }, [
    fixtureRehearsal,
    localTest,
    localCamera.enabled,
    show.phase === "ended",
    gesture.disable,
  ]);
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
      (state, message) => {
        setChatState(state);
        setChatMessage(message);
      },
      () => {
        void refresh();
      },
      () => authority.current,
    );
    connector.start();
    return () => connector.stop();
  }, [
    chatEnabled,
    chatAttempt,
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
        void run({
          type: "offer",
          from: fixtureRehearsal ? show.umbrella.owner : "A",
        });
      } else if (
        e.key.toLowerCase() === "a" &&
        !e.repeat &&
        !busy &&
        leaseValid &&
        show.umbrella.transfer?.status === "offered"
      ) {
        const t = show.umbrella.transfer;
        if (fixtureRehearsal || t.to === "A") {
          e.preventDefault();
          void run({
            type: "accept",
            transferId: t.id,
            slot: fixtureRehearsal ? t.to : "A",
          });
        }
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    show,
    busy,
    isRehearsal,
    fixtureRehearsal,
    leaseValid,
    canOffer,
    panic,
    run,
  ]);
  const arrive = useCallback(
    async (transferId: string) =>
      Boolean(await act({ type: "arrive", transferId }, true)),
    [act],
  );
  const transfer = show.umbrella.transfer,
    currentOffer = transfer?.status === "offered",
    liveReady = (["A", "B"] as Slot[]).every((slot) =>
      isStageReady(show, slot),
    ),
    soloRemaining = Math.max(
      0,
      (show.solo?.endsAt || 0) -
        (now ? now + serverOffset : envelope.serverNow),
    );
  return (
    <div className="studio-shell">
      <header className="studio-header">
        <div className="studio-header-left">
          <Wordmark light />
          <Link className="studio-home-link" href="/studio">
            Studio
          </Link>
        </div>
        <div className="studio-header-right">
          <Link
            href="/guide"
            className="icon-button"
            title="Field guide"
            aria-label="Field guide"
          >
            <CircleHelp size={20} />
          </Link>
          <button
            className="icon-button"
            onClick={() => setPanel("preset")}
            title="Customize"
            aria-label="Customize your show"
          >
            <Settings2 size={20} />
          </button>
        </div>
      </header>
      <main id="main-content" className="studio-main">
        <div className="studio-title-row">
          <h1>{show.preset.episodeTitle}</h1>
          <div className="studio-title-actions">
            {!isRehearsal ? (
              <StatusPill tone={show.phase === "live" ? "teal" : "muted"}>
                {`${isSoloShow ? "Solo · " : ""}${
                  show.phase === "ended"
                    ? "Ended"
                    : show.phase === "live"
                      ? "Live"
                      : show.phase === "hold"
                        ? "Held"
                        : "Backstage"
                }`}
              </StatusPill>
            ) : null}
            {isSoloShow && show.solo && show.phase !== "ended" ? (
              <StatusPill
                tone={soloRemaining <= 120_000 ? "gold" : "muted"}
                title="Reserved media time remaining"
              >{`${Math.floor(soloRemaining / 60_000)}:${String(Math.floor(soloRemaining / 1000) % 60).padStart(2, "0")}`}</StatusPill>
            ) : null}
            {!isSoloShow && (!isRehearsal || (localHost && localTest)) ? (
              <button
                className="icon-button"
                disabled={show.phase === "ended"}
                title="Invite a performer"
                aria-label="Invite a performer"
                onClick={() => setPanel("invite")}
              >
                <Users size={20} />
              </button>
            ) : null}
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
          wasHidden={visibilityReminder}
          onAcknowledge={() => setVisibilityReminder(false)}
        />
        {isSoloShow &&
        show.solo &&
        show.phase !== "ended" &&
        soloRemaining <= 120_000 ? (
          <div className="solo-session-warning" role="alert">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>Media time ending</span>
            <button
              className="button button-text"
              onClick={() => setPanel("end")}
            >
              End show
            </button>
          </div>
        ) : null}
        <div className="studio-grid">
          <aside className="studio-sidebar">
            <section className="cast-panel" aria-label="Performers">
              {(["A", "B"] as Slot[]).map((slot) => {
                const p = show.participants[slot];
                const audience = isAudienceRoom(show, slot);
                const name = audience
                  ? "Audience Room"
                  : isRehearsal
                    ? slot === "A" && localCamera.enabled
                      ? "You"
                      : isParcel
                        ? slot === "A"
                          ? "Midnight Post"
                          : "Receiving Room"
                        : slot === "A"
                          ? "Moon Garden"
                          : "Rooftop at Dusk"
                    : p.name || (slot === "A" ? "You" : "Guest");
                const status = audience
                  ? "Controlled by chat"
                  : p.admitted
                    ? "On stage"
                    : p.ready
                      ? "Ready for admission"
                      : p.joined
                        ? "Backstage"
                        : "Not connected";
                return (
                  <article className="cast-member" key={slot}>
                    <div
                      className={`cast-avatar avatar-${slot.toLowerCase()}`}
                      role="img"
                      title={status}
                      aria-label={`${name}: ${status}`}
                    >
                      {audience ? (
                        <Sparkles size={20} aria-hidden="true" />
                      ) : (
                        <span>{slot}</span>
                      )}
                      <i
                        className={
                          p.connected || audience ? "connected-dot" : ""
                        }
                      />
                    </div>
                    <div className="cast-member-info">
                      <strong>{name}</strong>
                    </div>
                    {!audience && (!isRehearsal || localTest) && p.ready ? (
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
              <button
                className="button button-dark button-small full-width"
                disabled={show.phase === "ended"}
                aria-label={
                  fixtureRehearsal && !localTest && !localCamera.enabled
                    ? "Try camera & hand cues in this browser"
                    : undefined
                }
                onClick={() =>
                  setPanel(
                    fixtureRehearsal && !localTest
                      ? "rehearsal-camera"
                      : "devices",
                  )
                }
              >
                <Camera size={16} aria-hidden="true" />
                <span>
                  {fixtureRehearsal && !localTest
                    ? "Camera & hand cues"
                    : "Your camera & consent"}
                </span>
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
                  <span>Mark ready</span>
                  <Check size={16} aria-hidden="true" />
                </button>
              ) : null}
              {!isRehearsal ? (
                <button
                  className="button button-text button-small full-width"
                  disabled={!leaseValid || show.phase === "ended"}
                  title={chatMessage || "Connect this director to Twitch chat"}
                  onClick={() => {
                    if (
                      chatToggleAction(chatEnabled, chatState) === "reconnect"
                    )
                      setChatAttempt((value) => value + 1);
                    else setChatEnabled((value) => !value);
                  }}
                >
                  <Radio size={16} aria-hidden="true" />
                  <span>
                    {
                      {
                        connect: "Connect Twitch",
                        reconnect: "Reconnect chat",
                        disconnect: "Disconnect chat",
                      }[chatToggleAction(chatEnabled, chatState)]
                    }
                  </span>
                </button>
              ) : null}
              <StudioChatWarning state={chatState} message={chatMessage} />
            </section>
          </aside>
          <section className="stage-workspace" aria-label="The canonical stage">
            <div className="stage-monitor">
              <div className="monitor-topbar">
                <div
                  className="stage-connections"
                  aria-label="Stage connections"
                >
                  <span
                    className="stage-connection"
                    role="img"
                    title={
                      fixtureRehearsal && !localTest
                        ? localCamera.enabled
                          ? "Camera: local preview"
                          : "Camera: illustrated rooms"
                        : media.connected
                          ? `Camera: ${media.quality === "poor" ? "poor connection" : "connected"}`
                          : "Camera: not connected"
                    }
                    aria-label={
                      fixtureRehearsal && !localTest
                        ? localCamera.enabled
                          ? "Local camera preview"
                          : "Illustrated rooms"
                        : media.connected
                          ? "Camera connected"
                          : "Camera not connected"
                    }
                  >
                    <Camera size={17} />
                    <span
                      className={`connection-indicator ${media.connected || localCamera.enabled ? "connected" : ""}`}
                    />
                  </span>
                  <StudioChatStatus
                    show={show}
                    enabled={chatEnabled}
                    leaseValid={leaseValid}
                    connection={chatState}
                  />
                  <span
                    className="stage-connection"
                    role="img"
                    title={
                      fixtureRehearsal && !localTest
                        ? "Program: scene preview"
                        : media.programPublishing
                          ? "Program: publishing"
                          : "Program: not publishing"
                    }
                    aria-label={
                      fixtureRehearsal && !localTest
                        ? "Scene preview"
                        : media.programPublishing
                          ? "Program publishing"
                          : "Program not publishing"
                    }
                  >
                    <Monitor size={17} />
                    <span
                      className={`connection-indicator ${media.programPublishing ? "connected" : ""}`}
                    />
                  </span>
                </div>
                <button
                  className="icon-button"
                  onClick={() => setPanel("output")}
                  disabled={show.phase === "ended"}
                  title={
                    fixtureRehearsal && !localTest
                      ? "Scene preview"
                      : "Program output"
                  }
                  aria-label={
                    fixtureRehearsal && !localTest
                      ? "Scene preview"
                      : "Program output"
                  }
                >
                  <ExternalLink size={18} />
                </button>
              </div>
              {leaseValid || show.phase === "ended" ? (
                <StageCanvas
                  show={show}
                  videoA={!isRehearsal || localTest ? media.videos.A : null}
                  videoB={
                    isSoloShow
                      ? null
                      : !isRehearsal || localTest
                        ? media.videos.B
                        : null
                  }
                  localPreviewA={
                    fixtureRehearsal && !localTest ? localCamera.preview : null
                  }
                  localAnchorA={
                    fixtureRehearsal && !localTest ? localAnchor : null
                  }
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
                  <h2>Stage unavailable</h2>
                </div>
              )}
            </div>
            <div className="story-progress" aria-label="Story progress">
              {[
                {
                  icon: Clapperboard,
                  title: "Open",
                  done: show.phase !== "backstage",
                },
                {
                  icon: isParcel ? Package : CloudRain,
                  title: isParcel ? "Contents" : "Weather",
                  done: isParcel ? !!show.parcel?.contents : !!show.weather,
                },
                {
                  icon: isParcel ? Package : Umbrella,
                  title: "Cross",
                  done: (show.umbrella.acceptedTransfers ?? 0) > 0,
                },
                {
                  icon: Sparkles,
                  title: isParcel ? "Unpack" : show.preset.creatureName,
                  done: isParcel
                    ? !!show.parcel?.opened
                    : show.creature.hatched,
                },
                {
                  icon: Users,
                  title: isParcel ? "Gift" : "Ending",
                  done: isParcel
                    ? show.beat === "delivery"
                    : show.beat === "shelter",
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
            <section className="prop-card" aria-label={`${propName} controls`}>
              <div className="prop-emblem" aria-hidden="true">
                {isParcel ? (
                  <Package size={28} strokeWidth={1.4} />
                ) : (
                  <Umbrella size={28} strokeWidth={1.4} />
                )}
                <span className="prop-patch" />
              </div>
              <div className="prop-card-copy">
                <h3>
                  With {show.umbrella.owner} ·{" "}
                  {show.parcel
                    ? show.parcel.stamped
                      ? "Stamped"
                      : "Unstamped"
                    : `${Math.round(show.umbrella.wetness * 100)}% wet`}
                </h3>
              </div>
              <div className="performer-button-row">
                <button
                  className="button button-dark"
                  disabled={busy || !canOffer}
                  onClick={() =>
                    void run({
                      type: "offer",
                      from: fixtureRehearsal ? show.umbrella.owner : "A",
                    })
                  }
                  title={`Offer the ${propName} (O)`}
                >
                  <Hand size={16} aria-hidden="true" />
                  <span>Offer</span>
                  <kbd aria-hidden="true">O</kbd>
                </button>
                <button
                  className="button button-dark"
                  disabled={
                    busy ||
                    !leaseValid ||
                    !currentOffer ||
                    (!fixtureRehearsal && transfer.to !== "A")
                  }
                  onClick={() => {
                    if (transfer)
                      void run({
                        type: "accept",
                        transferId: transfer.id,
                        slot: fixtureRehearsal ? transfer.to : "A",
                      });
                  }}
                  title="Accept the offer (A)"
                >
                  <Check size={16} aria-hidden="true" />
                  <span>Accept</span>
                  <kbd aria-hidden="true">A</kbd>
                </button>
                {currentOffer ? (
                  <button
                    className="button button-text"
                    disabled={busy || !leaseValid}
                    onClick={() => {
                      if (transfer)
                        void run({
                          type:
                            !fixtureRehearsal && transfer.to === "A"
                              ? "decline"
                              : "cancel-offer",
                          transferId: transfer.id,
                          slot: fixtureRehearsal ? transfer.from : "A",
                        });
                    }}
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    className="icon-button"
                    onClick={() => setPanel("preset")}
                    title="Customize"
                    aria-label="Customize"
                  >
                    <Settings2 size={18} />
                  </button>
                )}
              </div>
            </section>
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
              {show.phase === "hold" ? "Resume" : "Hold"}
            </button>
            <button
              onClick={() => void run({ type: "recall", to: "A" })}
              disabled={busy || !leaseValid || show.phase === "ended"}
            >
              <RotateCcw size={15} /> Return
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
            <button
              className="icon-button"
              onClick={() => setPanel("evidence")}
              title="Inspect"
              aria-label="Inspect the stage record"
            >
              <CodeXml size={20} />
            </button>
          </div>
        </div>
        {show.phase !== "ended" ? <StudioMediaHint hint={hint} /> : null}
        {show.phase !== "ended" &&
        (media.audioBlocked || media.videoBlocked) ? (
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
        localCameraActive={localCamera.enabled}
        onChanged={() => void refresh()}
      />
      <EvidencePanel
        show={show}
        open={panel === "evidence"}
        onClose={() => setPanel(null)}
        renderHealth={health}
      >
        {localHost && isRehearsal && show.phase !== "ended" ? (
          <details className="transport-test-panel">
            <summary>
              Transport test <ChevronDown size={14} />
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
                <h3>Decoder</h3>
                <LocalVideoDiagnostics video={media.localPreview} />
              </section>
            ) : null}
          </details>
        ) : null}
      </EvidencePanel>
      <PresetPanel
        show={show}
        open={panel === "preset"}
        onClose={() => setPanel(null)}
        run={run}
        busy={busy || !leaseValid}
      />
      <Modal
        open={
          panel === "rehearsal-camera" &&
          fixtureRehearsal &&
          !localTest &&
          show.phase !== "ended"
        }
        onClose={() => setPanel(null)}
        title="Camera & hand cues"
      >
        <RehearsalCameraControls
          camera={localCamera}
          consented={localCameraConsent}
          onConsent={(value) => {
            if (!value) localCamera.disable();
            setLocalCameraConsent(value);
          }}
          anchor={localAnchor || show.participants.A.anchor}
          onAnchor={setLocalAnchor}
          calibration={calibration}
          onCalibrated={setCalibration}
          gesture={gesture}
          armed={gestureArmed}
          onArmed={setGestureArmed}
          locked={!leaseValid || busy}
          canOffer={canOffer && show.umbrella.owner === "A"}
          canAccept={currentOffer}
          onOffer={() => void offer()}
          onAccept={() => {
            if (transfer?.status === "offered")
              void run({
                type: "accept",
                transferId: transfer.id,
                slot: transfer.to,
              });
          }}
          acceptLabel={
            transfer?.to === "B"
              ? "Accept as illustrated part B"
              : "Accept as performer A"
          }
        />
      </Modal>
      <Modal
        open={panel === "devices" && show.phase !== "ended"}
        onClose={() => setPanel(null)}
        title="Camera & consent"
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
          {gesture.enabled ? (
            <StatusPill live title={gesture.status} ariaLabel={gesture.status}>
              {gestureArmed ? "Armed" : "Hand cues on"}
            </StatusPill>
          ) : null}
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
        title="End show?"
      >
        <div className="dialog-actions">
          <button className="button button-dark" onClick={() => setPanel(null)}>
            Keep show open
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
