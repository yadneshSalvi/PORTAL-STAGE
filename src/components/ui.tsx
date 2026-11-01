"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { ArrowLeft, LoaderCircle, X } from "lucide-react";
import Link from "next/link";

export function Spinner({ label = "Setting the stage…" }: { label?: string }) {
  return (
    <span className="spinner-label" role="status">
      <LoaderCircle className="spin" size={18} aria-hidden="true" />
      {label}
    </span>
  );
}
export function LoadingScreen({
  label = "Setting the stage…",
}: {
  label?: string;
}) {
  return (
    <main className="loading-screen" id="main-content">
      <span className="loading-portal" aria-hidden="true">
        ✦
      </span>
      <Spinner label={label} />
    </main>
  );
}
export function ErrorNotice({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className="error-notice" role="alert">
      <span>{children}</span>
      {onDismiss ? (
        <button
          className="icon-button"
          onClick={onDismiss}
          aria-label="Dismiss message"
        >
          <X size={18} />
        </button>
      ) : null}
    </div>
  );
}
export function StatusPill({
  children,
  tone = "muted",
  pulse = false,
  title,
  ariaLabel,
}: {
  children: ReactNode;
  tone?: "muted" | "teal" | "gold" | "coral";
  pulse?: boolean;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <span
      className={`chip status-pill status-${tone}`}
      title={title}
      aria-label={ariaLabel}
    >
      <span
        className={pulse ? "status-dot pulse" : "status-dot"}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}
export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`theater-dialog ${wide ? "dialog-wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby={titleId}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function EmptyRoom({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="empty-room" id="main-content">
      <Link href="/" className="text-link">
        <ArrowLeft size={16} /> Back to the theater
      </Link>
      <div className="empty-room-card">
        <span className="empty-room-star" aria-hidden="true">
          ✦
        </span>
        <h1>{title}</h1>
        <p>{children}</p>
        <Link href="/studio" className="button button-gold">
          Open the studio <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </main>
  );
}
