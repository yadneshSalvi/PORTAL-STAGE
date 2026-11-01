"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  DoorOpen,
  Hand,
  Headphones,
  HeartHandshake,
  LoaderCircle,
  Mic,
  Radio,
  ShieldCheck,
  Umbrella,
  Package,
  Video,
  X,
} from "lucide-react";
import { api, getSession, join } from "@/lib/client";
import type { ShowEnvelope } from "@/lib/contracts";
import { useMediaRoom } from "@/media/use-media-room";
import { propLabel } from "@/lib/show-grammar";
import { VideoSurface } from "@/media/video-surface";
import { LocalVideoDiagnostics } from "@/media/local-video-diagnostics";
import type { GestureCalibration } from "@/vision/calibration";
import { useGestureInput } from "@/vision/use-gesture-input";
import { DeviceSetup } from "./device-setup";
import { CameraPermissionNotice } from "./camera-permission-notice";
import { Wordmark } from "./brand";
import { EmptyRoom, ErrorNotice, LoadingScreen, StatusPill } from "./ui";
import { useShowController } from "./use-show-controller";
import { GuestEnded } from "./guest-ended";

type InvitationInfo = {
  showId: string;
  title: string;
  channel: string | null;
  hostName: string;
  slot: "A" | "B";
  mode: "rehearsal" | "live";
  expiresAt: number;
  recordingEnabled: boolean;
};
export function BackstageClient({
  showId,
  invitation,
}: {
  showId?: string;
  invitation?: string;
}) {
  const [joinedId, setJoinedId] = useState(showId || ""),
    [name, setName] = useState(""),
    [code, setCode] = useState(invitation || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [details, setDetails] = useState<InvitationInfo | null>(null),
    [infoLoading, setInfoLoading] = useState(Boolean(invitation));
  useEffect(() => {
    if (joinedId || !/^[\w-]{24}$/.test(code.trim())) {
      setDetails(null);
      setInfoLoading(false);
      return;
    }
    let active = true;
    setDetails(null);
    setInfoLoading(true);
    void api<InvitationInfo>(
      `/api/invitation?code=${encodeURIComponent(code.trim())}`,
    )
      .then((value) => {
        if (active) {
          setDetails(value);
          setError("");
        }
      })
      .catch((e: unknown) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "The invitation could not be checked.",
          );
      })
      .finally(() => {
        if (active) setInfoLoading(false);
      });
    return () => {
      active = false;
    };
  }, [code, joinedId]);
  async function enter() {
    if (!details || infoLoading) return;
    setBusy(true);
    setError("");
    try {
      await getSession();
      const value = await join(code.trim(), name.trim());
      setJoinedId(value.show.id);
      window.history.replaceState(
        null,
        "",
        `/backstage?show=${encodeURIComponent(value.show.id)}`,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "We couldn’t open that invitation.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (joinedId) return <GuestShow showId={joinedId} />;
  return (
    <main className="guest-invitation-page" id="main-content">
      <Wordmark light />
      <div className="guest-invitation-card">
        <div className="invitation-arch">
          <span aria-hidden="true">✦</span>
        </div>
        <h1>Join backstage</h1>
        <p>
          You enter a private backstage first. Preview your camera, find your
          framing, and choose when you’re ready.
        </p>
        {details ? (
          <div className="guest-invitation-details">
            <span>Host: {details.hostName}</span>
            <strong>{details.title}</strong>
            <p>
              {details.channel ? (
                <>
                  Broadcast destination:{" "}
                  <strong>twitch.tv/{details.channel}</strong>
                </>
              ) : details.mode === "rehearsal" ? (
                <StatusPill tone="teal">Rehearsal</StatusPill>
              ) : null}
            </p>
            <span>
              You enter backstage. Broadcast and demo-recording permission are
              asked separately. This app does not start a recording.
            </span>
          </div>
        ) : infoLoading ? (
          <p role="status">Checking your invitation…</p>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enter();
          }}
        >
          <label className="field-label" htmlFor="performer-name">
            Name
            <input
              id="performer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
              maxLength={40}
              placeholder="Your stage name"
              required
            />
          </label>
          {!invitation ? (
            <label className="field-label" htmlFor="invitation-code">
              Invitation code
              <input
                id="invitation-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                placeholder="Enter your private invitation"
                required
              />
            </label>
          ) : null}
          <button
            type="submit"
            className="button button-gold full-width"
            disabled={
              busy || infoLoading || !details || !name.trim() || !code.trim()
            }
          >
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <DoorOpen size={18} />
            )}{" "}
            {busy ? "Opening…" : "Enter private backstage"}
            <ArrowRight size={17} />
          </button>
        </form>
        {error ? (
          <p className="panel-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="invitation-privacy-note">
          <ShieldCheck size={17} />
          <span>
            No camera or microphone starts until you enable it. Broadcast and
            recording permission are separate choices.
          </span>
        </div>
        <Link className="text-link" href="/guide">
          Guide <ArrowRight size={15} />
        </Link>
      </div>
    </main>
  );
}
function GuestShow({ showId }: { showId: string }) {
  const controller = useShowController(showId, { lease: false });
  if (!controller.envelope)
    return controller.error ? (
      <EmptyRoom title="The stage door is closed.">
        {controller.error}
      </EmptyRoom>
    ) : (
      <LoadingScreen label="Finding your place backstage…" />
    );
  if (controller.envelope.role !== "performer" || !controller.envelope.slot)
    return (
      <EmptyRoom title="You have the director’s seat.">
        <span>
          Open your studio to prepare your own camera and invite a guest.{" "}
        </span>
        <Link
          className="underlined-link"
          href={`/studio?show=${encodeURIComponent(showId)}`}
        >
          Return to the studio <ArrowRight size={16} />
        </Link>
      </EmptyRoom>
    );
  return (
    <GuestWorkspace envelope={controller.envelope} controller={controller} />
  );
}
function GuestWorkspace({
  envelope,
  controller,
}: {
  envelope: ShowEnvelope;
  controller: ReturnType<typeof useShowController>;
}) {
  const { show, slot: assignedSlot } = envelope,
    slot = assignedSlot!;
  const prop = propLabel(show);
  const participant = show.participants[slot],
    otherSlot = slot === "A" ? "B" : "A";
  const { run, busy, error, setError } = controller;
  const [calibration, setCalibration] = useState<GestureCalibration | null>(
      null,
    ),
    [armed, setArmed] = useState(false),
    [hint, setHint] = useState(""),
    [left, setLeft] = useState(false),
    [localHost, setLocalHost] = useState(false),
    [localTest, setLocalTest] = useState(false);
  useEffect(() => {
    setLocalHost(
      ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname),
    );
  }, []);
  const presence = useCallback(
    (value: { connected: boolean; camera: boolean; microphone: boolean }) =>
      run({ type: "presence", ...value, slot }, true),
    [run, slot],
  );
  const media = useMediaRoom({
    show,
    role: "performer",
    slot,
    epoch: show.epoch,
    serverNow: envelope.serverNow,
    onPresence: presence,
    onStateHint: setHint,
    allowSyntheticMedia: localTest,
  });
  const transfer = show.umbrella.transfer,
    offeredToMe = transfer?.status === "offered" && transfer.to === slot,
    offeredByMe = transfer?.status === "offered" && transfer.from === slot,
    holding = show.umbrella.owner === slot;
  const canOffer =
    holding &&
    show.phase === "live" &&
    !["offered", "accepted"].includes(transfer?.status || "") &&
    ([slot, otherSlot] as const).every((key) => {
      const p = show.participants[key];
      return (
        p.ready && p.admitted && p.connected && p.camera && p.consentBroadcast
      );
    });
  const offer = useCallback(
    () => run({ type: "offer", from: slot }),
    [run, slot],
  );
  const accept = useCallback(
    () =>
      offeredToMe && transfer
        ? run({ type: "accept", transferId: transfer.id, slot })
        : Promise.resolve(null),
    [run, slot, offeredToMe, transfer],
  );
  const anchor = useCallback(
    (point: { x: number; y: number }) => media.sendAnchor(point),
    [media.sendAnchor],
  );
  const gesture = useGestureInput(media.localPreview, {
    armed: armed && show.phase === "live",
    calibration,
    slot,
    owner: show.umbrella.owner,
    expectedReceiver: transfer?.status === "offered" ? transfer.to : null,
    offerId: transfer?.status === "offered" ? transfer.id : null,
    canOffer:
      show.phase === "live" &&
      participant.admitted &&
      participant.ready &&
      !busy,
    onOffer: offer,
    onAccept: accept,
    onAnchor: anchor,
  });
  useEffect(() => {
    if (show.phase === "ended") {
      setArmed(false);
      gesture.disable();
    }
  }, [show.phase, gesture.disable]);
  const withdraw = useCallback(async () => {
    setArmed(false);
    gesture.disable();
    setLeft(true);
    void media.disconnect();
    await run({ type: "leave", slot });
  }, [gesture.disable, media.disconnect, run, slot]);
  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
      if (show.phase === "ended") return;
      if (document.querySelector("dialog[open]")) return;
      if (e.code === "Escape") {
        e.preventDefault();
        if (offeredByMe && transfer)
          void run({ type: "cancel-offer", transferId: transfer.id, slot });
        else void withdraw();
        return;
      }
      const target = e.target as HTMLElement;
      if (
        target.closest(
          "input,select,textarea,button,a,[contenteditable=true]",
        ) ||
        e.repeat ||
        busy
      )
        return;
      if (e.key.toLowerCase() === "o" && canOffer) {
        e.preventDefault();
        void offer();
      }
      if (e.key.toLowerCase() === "a" && offeredToMe) {
        e.preventDefault();
        void accept();
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [
    accept,
    offer,
    offeredByMe,
    offeredToMe,
    transfer,
    run,
    withdraw,
    holding,
    canOffer,
    participant.admitted,
    show.phase,
    busy,
    slot,
  ]);
  const readyAllowed =
    participant.consentBroadcast &&
    participant.calibrated &&
    participant.connected &&
    participant.camera;
  const onAir =
    participant.admitted &&
    show.phase === "live" &&
    !left &&
    media.connected &&
    (media.cameraPublished || media.microphonePublished);
  let cueTitle = participant.ready
    ? "Ready backstage"
    : "Prepare your entrance";
  if (participant.admitted) cueTitle = "Admitted";
  if (onAir) cueTitle = holding ? `Holding the ${prop}` : "On stage";
  if (offeredToMe)
    cueTitle = `${prop[0].toUpperCase() + prop.slice(1)} offered`;
  if (transfer?.status === "accepted" && transfer.to === slot)
    cueTitle = "Crossing…";
  if (offeredByMe) cueTitle = "Offer pending";
  if (show.phase === "hold") cueTitle = "Stage held";
  if (left) cueTitle = "Backstage";
  if (show.phase === "ended") return <GuestEnded episode={show.episode} />;
  return (
    <div className="studio-shell guest-shell">
      <header className="studio-header">
        <Wordmark light />
        <div className="studio-header-right">
          {show.mode === "rehearsal" && !media.programVideo && (
            <StatusPill tone="teal">Rehearsal</StatusPill>
          )}
          <StatusPill
            tone={onAir ? "coral" : participant.ready ? "teal" : "muted"}
            pulse={onAir}
          >
            {onAir
              ? "On air"
              : participant.ready
                ? "Ready backstage"
                : "Private backstage"}
          </StatusPill>
          <Link className="studio-guide-link" href="/guide">
            <Headphones size={17} />
            <span>Field guide</span>
          </Link>
        </div>
      </header>
      <main id="main-content" className="guest-main">
        <div className="guest-title-row">
          <div>
            <h1>{participant.name}</h1>
            <p>
              {show.channel ? (
                <>
                  The host can show your camera and voice on{" "}
                  <strong>twitch.tv/{show.channel}</strong> after your consent,
                  readiness, and admission.
                </>
              ) : (
                "Your director controls admission separately from your readiness."
              )}
            </p>
          </div>
          <button
            className="button button-danger"
            aria-keyshortcuts={offeredByMe && transfer ? undefined : "Escape"}
            onClick={() => void withdraw()}
          >
            <DoorOpen size={17} /> Leave stage
            {offeredByMe && transfer ? null : <kbd>Esc</kbd>}
          </button>
        </div>
        {media.connected ? (
          <div className="guest-quick-devices">
            <button
              className="button button-dark"
              disabled={media.cameraRequestPending && !media.cameraEnabled}
              aria-busy={media.cameraRequestPending}
              onClick={() => {
                void (
                  media.cameraEnabled
                    ? media.disableCamera()
                    : media.enableCamera()
                ).catch(() => undefined);
              }}
            >
              <Video size={17} />
              {media.cameraEnabled ? "Turn camera off" : "Enable camera"}
            </button>
            <button
              className="button button-dark"
              onClick={() => {
                void (
                  media.microphoneEnabled
                    ? media.disableMicrophone()
                    : media.enableMicrophone()
                ).catch(() => undefined);
              }}
            >
              <Headphones size={17} />
              {media.microphoneEnabled
                ? "Mute microphone"
                : "Enable microphone"}
            </button>
          </div>
        ) : null}
        {media.connected ? (
          <CameraPermissionNotice
            pending={media.cameraRequestPending}
            announce={false}
            onCancel={() => {
              void media.disableCamera().catch(() => undefined);
            }}
          />
        ) : null}
        {error ? (
          <ErrorNotice onDismiss={() => setError("")}>{error}</ErrorNotice>
        ) : null}
        <div
          className={`guest-grid ${participant.ready ? "guest-is-ready" : ""} ${onAir ? "guest-on-air" : ""}`}
        >
          <section className="guest-performance">
            <div className="guest-return-monitor">
              <div className="monitor-topbar">
                <span>
                  <Radio size={13} /> Shared stage
                </span>
              </div>
              <div className="guest-return-video">
                {media.programVideo ? (
                  <VideoSurface
                    video={media.programVideo}
                    fit="contain"
                    label="Video-only return of the director’s canonical stage"
                  />
                ) : (
                  <div className="return-waiting">
                    <p>
                      {media.connected
                        ? "Waiting for the stage"
                        : "Join media to view the stage"}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <section className="guest-action-card" aria-live="polite">
              <div className="guest-cue-icon">
                {offeredToMe ? (
                  <HeartHandshake size={28} strokeWidth={1.2} />
                ) : show.parcel ? (
                  <Package size={28} strokeWidth={1.2} />
                ) : (
                  <Umbrella size={28} strokeWidth={1.2} />
                )}
              </div>
              <div>
                <h2>{cueTitle}</h2>
              </div>
              <div className="guest-action-buttons">
                {offeredToMe && transfer ? (
                  <>
                    <button
                      className="button button-teal"
                      disabled={busy || show.phase !== "live"}
                      onClick={() => void accept()}
                    >
                      <Check size={18} /> Accept the {prop} <kbd>A</kbd>
                    </button>
                    <button
                      className="button button-dark"
                      disabled={busy}
                      onClick={() =>
                        void run({
                          type: "decline",
                          transferId: transfer.id,
                          slot,
                        })
                      }
                    >
                      <X size={17} /> No, thank you
                    </button>
                  </>
                ) : offeredByMe && transfer ? (
                  <button
                    className="button button-dark"
                    disabled={busy}
                    aria-keyshortcuts="Escape"
                    onClick={() =>
                      void run({
                        type: "cancel-offer",
                        transferId: transfer.id,
                        slot,
                      })
                    }
                  >
                    Cancel your offer <kbd>Esc</kbd>
                  </button>
                ) : (
                  <button
                    className="button button-gold"
                    disabled={
                      busy ||
                      !holding ||
                      !onAir ||
                      show.phase !== "live" ||
                      transfer?.status === "accepted"
                    }
                    onClick={() => void offer()}
                  >
                    <Hand size={18} /> Offer the {prop} <kbd>O</kbd>
                  </button>
                )}
              </div>
            </section>
            <details className="guest-gesture-card">
              <summary className="guest-gesture-heading">
                <span>
                  <Hand size={18} /> Hand cues
                </span>
                <StatusPill tone={gesture.enabled ? "teal" : "muted"}>
                  {gesture.enabled ? "Local tracking" : "Optional"}
                </StatusPill>
              </summary>
              <p>Hand cues use on-device landmarks.</p>
              <div className="guest-gesture-actions">
                <button
                  className="button button-dark"
                  title="Buttons always work. Hold an open palm in the marked region to cue."
                  aria-description="Buttons always work. Hold an open palm in the marked region to cue."
                  disabled={!calibration || !media.localPreview}
                  onClick={() => {
                    if (gesture.enabled) {
                      gesture.disable();
                      setArmed(false);
                    } else void gesture.enable();
                  }}
                >
                  {gesture.enabled ? "Turn hand cues off" : "Enable hand cues"}
                </button>
                {gesture.enabled ? (
                  <label
                    className="checkbox-label"
                    title="Lower your hand once after arming. Then hold an open palm for about one second."
                  >
                    <input
                      type="checkbox"
                      aria-description="Lower your hand once after arming. Then hold an open palm for about one second."
                      checked={armed}
                      onChange={(e) => setArmed(e.target.checked)}
                    />
                    <span>Arm deliberate cues</span>
                  </label>
                ) : (
                  <span>
                    {calibration
                      ? media.localPreview
                        ? "Framing confirmed. Ready to enable hand cues."
                        : "Enable your camera to use hand cues."
                      : "Confirm framing first to enable."}
                  </span>
                )}
              </div>
              {gesture.enabled ? (
                <>
                  <div className="gesture-progress">
                    <span
                      style={{ width: `${gesture.dwellProgress * 100}%` }}
                    />
                  </div>
                  <StatusPill
                    tone="muted"
                    live
                    title={gesture.status}
                    ariaLabel={gesture.status}
                  >
                    {armed ? "Armed" : "Hand cues on"}
                  </StatusPill>
                </>
              ) : null}
              {gesture.error ? (
                <p className="panel-error">{gesture.error}</p>
              ) : null}
            </details>
          </section>
          <aside className="guest-preparation">
            <section className="guest-setup-panel">
              <DeviceSetup
                show={show}
                slot={slot}
                media={media}
                run={run}
                busy={busy}
                onCalibrated={setCalibration}
                cueCalibration={gesture.enabled ? calibration : null}
              />
              <div className="guest-ready-step">
                <div>
                  <h3>3 Ready</h3>
                  <p>
                    {onAir
                      ? "Your camera is in Program. You can turn it off, mute, or leave whenever you need."
                      : participant.admitted
                        ? "You’re admitted. Your On air light confirms when your camera is in Program."
                        : participant.ready
                          ? "Your director will admit you separately. Stay here for your low-latency stage return."
                          : "Ready tells the director you’re comfortable. It does not put you on air."}
                  </p>
                </div>
              </div>
              <button
                className={`button ${participant.ready ? "button-dark" : "button-teal"} full-width`}
                disabled={busy || (!participant.ready && !readyAllowed)}
                onClick={async () => {
                  const result = await run({
                    type: "ready",
                    ready: !participant.ready,
                    slot,
                  });
                  if (result) setLeft(false);
                }}
              >
                <Check size={17} />
                {participant.ready ? "Not ready" : "Ready backstage"}
              </button>
              {!readyAllowed && !participant.ready ? (
                <p className="field-help">
                  Confirm consent and framing, then join with your camera
                  enabled.
                </p>
              ) : null}
            </section>
            {localHost && show.mode === "rehearsal" ? (
              <details className="transport-test-panel">
                <summary>Local synthetic transport test</summary>
                <p>
                  Development-only labeled moving test plates. No real camera is
                  used.
                </p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={localTest}
                    onChange={(e) => setLocalTest(e.target.checked)}
                  />
                  <span>Enable synthetic media testing</span>
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
                    <span>
                      {media.status} ·{" "}
                      {media.syntheticCamera
                        ? "synthetic track"
                        : "no test track"}
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
          </aside>
        </div>
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
            {media.videoBlocked ? "Enable playback" : "Enable call audio"}
          </button>
        ) : null}
      </main>
    </div>
  );
}
