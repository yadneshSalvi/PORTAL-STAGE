"use client";
import { useEffect, useState } from "react";
import {
  Check,
  CheckCheck,
  Copy,
  Download,
  ExternalLink,
  Link2,
  RefreshCw,
  Save,
  ShieldCheck,
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
import { Modal, Spinner } from "./ui";
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
    <Modal
      open={open}
      onClose={onClose}
      title="Save a place for a friend."
      eyebrow="A PRIVATE BACKSTAGE INVITATION"
    >
      <p className="dialog-copy">
        Your guest previews their camera, chooses their permissions, and gets
        ready backstage. You decide when to admit them to Program.
      </p>
      <div className="invitation-preview">
        <span className="invite-preview-star">✦</span>
        <span className="eyebrow">ADMIT ONE TO</span>
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
          <p className="field-help">
            {copied
              ? "Copied. Share this privately with your guest."
              : "Joining does not place a guest on air."}{" "}
            Expires{" "}
            {new Date(invitation.expiresAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            .
          </p>
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
            >
              <RefreshCw size={15} /> Replace invitation
            </button>
          </div>
          <p className="field-help">
            Replacing this invitation invalidates the previous unused code.
          </p>
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
          <p className="field-help">
            Lost the guest window? Replace performer B to close their old access
            and issue a fresh invitation. Existing Program outputs stay paired.
          </p>
          <button
            className="button button-dark full-width"
            disabled={busy || show.phase === "ended"}
            onClick={() => void replaceGuest()}
          >
            <RefreshCw size={16} /> Replace guest and re-invite
          </button>
        </div>
      ) : null}
      {notice ? (
        <p className="field-help" role="status">
          {notice}
        </p>
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
}: {
  show: ShowState;
  open: boolean;
  onClose: () => void;
  publishing: boolean;
  transportTesting?: boolean;
  onChanged?: () => void;
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
      title="One clean view of the magic."
      eyebrow={
        show.mode === "rehearsal" && !transportTesting
          ? "REHEARSAL SCENE PREVIEW"
          : "PROGRAM OUTPUT"
      }
    >
      <div className="output-format">
        <span>16:9</span>
        <div>
          <strong>1920 × 1080</strong>
          <small>Canonical director composition · video + admitted audio</small>
        </div>
        <span className={`output-light ${publishing ? "is-on" : ""}`} />
      </div>
      <p className="dialog-copy">
        {show.mode === "rehearsal" && !transportTesting
          ? "This is a labeled local scene preview. Live Program receives the director’s published media stream."
          : transportTesting
            ? "This local synthetic transport test receives the director’s actual published WebRTC stream. It contains no real performers."
            : publishing
              ? "The director is publishing one Program stream. The output page receives that stream without rendering a second stage."
              : "Connect the media room in your camera setup to publish the canonical stage. A receive-only output page can then subscribe."}
      </p>
      <ol className="setup-list">
        <li>Open Program in the browser you will capture.</li>
        <li>In OBS, capture that window or use a verified Browser Source.</li>
        <li>
          Check 1920 × 1080 framing and the single audio route before
          broadcasting.
        </li>
      </ol>
      {show.mode === "rehearsal" ? (
        <a
          className="button button-gold full-width"
          href={`/program?show=${encodeURIComponent(show.id)}${transportTesting ? "&transport=1" : ""}`}
          target="_blank"
          rel="noreferrer"
        >
          {transportTesting
            ? "Open synthetic transport Program"
            : "Open rehearsal scene preview"}{" "}
          <ExternalLink size={17} />
        </a>
      ) : grant ? (
        <div className="program-pairing">
          <span className="eyebrow">ONE-TIME OUTPUT PAIRING CODE</span>
          <strong>{grant.code}</strong>
          <span>
            Enter this on the Program page. It expires{" "}
            {new Date(grant.expiresAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            .
          </span>
          <a
            className="button button-gold"
            href={`/program?show=${encodeURIComponent(show.id)}${transportTesting ? "&transport=1" : ""}`}
            target="_blank"
            rel="noreferrer"
          >
            Open Program <ExternalLink size={16} />
          </a>
        </div>
      ) : (
        <button
          className="button button-gold full-width"
          onClick={() => void prepare()}
          disabled={busy}
        >
          {busy ? "Preparing access…" : "Prepare Program access"}
          <ExternalLink size={17} />
        </button>
      )}
      {show.mode !== "rehearsal" ? (
        <div className="guest-replacement">
          <button
            className="button button-dark full-width"
            disabled={busy || show.phase === "ended"}
            onClick={() => void unpairOutputs()}
          >
            Unpair all Program outputs
          </button>
          <p className="field-help">
            This closes every existing output pairing. Guest invitations are
            separate.
          </p>
        </div>
      ) : null}
      {notice ? (
        <p className="field-help" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="panel-error">
          {error}
        </p>
      ) : null}
      <p className="field-help">
        The pairing code is exchanged for read-only access. Keep private
        invitations and host credentials out of OBS source URLs.
      </p>
    </Modal>
  );
}
export function EvidencePanel({
  show,
  open,
  onClose,
}: {
  show: ShowState;
  open: boolean;
  onClose: () => void;
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
            umbrella: show.umbrella,
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
    <Modal
      open={open}
      onClose={onClose}
      title="The prop remembers."
      eyebrow="INSPECT THE STAGE RECORD"
      wide
    >
      <p className="dialog-copy">
        These are this show’s actual server events and current state. A
        rehearsal tests the protocol with synthetic plates and test ballots; it
        does not establish real remote media, Twitch participation, or measured
        latency.
      </p>
      <div className="evidence-metrics">
        <div>
          <span>SEQUENCE</span>
          <strong>{show.sequence}</strong>
        </div>
        <div>
          <span>ONE OWNER</span>
          <strong>Performer {show.umbrella.owner}</strong>
        </div>
        <div>
          <span>PROP VERSION</span>
          <strong>{show.umbrella.version}</strong>
        </div>
        <div>
          <span>RETAINED TRAITS</span>
          <strong>
            <i className="coral-swatch" /> Coral patch ·{" "}
            {Math.round(show.umbrella.wetness * 100)}% wet
          </strong>
        </div>
      </div>
      <dl className="evidence-identities">
        <div>
          <dt>Umbrella identity</dt>
          <dd>{show.umbrella.id}</dd>
        </div>
        <div>
          <dt>Creature identity</dt>
          <dd>{show.creature.id}</dd>
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
        <span className="field-help">
          Recent event window · {show.events.length} events shown
        </span>
      </div>
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
    <Modal
      open={open}
      onClose={onClose}
      title="Make the story your own."
      eyebrow="YOUR VERSION OF BORROWED WEATHER"
      wide
    >
      <p className="dialog-copy">
        Save a version, then load it onto the stage. The episode title,
        rainfall, Pip’s behavior, and ending all use these saved settings.
      </p>
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
            <label className="field-label">
              Little creature’s name
              <input
                value={draft.creatureName}
                maxLength={24}
                onChange={(e) => update("creatureName", e.target.value)}
                required
              />
            </label>
          </div>
          <div className="field-two-columns">
            <label className="field-label">
              Director’s fallback weather
              <select
                value={draft.defaultWeather}
                onChange={(e) =>
                  update(
                    "defaultWeather",
                    e.target.value as ShowPreset["defaultWeather"],
                  )
                }
              >
                <option value="gentle">Gentle · shy shelter-seeker</option>
                <option value="wild">Wild · a bouncing mischief-maker</option>
              </select>
            </label>
            <label className="field-label">
              The ending
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
              onChange={(e) => update("rainIntensity", Number(e.target.value))}
            />
          </label>
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
            <span>Gentler motion · keep the crossing, remove ambient rain</span>
          </label>
          <button
            className="button button-gold full-width"
            disabled={busy || !draft.name.trim()}
            type="submit"
          >
            {saved ? <Check size={17} /> : <Save size={17} />}{" "}
            {saved ? "Version saved — load it below" : "Save this version"}
          </button>
        </form>
        <div className="saved-versions">
          <span className="panel-eyebrow">YOUR SAVED VERSIONS</span>
          {show.savedPresets.map((preset) => (
            <div className="saved-version" key={preset.id}>
              <Sparkles size={18} />
              <div>
                <strong>{preset.name}</strong>
                <span>
                  {preset.defaultWeather} rain ·{" "}
                  {preset.ending === "playful-chase"
                    ? "playful chase"
                    : "shared shelter"}
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
            <p className="field-help">
              Save your first version here. It stays with this show when you
              return.
            </p>
          ) : null}
          <div className="preset-tip">
            <ShieldCheck size={20} />
            <p>
              Loading changes the stage’s rules and title. Use{" "}
              <strong>Reset scene</strong> to run a fresh version from the first
              cue.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
