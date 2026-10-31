# Native Chrome tab lifecycle acceptance

Source: `840604568ae50da47e1f383508e51e21ba83d32b`. Local frozen production build. Show `ps_fd333609f3ab9cf1`. Illustrated rehearsal only: no camera, microphone, LiveKit or Twitch.

## Native Duplicate Tab

Used Chrome’s native **Tab → Duplicate Tab**, which copies sessionStorage. The new tab automatically acquired mount incarnation 2 under the same renderer ID and epoch 1. The original showed “This director page was replaced by a newer page. Use the current studio.” Its Offer, cue and Return controls were disabled. The server recorded a different mount ID while retaining the same story sequence and epoch.

Then closed the original tab. The new director remained usable: **Open the weather choice** advanced the beat from overture to weather and sequence 3 to 4. The old unload did not release the current lease. This is actual native duplication, not two independent navigation tabs or fabricated storage.

Screenshots: [old tab fenced](p0-original-after-duplicate.jpg), [new tab after old closes](p0-duplicate-after-original-close.jpg), [new director advances cue](p0-duplicate-cue-working.jpg).

## Background-tab observation and its limit

Used native Chrome controls to select a new tab. Native accessibility and the actual tab strip showed that New tab was selected and the director was unselected. Two database observations 10.836 seconds apart showed epoch 1, incarnation 1 and live phase unchanged, with the lease expiry advancing. However, the browser inspection API reported `document.visibilityState = visible` even while native Chrome showed another selected tab. This test therefore does **not** establish actual hidden-page throttling, sustained Program frame delivery, minimized-window performance or OBS acceptance. The implementation warning and reduced-rate scheduler are covered separately; operational guidance still calls for a visible dedicated director window.

[Sanitized observations](p0-tab-lifecycle-results.json). No renderer IDs or mount IDs are published.
