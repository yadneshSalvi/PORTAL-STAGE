"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  LocalRehearsalCameraController,
  type LocalRehearsalCameraOptions,
} from "./local-rehearsal-camera";

export type { LocalRehearsalCameraOptions } from "./local-rehearsal-camera";

export function useLocalRehearsalCamera(options: LocalRehearsalCameraOptions) {
  const { showId, available, ended, consented } = options;
  const controller = useMemo(
    () => new LocalRehearsalCameraController(options),
    [showId],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useLayoutEffect(() => {
    controller.updateOptions({ showId, available, ended, consented });
  }, [controller, showId, available, ended, consented]);
  useEffect(() => {
    controller.mount();
    return controller.destroy;
  }, [controller]);
  return useMemo(
    () => ({
      ...snapshot,
      enable: controller.enable,
      disable: controller.disable,
      resume: controller.resume,
    }),
    [snapshot, controller],
  );
}
