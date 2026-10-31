"use client";

import { LoaderCircle } from "lucide-react";

export function CameraPermissionNotice({
  pending,
  onCancel,
  announce = true,
}: {
  pending: boolean;
  onCancel: () => void;
  announce?: boolean;
}) {
  if (!pending) return null;
  return (
    <div className="camera-permission-notice">
      <p
        role={announce ? "status" : undefined}
        aria-live={announce ? "polite" : undefined}
        aria-atomic={announce ? true : undefined}
      >
        <LoaderCircle size={18} className="spin" aria-hidden="true" />
        <span>
          Waiting for camera permission — choose Allow in your browser.
        </span>
      </p>
      <button className="button button-dark button-small" onClick={onCancel}>
        Cancel camera request
      </button>
    </div>
  );
}
