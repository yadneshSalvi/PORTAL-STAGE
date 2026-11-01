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
  WandSparkles,
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
  StudioVisibilityNotice,
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
            Rehearse on your own, let chat hold the other portal, or perform
            with a friend.
          </p>
        </div>
        <div
          className="episode-picker"
          role="group"
          aria-label="Choose your episode"
        >
          <button
            aria-pressed={episode === "borrowed-weather"}
            onClick={() => setEpisode("borrowed-weather")}
          >
            <Umbrella size={23} />
            <span>
              <strong>Borrowed Weather</strong>
              <small>A storm, a patched umbrella, a curious visitor.</small>
            </span>
          </button>
          <button
            aria-pressed={episode === "midnight-parcel"}
            onClick={() => setEpisode("midnight-parcel")}
          >
            <Package size={23} />
            <span>
              <strong>The Midnight Parcel</strong>
              <small>A tagged gift that changes the room it reaches.</small>
            </span>
          </button>
        </div>
        <div className="lobby-options">
          <article className="lobby-rehearsal">
            <div className="lobby-poster">
              {episode === "midnight-parcel" ? (
                <ParcelPoster />
              ) : (
                <TheaterPoster compact />
              )}
            </div>
            <div className="lobby-option-copy">
              <span className="eyebrow">EXPLORE AT YOUR OWN PACE</span>
              <h2>A little dress rehearsal.</h2>
              <p>
                {episode === "midnight-parcel"
                  ? "Choose the contents, stamp a parcel, and let its stars or garden change the other room. Its tag and handling marks stay with it."
                  : "Try the whole story with illustrated rooms. Choose the weather, name a visitor, and let the room write the ending."}
              </p>
              <NewShowButton episode={episode} className="button button-ink">
                Start a rehearsal
              </NewShowButton>
              <span className="lobby-small">
                Illustrated scenery and labeled test ballots. Optional local
                camera and hand cues inside. No Twitch sign-in needed.
              </span>
            </div>
          </article>
          <article className="lobby-live">
            <div className="live-arch-icon">
              <Radio size={34} strokeWidth={1.2} />
              <span aria-hidden="true">✦</span>
            </div>
            <span className="eyebrow">YOU, YOUR CHANNEL & THE OTHER SIDE</span>
            <h2>Let chat hold the portal.</h2>
            <p>
              Perform in room A. Your Twitch community runs an original
              illustrated Audience Room, decides when to receive the prop, and
              helps send it home.
            </p>
            {session?.soloAllowed &&
            session.services.mediaConfigured &&
            session.soloUsage?.available !== false ? (
              <NewShowButton
                mode="solo"
                episode={episode}
                className="button button-gold"
              >
                Create a solo Twitch show
              </NewShowButton>
            ) : session?.authenticated ? (
              <p className="lobby-small" role="status">
                {session.soloUsage?.reason ||
                  (!session.services.mediaConfigured
                    ? "Live media is unavailable here. The public rehearsal and its local camera stay open."
                    : "Solo hosting is unavailable for this account right now. Try the public rehearsal.")}
              </p>
            ) : (
              <a className="button button-dark" href="/api/auth/twitch/login">
                Sign in with Twitch for solo <ArrowUpRight size={17} />
              </a>
            )}
            {session?.authenticated && session.soloUsage ? (
              <span className="lobby-small">
                {session.soloUsage.remaining} of {session.soloUsage.limit} solo
                starts remaining · up to {session.soloUsage.minutes} minutes of
                media per show.
              </span>
            ) : (
              <span className="lobby-small">
                Public solo hosting uses capped media sessions. Your camera and
                broadcast consent remain separate choices.
              </span>
            )}
            <Link className="text-link" href="/guide#solo">
              Solo setup & limits <ArrowRight size={15} />
            </Link>
          </article>
        </div>
        <details className="duet-hosting">
          <summary>
            Bring a second performer instead <Users size={17} />
          </summary>
          <p>
            Two consenting performers can share the stage through private
            backstage media. Duet hosting currently uses invited host access.
          </p>
          {session?.hostAllowed && session.services.mediaConfigured ? (
            <NewShowButton
              mode="live"
              episode={episode}
              className="button button-ink"
            >
              Create a duet show
            </NewShowButton>
          ) : (
            <a className="button button-ink" href="/api/auth/twitch/login">
              Invited duet host sign-in <ArrowUpRight size={16} />
            </a>
          )}
          <Link className="text-link" href="/guide#program">
            Media and Program setup <ArrowRight size={15} />
          </Link>
        </details>
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
              <span>{isParcel ? "EPISODE 002" : "EPISODE 001"}</span>
            </div>
            <h1>
              {show.preset.episodeTitle}
              <span className="title-spark" aria-hidden="true">
                ✦
              </span>
            </h1>
            <p>
              {isRehearsal
                ? fixtureRehearsal
                  ? "A private dress rehearsal. Play both illustrated parts, or try a local camera and hand cues."
                  : "Synthetic media transport test. Each performer controls their own entrance."
                : isSoloShow
                  ? "You perform in A. Your community holds the other portal in the illustrated Audience Room."
                  : "Two rooms. One scene. Leave a little room for the unexpected."}
            </p>
          </div>
          <div className="studio-title-actions">
            {!isSoloShow && (!isRehearsal || (localHost && localTest)) ? (
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
            ) : null}
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
          wasHidden={visibilityReminder}
          onAcknowledge={() => setVisibilityReminder(false)}
        />
        {isSoloShow && show.solo && show.phase !== "ended" ? (
          <div className="solo-session-note">
            <ShieldCheck size={17} aria-hidden="true" />
            <p>
              <strong>
                Solo show · one human camera, an illustrated Audience Room.
              </strong>
              <span>
                {`${Math.floor(soloRemaining / 60_000)}:${String(Math.floor(soloRemaining / 1000) % 60).padStart(2, "0")} reserved media time remaining. No more live access is issued after this deadline; keep this window open to end cleanly.`}
              </span>
            </p>
          </div>
        ) : null}
        <div className="studio-grid">
          <aside className="studio-sidebar">
            <section className="cast-panel">
              <div className="panel-eyebrow">
                <span>IN THE WINGS</span>
                <Users size={14} />
              </div>
              {(["A", "B"] as Slot[]).map((slot) => {
                if (isAudienceRoom(show, slot))
                  return (
                    <article className="cast-member cast-audience" key={slot}>
                      <div className="cast-avatar avatar-b">
                        <Sparkles size={22} aria-hidden="true" />
                      </div>
                      <div className="cast-member-info">
                        <strong>The Audience Room</strong>
                        <span>
                          Original illustrated room · controlled by chat
                        </span>
                        <small>
                          {show.umbrella.owner === "B"
                            ? `Holding the ${propName}`
                            : "Decides when to receive an offer"}
                        </small>
                      </div>
                    </article>
                  );
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
                          ? slot === "A" && localCamera.enabled
                            ? "You, in this browser"
                            : `Test performer ${slot}`
                          : p.name ||
                            (slot === "A" ? "You, the host" : "Your guest")}
                      </strong>
                      <span>
                        {isRehearsal
                          ? slot === "A" && localCamera.enabled
                            ? "Local camera · no media upload"
                            : "Original illustrated plate"
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
                <>
                  <p className="panel-footnote">
                    {localCamera.enabled
                      ? "Your camera appears only in this browser. Room B and every rehearsal ballot remain illustrated tests."
                      : "Original illustrated rooms let you rehearse the whole story. A local camera is optional."}
                  </p>
                  <button
                    className="button button-dark button-small full-width local-camera-button"
                    disabled={show.phase === "ended"}
                    onClick={() => setPanel("rehearsal-camera")}
                  >
                    <Camera size={15} aria-hidden="true" />
                    <span>
                      {localCamera.enabled
                        ? "Camera & hand cues"
                        : "Try camera & hand cues"}
                    </span>
                  </button>
                </>
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
                    ? localCamera.enabled
                      ? "Local camera A"
                      : "Test plates"
                    : media.connected
                      ? media.quality === "poor"
                        ? "Poor connection"
                        : "Connected"
                      : "Not connected"}
                </strong>
              </div>
              <StudioChatStatus
                show={show}
                enabled={chatEnabled}
                leaseValid={leaseValid}
                connection={chatState}
              />
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
                  <h2>One stage. One director.</h2>
                  <p>This studio is waiting for its render lease.</p>
                </div>
              )}
              <div className="monitor-bottom">
                <span>
                  <Headphones size={13} />
                  {isRehearsal
                    ? localCamera.enabled
                      ? "Local camera A · illustrated room B · test ballots"
                      : "Synthetic rehearsal · no live cameras or audience"
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
            <section className="prop-card">
              <div className="prop-emblem">
                {isParcel ? (
                  <Package size={29} strokeWidth={1.3} />
                ) : (
                  <Umbrella size={29} strokeWidth={1.3} />
                )}
                <span className="prop-patch" />
              </div>
              <div className="prop-card-copy">
                <span className="panel-eyebrow">
                  {isParcel
                    ? "THE SAME TAGGED PARCEL"
                    : "THE SAME PATCHED UMBRELLA"}
                </span>
                <h3>
                  {currentOffer
                    ? `Offered to ${isSoloShow && transfer.to === "B" ? "the Audience Room" : `performer ${transfer.to}`}`
                    : transfer?.status === "accepted"
                      ? `The same ${propName} is crossing.`
                      : isSoloShow && show.umbrella.owner === "B"
                        ? "In the Audience Room’s care."
                        : `In performer ${show.umbrella.owner}’s care.`}
                </h3>
                <p>
                  {show.parcel ? (
                    <>
                      <span className="coral-swatch" />
                      Tag {show.parcel.tag} <span>·</span>{" "}
                      {show.parcel.stamped
                        ? "Moon stamp kept"
                        : "Waiting for its stamp"}{" "}
                      <span>·</span>{" "}
                      {show.parcel.damage > 0
                        ? "Handling marks kept"
                        : "Uncreased corners"}
                    </>
                  ) : (
                    <>
                      <span className="coral-swatch" />
                      Coral repair patch <span>·</span>{" "}
                      {Math.round(show.umbrella.wetness * 100)}% wet
                    </>
                  )}
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
                    from: fixtureRehearsal ? show.umbrella.owner : "A",
                  })
                }
              >
                <Hand size={16} /> Offer {propName} <kbd>O</kbd>
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
                          !fixtureRehearsal && transfer.to === "A"
                            ? "decline"
                            : "cancel-offer",
                        transferId: transfer.id,
                        slot: fixtureRehearsal ? transfer.from : "A",
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
                  {localCamera.enabled
                    ? "Your camera and hand landmarks stay in this browser. This run uses test ballots; real Twitch participation and broadcast capture need a live show."
                    : "Practice the mechanics here. Real remote cameras, audience input, and latency need a live run."}
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
              <RotateCcw size={15} /> Return {propName}
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
        {show.phase === "ended" ? (
          <p className="media-hint" role="status">
            This show has ended. Media and chat connections have closed; use the
            next-cue card to open a fresh theater.
          </p>
        ) : hint ? (
          <p className="media-hint" role="status">
            {hint}
          </p>
        ) : null}
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
      />
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
        title="Your own entrance into the scene."
        eyebrow="LOCAL CAMERA REHEARSAL · OPTIONAL HAND CUES"
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
