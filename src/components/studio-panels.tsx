"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  CheckCheck,
  Copy,
  Download,
  ExternalLink,
  Link2,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";
import { api, invite } from "@/lib/client";
import type {
  Invitation,
  ShowAction,
  ShowEnvelope,
  ShowPreset,
  ShowState,
} from "@/lib/contracts";
import { Modal, Spinner, StatusPill } from "./ui";
type Run = (action: ShowAction) => Promise<ShowEnvelope | null>;

export function InvitePanel({
  show,
  open,
  onClose,
  onChanged,
}: {
  show: ShowState;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [invitation, setInvitation] = useState<Invitation | null>(null),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function create() {
    setBusy(true);
    setCopied(false);
    setError("");
    setNotice("");
    try {
      setInvitation(await invite(show.id, "B"));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "An invitation could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function replaceGuest() {
    setBusy(true);
    setCopied(false);
    setError("");
    setNotice("");
    try {
      await api(`/api/shows/${encodeURIComponent(show.id)}/revoke-invite`, {
        method: "POST",
        body: "{}",
      });
      setInvitation(null);
      onChanged?.();
      setInvitation(await invite(show.id, "B"));
      setNotice(
        "The old guest access is closed. Send the new invitation privately; Program outputs remain paired.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Guest replacement could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const url = invitation
    ? invitation.url.startsWith("http")
      ? invitation.url
      : typeof window !== "undefined"
        ? new URL(invitation.url, window.location.origin).href
        : invitation.url
    : "";
  return (
    <Modal open={open} onClose={onClose} title="Invite a performer">
      <p className="dialog-copy">
        Your guest chooses camera and broadcast permissions before you admit
        them to Program.
      </p>
      <div className="invitation-preview">
        <h3>{show.preset.episodeTitle}</h3>
        <span>
          Performer B ·{" "}
          {show.channel ? `twitch.tv/${show.channel}` : "Private rehearsal"}
        </span>
      </div>
      {invitation ? (
        <>
          <label className="field-label" htmlFor="invite-url">
            Private invitation link
          </label>
          <div className="copy-field">
            <input id="invite-url" readOnly value={url} />
            <button
              className="icon-button"
              aria-label="Copy private invitation"
              onClick={() => {
                void navigator.clipboard
                  .writeText(url)
                  .then(() => setCopied(true))
                  .catch(() =>
                    setError("Select the link and copy it manually."),
                  );
              }}
            >
              {copied ? <CheckCheck size={18} /> : <Copy size={18} />}
            </button>
          </div>
          <div className="panel-status-row">
            <StatusPill title="Invitation expiry">
              {new Date(invitation.expiresAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </StatusPill>
            {copied ? <StatusPill tone="teal">Copied</StatusPill> : null}
          </div>
          <div className="dialog-actions">
            <a
              className="button button-dark"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              Open backstage <ExternalLink size={16} />
            </a>
            <button
              className="button button-dark"
              disabled={busy}
              onClick={() => void create()}
              title="Invalidate the previous unused invitation and create a new one"
            >
              <RefreshCw size={15} /> Replace invitation
            </button>
          </div>
        </>
      ) : (
        <button
          className="button button-gold full-width"
          disabled={busy}
          onClick={() => void create()}
        >
          {busy ? (
            <Spinner label="Writing the invitation…" />
          ) : (
            <>
              <Link2 size={17} /> Create private invitation
            </>
          )}
        </button>
      )}
      {show.participants.B.joined ? (
        <div className="guest-replacement">
          <button
            className="button button-dark full-width"
            disabled={busy || show.phase === "ended"}
            onClick={() => void replaceGuest()}
            title="Close the current guest's access and issue a new private invitation"
          >
            <RefreshCw size={16} /> Replace guest and re-invite
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="panel-status-row" role="status">
          <StatusPill tone="teal" title={notice} ariaLabel={notice}>
            Guest replaced
          </StatusPill>
        </div>
      ) : null}
      {error ? (
        <p className="panel-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
export function OutputPanel({
  show,
  open,
  onClose,
  publishing,
  transportTesting = false,
  onChanged,
  localCameraActive = false,
}: {
  show: ShowState;
  open: boolean;
  onClose: () => void;
  publishing: boolean;
  transportTesting?: boolean;
  onChanged?: () => void;
  localCameraActive?: boolean;
}) {
  const [grant, setGrant] = useState<{
      code: string;
      expiresAt: number;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function prepare() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setGrant(
        await api(`/api/shows/${encodeURIComponent(show.id)}/output-grant`, {
          method: "POST",
          body: "{}",
        }),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Program access could not be prepared.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function unpairOutputs() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/shows/${encodeURIComponent(show.id)}/output-revoke`, {
        method: "POST",
        body: "{}",
      });
      setGrant(null);
      setNotice(
        "All Program outputs are unpaired. Prepare a new pairing code to reconnect an output.",
      );
      onChanged?.();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Outputs could not be unpaired.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        show.mode === "rehearsal" && !transportTesting
          ? "Scene preview"
          : "Program output"
      }
    >
      <div className="panel-status-row">
        <StatusPill
          tone={
            show.mode === "rehearsal" ? "gold" : publishing ? "teal" : "muted"
          }
        >
          {show.mode === "rehearsal"
            ? "Rehearsal"
            : publishing
              ? "Publishing"
              : "Not publishing"}
        </StatusPill>
      </div>
      {show.mode === "rehearsal" && localCameraActive ? (
        <p className="dialog-copy">
          Your camera stays in this browser. The scene preview uses illustrated
          rooms.
        </p>
      ) : null}
      {show.mode === "rehearsal" && !transportTesting ? (
        <a
          className="button button-gold full-width"
          href={`/program?show=${encodeURIComponent(show.id)}${transportTesting ? "&transport=1" : ""}`}
          target="_blank"
          rel="noreferrer"
        >
          Open scene preview <ExternalLink size={17} />
        </a>
      ) : grant ? (
        <div className="program-pairing">
          <span>Private output code</span>
          <strong id="program-code">{grant.code}</strong>
          <StatusPill title="Pairing code expiry">
            {new Date(grant.expiresAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </StatusPill>
          <a
            className="button button-gold"
            href={`/program?show=${encodeURIComponent(show.id)}${transportTesting ? "&transport=1" : ""}`}
            target="_blank"
            rel="noreferrer"
          >
            Open Program <ExternalLink size={16} />
          </a>
          <button
            className="button button-dark"
            disabled={busy}
            onClick={() => void prepare()}
          >
            <RefreshCw size={16} />
            {busy ? "Preparing access…" : "Replace pairing code"}
          </button>
        </div>
      ) : (
        <button
          className="button button-gold full-width"
          onClick={() => void prepare()}
          disabled={busy}
        >
          {busy ? "Preparing access…" : "Create pairing code"}
          <ExternalLink size={17} />
        </button>
      )}
      {show.mode !== "rehearsal" || transportTesting ? (
        <div className="guest-replacement">
          <button
            className="button button-dark full-width"
            disabled={busy || show.phase === "ended"}
            onClick={() => void unpairOutputs()}
          >
            Unpair all Program outputs
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="panel-status-row" role="status">
          <StatusPill tone="teal" title={notice} ariaLabel={notice}>
            Outputs unpaired
          </StatusPill>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="panel-error">
          {error}
        </p>
      ) : null}
      <p className="field-help">
        Pairing grants read-only access. Keep invitations and host credentials
        private.
      </p>
    </Modal>
  );
}
export function EvidencePanel({
  show,
  open,
  onClose,
  renderHealth,
  children,
}: {
  show: ShowState;
  open: boolean;
  onClose: () => void;
  renderHealth?: { fps: number; width: number; height: number; webgl: boolean };
  children?: ReactNode;
}) {
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            mode: show.mode,
            showId: show.id,
            sequence: show.sequence,
            episode: show.episode,
            umbrella: show.umbrella,
            parcel: show.parcel,
            decisions: show.decisions,
            presenceEffects: show.presenceEffects,
            creature: show.creature,
            round: show.round,
            events: show.events,
            scope:
              "Current state and recent server events; rehearsal is synthetic, not remote-media or audience evidence.",
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `portal-stage-${show.id.slice(0, 8)}-sequence-${show.sequence}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Modal open={open} onClose={onClose} title="Inspect" wide>
      {show.mode === "rehearsal" ? (
        <div className="panel-status-row">
          <StatusPill tone="gold">Rehearsal</StatusPill>
        </div>
      ) : null}
      {renderHealth ? (
        <dl className="evidence-identities">
          <div>
            <dt>Resolution</dt>
            <dd>
              {renderHealth.width} × {renderHealth.height}
            </dd>
          </div>
          <div>
            <dt>Frame rate</dt>
            <dd>{renderHealth.fps} fps</dd>
          </div>
          <div>
            <dt>Renderer</dt>
            <dd>{renderHealth.webgl ? "WebGL" : "Unavailable"}</dd>
          </div>
        </dl>
      ) : null}
      <div className="evidence-metrics">
        <div>
          <span>SEQUENCE</span>
          <strong>{show.sequence}</strong>
        </div>
        <div>
          <span>ONE OWNER</span>
          <strong>
            {show.mode === "solo" && show.umbrella.owner === "B"
              ? "Audience Room"
              : `Performer ${show.umbrella.owner}`}
          </strong>
        </div>
        <div>
          <span>PROP VERSION</span>
          <strong>{show.umbrella.version}</strong>
        </div>
        <div>
          <span>RETAINED TRAITS</span>
          <strong>
            <i className="coral-swatch" />{" "}
            {show.parcel
              ? `Tag ${show.parcel.tag} · ${Math.round(show.parcel.damage * 100)}% handling marks`
              : `Coral patch · ${Math.round(show.umbrella.wetness * 100)}% wet`}
          </strong>
        </div>
      </div>
      <dl className="evidence-identities">
        <div>
          <dt>{show.parcel ? "Parcel identity" : "Umbrella identity"}</dt>
          <dd>{show.umbrella.id}</dd>
        </div>
        <div>
          <dt>{show.parcel ? "Parcel consequence" : "Creature identity"}</dt>
          <dd>
            {show.parcel
              ? `${show.parcel.contents || "Contents unchosen"} · ${show.parcel.transformedRoom ? `room ${show.parcel.transformedRoom}` : "not opened"}`
              : show.creature.id}
          </dd>
        </div>
        <div>
          <dt>Current transfer</dt>
          <dd>{show.umbrella.transfer?.id || "No offer yet"}</dd>
        </div>
        <div>
          <dt>Committed sequence</dt>
          <dd>
            {show.umbrella.transfer?.commitSequence ?? "Awaiting acceptance"}
          </dd>
        </div>
        <div>
          <dt>Renderer epoch</dt>
          <dd>{show.epoch}</dd>
        </div>
      </dl>
      <div className="evidence-events" aria-label="Recent server events">
        {[...show.events].reverse().map((event) => (
          <div className="evidence-event" key={event.id}>
            <span className="event-sequence">
              {String(event.sequence).padStart(3, "0")}
            </span>
            <div>
              <strong>{event.summary}</strong>
              <span>
                {event.type} · {event.actor} · owner {event.owner} · v
                {event.propVersion}
              </span>
            </div>
            <time dateTime={new Date(event.at).toISOString()}>
              {new Date(event.at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </time>
          </div>
        ))}
      </div>
      <div className="dialog-actions">
        <button className="button button-gold" onClick={download}>
          <Download size={17} /> Export current record
        </button>
        <span className="field-help">{show.events.length} events</span>
      </div>
      {children}
    </Modal>
  );
}
export function PresetPanel({
  show,
  open,
  onClose,
  run,
  busy,
}: {
  show: ShowState;
  open: boolean;
  onClose: () => void;
  run: Run;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<ShowPreset>(show.preset),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft({
        ...show.preset,
        episode: show.episode,
        id: `version-${crypto.randomUUID()}`,
        name: `${show.preset.name} — my version`,
      });
      setSaved(false);
    }
  }, [open]);
  const update = <K extends keyof ShowPreset>(key: K, value: ShowPreset[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };
  async function save() {
    const result = await run({ type: "save-preset", preset: draft });
    if (result) setSaved(true);
  }
  return (
    <Modal open={open} onClose={onClose} title="Customize" wide>
      <div className="preset-layout">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="preset-form"
        >
          <label className="field-label">
            Version name
            <input
              value={draft.name}
              maxLength={60}
              onChange={(e) => update("name", e.target.value)}
              required
            />
          </label>
          <div className="field-two-columns">
            <label className="field-label">
              Episode title
              <input
                value={draft.episodeTitle}
                maxLength={60}
                onChange={(e) => update("episodeTitle", e.target.value)}
                required
              />
            </label>
            {show.episode !== "midnight-parcel" ? (
              <label className="field-label">
                Visitor name
                <input
                  value={draft.creatureName}
                  maxLength={24}
                  onChange={(e) => update("creatureName", e.target.value)}
                  required
                />
              </label>
            ) : null}
          </div>
          {show.episode !== "midnight-parcel" ? (
            <div className="field-two-columns">
              <label className="field-label">
                Weather preference
                <select
                  value={draft.defaultWeather}
                  onChange={(e) =>
                    update(
                      "defaultWeather",
                      e.target.value as ShowPreset["defaultWeather"],
                    )
                  }
                >
                  <option value="gentle">Gentle</option>
                  <option value="wild">Wild</option>
                </select>
              </label>
              <label className="field-label">
                Ending preference
                <select
                  value={draft.ending}
                  onChange={(e) =>
                    update("ending", e.target.value as ShowPreset["ending"])
                  }
                >
                  <option value="shared-shelter">Shared shelter</option>
                  <option value="playful-chase">Playful chase</option>
                </select>
              </label>
            </div>
          ) : null}
          {show.episode !== "midnight-parcel" ? (
            <label className="range-label">
              <span>
                Rain intensity{" "}
                <strong>{Math.round(draft.rainIntensity * 100)}%</strong>
              </span>
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={draft.rainIntensity}
                onChange={(e) =>
                  update("rainIntensity", Number(e.target.value))
                }
              />
            </label>
          ) : null}
          {show.episode !== "midnight-parcel" ? (
            <label className="range-label">
              <span>
                Creature curiosity{" "}
                <strong>{Math.round(draft.creatureCuriosity * 100)}%</strong>
              </span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={draft.creatureCuriosity}
                onChange={(e) =>
                  update("creatureCuriosity", Number(e.target.value))
                }
              />
            </label>
          ) : null}
          <label className="range-label">
            <span>
              Crossing time <strong>{draft.crossingMs} ms</strong>
            </span>
            <input
              type="range"
              min="900"
              max="1400"
              step="100"
              value={draft.crossingMs}
              onChange={(e) => update("crossingMs", Number(e.target.value))}
            />
          </label>
          <label className="field-label">
            Audience choice window (seconds)
            <input
              type="number"
              min="15"
              max="90"
              value={draft.roundSeconds}
              onChange={(e) => update("roundSeconds", Number(e.target.value))}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={draft.reducedMotion}
              onChange={(e) => update("reducedMotion", e.target.checked)}
            />
            <span>Reduced motion</span>
          </label>
          <button
            className="button button-gold full-width"
            disabled={busy || !draft.name.trim()}
            type="submit"
          >
            {saved ? <Check size={17} /> : <Save size={17} />}{" "}
            {saved ? "Saved" : "Save version"}
          </button>
        </form>
        <div className="saved-versions">
          <h3>Saved versions</h3>
          {show.savedPresets.map((preset) => (
            <div className="saved-version" key={preset.id}>
              <Sparkles size={18} />
              <div>
                <strong>{preset.name}</strong>
                <span>
                  {show.episode === "midnight-parcel" ? (
                    "Parcel · saved pacing and motion"
                  ) : (
                    <>
                      {preset.defaultWeather} rain ·{" "}
                      {preset.ending === "playful-chase"
                        ? "playful chase"
                        : "shared shelter"}
                    </>
                  )}
                </span>
              </div>
              <button
                className="button button-dark button-small"
                disabled={busy || show.preset.id === preset.id}
                onClick={() =>
                  void run({ type: "load-preset", presetId: preset.id })
                }
              >
                {show.preset.id === preset.id ? "On stage" : "Load"}
              </button>
            </div>
          ))}
          {!show.savedPresets.length ? (
            <p className="field-help">No saved versions.</p>
          ) : null}
          <button
            className="button button-dark full-width"
            disabled={busy || show.phase !== "hold"}
            onClick={() => void run({ type: "reset" })}
          >
            <RefreshCw size={16} />
            {show.phase === "hold" ? "Restart scene" : "Hold stage to restart"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
