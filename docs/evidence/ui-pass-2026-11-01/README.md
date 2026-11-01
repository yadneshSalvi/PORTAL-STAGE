# Round-three deployed UI comparison

Before: runtime `36d3182`. After: `fece42381d569bd70b9ce81055c71b664000e9a1`, deployment `dpl_91FUymt469TFNoo3iRnHSu3S41R9`, confirmed Ready at [the canonical site](https://portal-stage-eight.vercel.app). Both sets were captured from deployed builds on 1 November 2026.

Sixteen paired screens plus six final-state/mobile captures are indexed with SHA-256, dimensions and capture times. All images were visually inspected; there are no blank placeholders. Most captures are Chrome at 1440×1000. Mobile captures use 390×844; the existing closed solo uses the normal in-app viewport.

| Screen          | Before                               | After                              |
| --------------- | ------------------------------------ | ---------------------------------- |
| backstage-entry | [Before](before-backstage-entry.png) | [After](after-backstage-entry.png) |
| camera-dialog   | [Before](before-camera-dialog.png)   | [After](after-camera-dialog.png)   |
| end-dialog      | [Before](before-end-dialog.png)      | [After](after-end-dialog.png)      |
| guide           | [Before](before-guide.png)           | [After](after-guide.png)           |
| how-built       | [Before](before-how-built.png)       | [After](after-how-built.png)       |
| inspect         | [Before](before-inspect.png)         | [After](after-inspect.png)         |
| landing         | [Before](before-landing.png)         | [After](after-landing.png)         |
| not-found       | [Before](before-not-found.png)       | [After](after-not-found.png)       |
| output-dialog   | [Before](before-output-dialog.png)   | [After](after-output-dialog.png)   |
| parcel-studio   | [Before](before-parcel-studio.png)   | [After](after-parcel-studio.png)   |
| picker          | [Before](before-picker.png)          | [After](after-picker.png)          |
| presets         | [Before](before-presets.png)         | [After](after-presets.png)         |
| program         | [Before](before-program.png)         | [After](after-program.png)         |
| vote            | [Before](before-vote.png)            | [After](after-vote.png)            |
| weather-studio  | [Before](before-weather-studio.png)  | [After](after-weather-studio.png)  |
| solo-closed     | [Before](before-solo-closed.png)     | [After](after-solo-closed.png)     |

Additional after captures: [Weather finale](after-weather-finale.png), [Weather ended](after-weather-ended.png), [Parcel finale](after-parcel-finale.png), [Parcel ended](after-parcel-ended.png), [mobile landing](after-landing-mobile.png), [mobile Parcel](after-parcel-mobile.png).

[Before image metadata](before-captures.json) · [After image metadata](after-captures.json) · [Production layout measurements](production-layout.json) · [Local measurements](local-layout.json).

## Layout acceptance

Twenty final production states × 1280/1440/1920/390 px = 80 native DOM observations. All report an empty review overflow predicate and at most three visible DOM text sizes. The Program preview is a canvas-only surface, so it correctly reports zero DOM text sizes; its24/36/64 px canvas type scale and single room-name labels are covered by renderer tests and visual inspection. Local checkpoint measurements remain separate: 19 states / 76 observations, including the guest 13 px issue fixed before release.

Native CDP `Runtime.evaluate` supplied actual DOM geometry; the automation DOM proxy did not provide reliable `offsetParent` values. Temporary viewport overrides were cleared afterward. Consent text was retained. Rehearsal/Test vote chips remain visible in their own scene or choice context; canonical live Program labeling is covered by tests.

The public palette check measured ink/paper 14.98:1, muted/paper 4.66:1 and muted/dark 8.38:1; focus orange/paper 3.33:1 and teal/dark 10.3:1. These are specific color-pair checks, not independent accessibility certification. Motion continues to respect the reduced-motion preference.

## Scope

All new story captures are illustrated rehearsals. The before/after closed-solo view reopens the previously ended owned show; no camera or media was restarted. Local 19 PNGs are supplemental checkpoint evidence, not the deployed comparison. Current full walkthroughs and their exported records are in the [production browser report](../review-round3-2026-11-01/production-browser.md).
