"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { MediaRoomController } from "./room-controller";
import type { MediaRoomOptions } from "./types";

export type {
  MediaRoomOptions,
  MediaSnapshot,
  MediaIssue,
  MediaPresence,
} from "./types";

export function useMediaRoom(options: MediaRoomOptions) {
  const { show, role, slot } = options;
  // A controller has no room, media track, DOM node, or device permission at construction.
  const controller = useMemo(
    () => new MediaRoomController(options),
    [show.id, role, slot],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    controller.updateOptions(options);
  });
  useEffect(() => {
    controller.mount();
    return () => {
      void controller.destroy();
    };
  }, [controller]);
  return useMemo(
    () => ({
      ...snapshot,
      sendAnchor: controller.sendAnchor,
      connect: controller.connect,
      enableCamera: controller.enableCamera,
      enableTestCamera: controller.enableTestCamera,
      disableCamera: controller.disableCamera,
      enableMicrophone: controller.enableMicrophone,
      disableMicrophone: controller.disableMicrophone,
      selectDevice: controller.selectDevice,
      refreshDevices: controller.refreshDevices,
      disconnect: controller.disconnect,
      publishProgram: controller.publishProgram,
      stopProgram: controller.stopProgram,
      startAudio: controller.startAudio,
    }),
    [snapshot, controller],
  );
}
