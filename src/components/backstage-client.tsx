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
  Video,
  X,
} from "lucide-react";
import { api, getSession, join } from "@/lib/client";
import type { ShowEnvelope } from "@/lib/contracts";
import { useMediaRoom } from "@/media/use-media-room";
import { VideoSurface } from "@/media/video-surface";
import { LocalVideoDiagnostics } from "@/media/local-video-diagnostics";
import type { GestureCalibration } from "@/vision/calibration";
import { useGestureInput } from "@/vision/use-gesture-input";
import { DeviceSetup } from "./device-setup";
import { Wordmark } from "./brand";
import { EmptyRoom, ErrorNotice, LoadingScreen, StatusPill } from "./ui";
import { useShowController } from "./use-show-controller";

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
        <p className="eyebrow">SOMEONE SAVED YOU A PLACE</p>
        <h1>
          A little wonder
          <br />
          is waiting <em>in the wings.</em>
        </h1>
        <p>
          You enter a private backstage first. Preview your camera, find your
          framing, and choose when you’re ready.
        </p>
        {details ? (
          <div className="guest-invitation-details">
            <span>YOUR HOST IS {details.hostName}</span>
            <strong>{details.title}</strong>
            <p>
              {details.channel ? (
                <>
                  Broadcast destination:{" "}
                  <strong>twitch.tv/{details.channel}</strong>
                </>
              ) : (
                "A labeled rehearsal stage"
              )}
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
            What should we call you?
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
              Your invitation code
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
            {busy ? "Opening the stage door…" : "Enter private backstage"}
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
          A first-timer’s field guide <ArrowRight size={15} />
        </Link>
      </div>
      <span className="guest-invitation-footer">
        DIFFERENT ROOMS. ONE IMPOSSIBLE STAGE.
      </span>
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
    armed,
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
  const withdraw = useCallback(async () => {
    setArmed(false);
    gesture.disable();
    setLeft(true);
    void media.disconnect();
    await run({ type: "leave", slot });
  }, [gesture.disable, media.disconnect, run, slot]);
  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
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
  let cueTitle = "Find your place in the frame.",
    cueCopy =
      "Enable your private preview, choose your permissions, and confirm your framing. You have time.";
  if (participant.ready) {
    cueTitle = participant.admitted
      ? "Your place is ready."
      : "Ready when the story is.";
    cueCopy = participant.admitted
      ? "You’re admitted to the scene. Your On air light confirms when your camera is in Program."
      : "Your director can now admit you to the stage. You’ll see a clear On air light when your camera is in Program.";
  }
  if (onAir) {
    cueTitle = "You’re part of the scene.";
    cueCopy =
      "You’re on stage. Enjoy the moment and watch for an umbrella offer from your scene partner.";
  }
  if (onAir && holding) {
    cueTitle = "You’ve got the shelter.";
    cueCopy = `Offer the umbrella to ${show.participants[otherSlot].name || "your scene partner"} when the moment feels right. Its patch and droplets go with it.`;
  }
  if (offeredToMe) {
    cueTitle = "Could you hold this?";
    cueCopy =
      "An umbrella is waiting at the portal. Choose Accept when you’re ready, or decline. The crossing starts after you accept.";
  }
  if (transfer?.status === "accepted" && transfer.to === slot) {
    cueTitle = "Coming your way.";
    cueCopy = "The same patched umbrella is crossing. Get ready to catch it.";
  }
  if (offeredByMe) {
    cueTitle = "An invitation, not a race.";
    cueCopy =
      "Your partner has the offer. Hold your pose until they accept. You can cancel at any time before acceptance.";
  }
  if (show.phase === "hold") {
    cueTitle = "A moment in the wings.";
    cueCopy =
      "The director has held the stage. Your story and umbrella are safe. If you were hidden, confirm Ready again before the director re-admits you.";
  }
  if (left) {
    cueTitle = "You’re safely backstage.";
    cueCopy =
      "Your media room is disconnected. To return, enable your camera, join again, and mark yourself ready. Your director admits you separately.";
  }
  return (
    <div className="studio-shell guest-shell">
      <header className="studio-header">
        <Wordmark light />
        <div className="studio-header-right">
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
            <p className="eyebrow">
              YOUR PLACE IN {show.preset.episodeTitle.toUpperCase()}
            </p>
            <h1>Hello, {participant.name}.</h1>
            <p>
              {show.channel ? (
                <>
                  The host can show your camera and voice on{" "}
                  <strong>twitch.tv/{show.channel}</strong> after your consent,
                  readiness, and admission.
                </>
              ) : (
                "This is a labeled rehearsal. Your director controls admission separately from your readiness."
              )}
            </p>
          </div>
          <button
            className="button button-danger"
            onClick={() => void withdraw()}
          >
            <DoorOpen size={17} /> Leave stage
          </button>
        </div>
        {media.connected ? (
          <div className="guest-quick-devices">
            <button
              className="button button-dark"
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
                  <Radio size={13} /> THE SHARED STAGE
                </span>
                <span>VIDEO-ONLY RETURN</span>
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
                    <span aria-hidden="true">✦</span>
                    <h2>A stage worth waiting for.</h2>
                    <p>
                      {media.connected
                        ? "Your director’s composed return will appear here when it is published."
                        : "Your return monitor opens after you join the media room."}
                    </p>
                    <span>DIRECT CALL AUDIO · HEADPHONES RECOMMENDED</span>
                  </div>
                )}
              </div>
              <div className="monitor-bottom">
                <span>
                  <ShieldCheck size={13} />
                  One director’s view. Your own choice to participate.
                </span>
                <span>{media.connected ? media.quality : "Not connected"}</span>
              </div>
            </div>
            <section className="guest-action-card" aria-live="polite">
              <div className="guest-cue-icon">
                {offeredToMe ? (
                  <HeartHandshake size={28} strokeWidth={1.2} />
                ) : (
                  <Umbrella size={28} strokeWidth={1.2} />
                )}
              </div>
              <div>
                <p className="eyebrow">YOUR NEXT MOMENT</p>
                <h2>{cueTitle}</h2>
                <p>{cueCopy}</p>
              </div>
              <div className="guest-action-buttons">
                {offeredToMe && transfer ? (
                  <>
                    <button
                      className="button button-teal"
                      disabled={busy || show.phase !== "live"}
                      onClick={() => void accept()}
                    >
                      <Check size={18} /> Accept the umbrella <kbd>A</kbd>
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
                    onClick={() =>
                      void run({
                        type: "cancel-offer",
                        transferId: transfer.id,
                        slot,
                      })
                    }
                  >
                    Cancel your offer
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
                    <Hand size={18} /> Offer the umbrella <kbd>O</kbd>
                  </button>
                )}
              </div>
            </section>
            <section className="guest-gesture-card">
              <div className="guest-gesture-heading">
                <span>
                  <Hand size={18} /> Your hands, if you like.
                </span>
                <StatusPill tone={gesture.enabled ? "teal" : "muted"}>
                  {gesture.enabled ? "Local tracking" : "Optional"}
                </StatusPill>
              </div>
              <p>
                Buttons always work. Hand cues use on-device landmarks with a
                deliberate open-palm hold in the marked region.
              </p>
              <div className="guest-gesture-actions">
                <button
                  className="button button-dark"
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
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
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
                  <div className="gesture-reading">
                    <span>
                      Confidence {Math.round(gesture.confidence * 100)}%
                    </span>
                    <span>Hold {Math.round(gesture.dwellProgress * 100)}%</span>
                  </div>
                  <p role="status">{gesture.status}</p>
                  <p className="field-help">
                    Lower your hand once after arming. Then hold an open palm
                    for about one second.
                  </p>
                </>
              ) : null}
              {gesture.error ? (
                <p className="panel-error">{gesture.error}</p>
              ) : null}
            </section>
          </section>
          <aside className="guest-preparation">
            <section className="guest-setup-panel">
              <div className="panel-eyebrow">
                <span>YOUR CAMERA, YOUR ENTRANCE</span>
                <Video size={15} />
              </div>
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
                <div className="ready-step-number">3</div>
                <div>
                  <h3>
                    {onAir
                      ? "You’re on stage."
                      : participant.admitted
                        ? "Your place is ready."
                        : participant.ready
                          ? "You’re ready backstage."
                          : "Ready for your entrance?"}
                  </h3>
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
                {participant.ready
                  ? "Step back from readiness"
                  : "I’m ready backstage"}
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
        <footer className="guest-footer">
          <span>
            YOUR MIC IS SEPARATE FROM THE VIDEO RETURN. USE HEADPHONES.
          </span>
          <span>
            <kbd>Esc</kbd> cancels your offer or leaves your own participation.
          </span>
        </footer>
      </main>
    </div>
  );
}
