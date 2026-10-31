import * as THREE from "three";
import type { Point, ShowState, Slot } from "@/lib/contracts";
import {
  canvasTexture,
  drawProgramText,
  makeScenery,
  plane,
  ROOMS,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from "./scene-art";
import { makePip, makeUmbrella, UMBRELLA_GRIP } from "./props";
import { apertureCoverCrop } from "@/vision/calibration";
import { stagePointForAperture } from "./coordinates";
import { VideoFrameUpload } from "./video-frame-upload";

export type RenderInput = {
  show: ShowState;
  videoA?: HTMLVideoElement | null;
  videoB?: HTMLVideoElement | null;
  serverOffset?: number;
  forceCurtain?: boolean;
  anchors?: Partial<Record<Slot, Point>>;
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
  onArrive?: (transferId: string) => void | Promise<unknown>;
  onRenderHealth?: (health: {
    fps: number;
    width: number;
    height: number;
    webgl: boolean;
  }) => void;
};
const vertexShader = `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragmentShader = `uniform sampler2D videoMap; uniform vec2 uvScale; uniform vec2 size; varying vec2 vUv; void main(){float y=vUv.y*size.y; float x=(vUv.x-.5)*size.x; float r=size.x*.5; if(y>size.y-r&&x*x+pow(y-(size.y-r),2.0)>r*r) discard; vec2 uv=(vUv-.5)*uvScale+.5; gl_FragColor=texture2D(videoMap,uv);}`;
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
function anchor(
  show: ShowState,
  slot: Slot,
  anchors?: Partial<Record<Slot, Point>>,
) {
  const point = anchors?.[slot] || show.participants[slot].anchor;
  return stagePointForAperture(slot, point);
}

export function createTheaterRenderer(
  canvas: HTMLCanvasElement,
  getInput: () => RenderInput,
  onFailure: () => void,
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(STAGE_WIDTH, STAGE_HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor("#111827");
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(
    0,
    STAGE_WIDTH,
    STAGE_HEIGHT,
    0,
    0.1,
    2000,
  );
  camera.position.z = 1000;
  scene.add(new THREE.AmbientLight(0xffffff, 2));
  const key = new THREE.DirectionalLight(0xffdfb3, 2);
  key.position.set(500, 850, 450);
  scene.add(key);
  const scenery = makeScenery();
  scene.add(plane(scenery.texture, -60));
  const overlay = canvasTexture();
  scene.add(plane(overlay.texture, 180));
  const iris = new THREE.Group();
  iris.position.set(960, 1080 - 490, 4);
  scene.add(iris);
  for (let i = 0; i < 4; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? "#F2BC62" : "#64D8C8",
      transparent: true,
      opacity: i === 0 ? 0.85 : 0.18 + i * 0.04,
    });
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(128 + i * 12, i === 0 ? 1.8 : 1, 8, 100),
      material,
    );
    ring.position.z = i;
    iris.add(ring);
  }
  const orbit = new THREE.Group();
  iris.add(orbit);
  for (let i = 0; i < 3; i++) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(i === 0 ? 5 : 3, 12, 10),
      new THREE.MeshBasicMaterial({ color: i === 0 ? "#F2BC62" : "#64D8C8" }),
    );
    const a = (i * Math.PI * 2) / 3;
    lamp.position.set(Math.sin(a) * 152, Math.cos(a) * 152, 10);
    orbit.add(lamp);
  }
  const umbrella = makeUmbrella();
  scene.add(umbrella.group);
  const pip = makePip();
  pip.position.set(960, 264, 95);
  scene.add(pip);
  const puddle = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({
      color: "#64D8C8",
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    }),
  );
  puddle.scale.set(90, 10, 1);
  puddle.position.set(960, 247, 20);
  scene.add(puddle);
  const rainCount = 380,
    rainPositions = new Float32Array(rainCount * 6),
    rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(rainPositions, 3),
  );
  const rainMaterial = new THREE.LineBasicMaterial({
    color: "#A9DAD5",
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
  rain.position.z = 50;
  scene.add(rain);
  const videoMeshes: Partial<
    Record<
      Slot,
      {
        source: HTMLVideoElement;
        texture: THREE.VideoTexture;
        upload: VideoFrameUpload;
        mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
      }
    >
  > = {};
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0,
    stopped = false,
    lastFrame = 0,
    lastText = "",
    healthAt = performance.now(),
    frames = 0;
  const arrived = new Set<string>(),
    pendingArrivals = new Set<string>();
  let retryArrivalAt = 0;
  const checkpoint = getInput().show;
  let observedEpoch = checkpoint.epoch,
    wasLive = checkpoint.phase === "live",
    observedCommit = checkpoint.umbrella.transfer?.committedAt
      ? checkpoint.umbrella.transfer.id
      : null;
  let presentation: {
    id: string;
    start: number;
    duration: number;
    from: { x: number; y: number };
  } | null = null;
  let lastUmbrellaPosition = anchor(
    checkpoint,
    checkpoint.umbrella.owner,
    getInput().anchors,
  );
  function updateVideo(
    slot: Slot,
    source: HTMLVideoElement | null | undefined,
    show: ShowState,
    forceCurtain: boolean,
  ) {
    let entry = videoMeshes[slot];
    if (entry?.source !== source) {
      if (entry) {
        scene.remove(entry.mesh);
        entry.texture.dispose();
        entry.mesh.geometry.dispose();
        entry.mesh.material.dispose();
        delete videoMeshes[slot];
      }
      if (source) {
        const r = ROOMS[slot],
          texture = new THREE.VideoTexture(source);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        const material = new THREE.ShaderMaterial({
          uniforms: {
            videoMap: { value: texture },
            uvScale: { value: new THREE.Vector2(1, 1) },
            size: { value: new THREE.Vector2(r.w, r.h) },
          },
          vertexShader,
          fragmentShader,
          transparent: false,
          toneMapped: false,
        });
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(r.w, r.h),
          material,
        );
        mesh.position.set(r.x + r.w / 2, STAGE_HEIGHT - r.y - r.h / 2, -30);
        scene.add(mesh);
        entry = videoMeshes[slot] = {
          source,
          texture,
          mesh,
          upload: new VideoFrameUpload(),
        };
      }
    }
    if (!entry || !source) return;
    entry.upload.update(source, entry.texture);
    const p = show.participants[slot];
    entry.mesh.visible =
      !forceCurtain &&
      p.consentBroadcast &&
      p.admitted &&
      p.connected &&
      p.camera &&
      show.phase === "live" &&
      source.readyState >= 2;
    const crop = apertureCoverCrop({
      videoWidth: source.videoWidth || 1280,
      videoHeight: source.videoHeight || 720,
    });
    entry.mesh.material.uniforms.uvScale.value.set(
      crop?.width || 1,
      crop?.height || 1,
    );
  }
  function render(time: number) {
    if (stopped) return;
    frame = requestAnimationFrame(render);
    if (time - lastFrame < 1000 / 30 - 2) return;
    lastFrame = time;
    const current = getInput(),
      show = current.show;
    const now = Date.now() + (current.serverOffset || 0),
      t = now / 1000;
    const calm = reduced.matches || show.preset.reducedMotion;
    updateVideo("A", current.videoA, show, !!current.forceCurtain);
    updateVideo("B", current.videoB, show, !!current.forceCurtain);
    const available = { A: !!current.videoA, B: !!current.videoB };
    const textKey = `${show.sequence}:${show.phase}:${Math.floor(now / 1000)}:${current.forceCurtain}:${available.A}:${available.B}`;
    if (textKey !== lastText) {
      drawProgramText(
        overlay.ctx,
        current.forceCurtain ? { ...show, phase: "hold" } : show,
        now,
        available,
      );
      overlay.texture.needsUpdate = true;
      lastText = textKey;
    }
    const point = anchor(show, show.umbrella.owner, current.anchors);
    let ux = point.x,
      uy = point.y,
      tilt = show.umbrella.owner === "A" ? 0.1 : -0.1;
    const transfer = show.umbrella.transfer;
    if (transfer?.status === "offered") {
      ux += transfer.from === "A" ? 80 : -80;
      uy += 8;
      tilt = transfer.from === "A" ? -0.15 : 0.15;
    }
    // A new committed event gets its full presentation duration when this renderer observes it.
    // Mount, epoch, and hold recovery reconcile to the committed owner without replaying a crossing.
    if (
      show.epoch !== observedEpoch ||
      show.phase !== "live" ||
      current.forceCurtain
    ) {
      presentation = null;
      observedEpoch = show.epoch;
      observedCommit = transfer?.committedAt ? transfer.id : null;
      wasLive = false;
    }
    if (
      transfer?.committedAt &&
      transfer.commitSequence !== null &&
      transfer.commitSequence <= show.sequence &&
      show.umbrella.owner === transfer.to &&
      (transfer.status === "accepted" || transfer.status === "arrived")
    ) {
      if (transfer.id !== observedCommit) {
        if (wasLive && transfer.status === "accepted")
          presentation = {
            id: transfer.id,
            start: time,
            duration: clamp(show.preset.crossingMs, 900, 1400),
            from: lastUmbrellaPosition,
          };
        observedCommit = transfer.id;
      }
      if (transfer.status === "arrived") presentation = null;
      const p =
          presentation?.id === transfer.id
            ? clamp((time - presentation.start) / presentation.duration, 0, 1)
            : 1,
        eased = p * p * (3 - 2 * p),
        from =
          presentation?.from || anchor(show, transfer.from, current.anchors),
        to = anchor(show, transfer.to, current.anchors);
      ux = from.x + (to.x - from.x) * eased;
      uy =
        from.y +
        (to.y - from.y) * eased +
        Math.sin(p * Math.PI) * (70 + UMBRELLA_GRIP.y);
      tilt = Math.sin(p * Math.PI * 2) * 0.12;
      if (
        p >= 1 &&
        transfer.status === "accepted" &&
        !arrived.has(transfer.id) &&
        !pendingArrivals.has(transfer.id) &&
        time >= retryArrivalAt &&
        current.onArrive
      ) {
        const id = transfer.id;
        pendingArrivals.add(id);
        Promise.resolve(current.onArrive(id))
          .then((result) => {
            if (result !== false) arrived.add(id);
            else retryArrivalAt = performance.now() + 1300;
          })
          .catch(() => {
            retryArrivalAt = performance.now() + 1300;
          })
          .finally(() => pendingArrivals.delete(id));
      }
    }
    wasLive = show.phase === "live" && !current.forceCurtain;
    if (show.beat === "shelter") {
      ux =
        show.preset.ending === "playful-chase" && !calm
          ? 960 + Math.sin(t * 1.2) * 100
          : 960;
      uy = 485 + UMBRELLA_GRIP.y;
      tilt = 0;
    }
    lastUmbrellaPosition = { x: ux, y: uy };
    umbrella.group.position.set(ux, uy, 90);
    umbrella.group.rotation.z = tilt + (calm ? 0 : Math.sin(t * 0.9) * 0.012);
    umbrella.group.visible = show.phase === "live" && !current.forceCurtain;
    umbrella.droplets.children.forEach((drop, i) => {
      drop.visible = show.umbrella.wetness > i / 12;
      drop.position.y = -12 - (calm ? i * 2 : (t * (18 + i) + i * 16) % 60);
    });
    const hatch = show.creature.hatchedAt
        ? clamp((now - show.creature.hatchedAt) / 900, 0, 1)
        : 0,
      lively =
        show.creature.mood === "wild" ||
        (show.beat === "shelter" && show.preset.ending === "playful-chase");
    const follow =
      show.beat === "shelter" && show.preset.ending === "shared-shelter"
        ? 960
        : ux +
          (lively
            ? Math.sin(t * 2.4) * (45 + show.preset.creatureCuriosity * 80)
            : Math.sin(t * 0.8) * 15);
    pip.position.x += (follow - pip.position.x) * (lively ? 0.16 : 0.1);
    pip.position.y =
      264 +
      (calm
        ? 0
        : Math.abs(Math.sin(t * (lively ? 5 : 1.6))) * (lively ? 25 : 5));
    pip.scale.setScalar(Math.max(0.001, hatch));
    pip.rotation.z = calm
      ? 0
      : Math.sin(t * (lively ? 4 : 1.1)) * (lively ? 0.08 : 0.025);
    pip.visible =
      show.creature.hatched && show.phase === "live" && !current.forceCurtain;
    puddle.position.x = show.creature.hatched ? pip.position.x : ux;
    puddle.visible =
      !!show.weather && show.phase === "live" && !current.forceCurtain;
    orbit.rotation.z = calm ? 0 : t * 0.035;
    const visibleRain =
      !!show.weather && !calm && show.phase === "live" && !current.forceCurtain;
    rain.visible = visibleRain;
    if (visibleRain) {
      const count = Math.min(
        rainCount,
        Math.floor((lively ? 350 : 145) * show.preset.rainIntensity),
      );
      rainGeometry.setDrawRange(0, count * 2);
      rainMaterial.opacity = lively ? 0.42 : 0.3;
      for (let i = 0; i < count; i++) {
        const slot: Slot = i % 2 ? "A" : "B",
          r = ROOMS[slot],
          x = r.x + 38 + ((i * 137) % (r.w - 76)),
          y = r.y + 25 + ((t * (lively ? 360 : 180) + i * 71) % (r.h - 40)),
          j = i * 6;
        rainPositions[j] = x;
        rainPositions[j + 1] = STAGE_HEIGHT - y;
        rainPositions[j + 2] = 0;
        rainPositions[j + 3] = x - (lively ? 8 : 2);
        rainPositions[j + 4] = STAGE_HEIGHT - y - (lively ? 23 : 15);
        rainPositions[j + 5] = 0;
      }
      rainGeometry.attributes.position.needsUpdate = true;
    }
    renderer.render(scene, camera);
    frames++;
    if (time - healthAt > 2500) {
      current.onRenderHealth?.({
        fps: Math.round((frames * 1000) / (time - healthAt)),
        width: 1920,
        height: 1080,
        webgl: true,
      });
      frames = 0;
      healthAt = time;
    }
  }
  function contextLost(e: Event) {
    e.preventDefault();
    stopped = true;
    getInput().onCanvas?.(null);
    getInput().onRenderHealth?.({
      fps: 0,
      width: 1920,
      height: 1080,
      webgl: false,
    });
    onFailure();
  }
  canvas.addEventListener("webglcontextlost", contextLost);
  getInput().onCanvas?.(canvas);
  frame = requestAnimationFrame(render);
  document.fonts.ready
    .then(() => {
      if (!stopped) lastText = "";
    })
    .catch(() => undefined);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    canvas.removeEventListener("webglcontextlost", contextLost);
    getInput().onCanvas?.(null);
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) {
        const list = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        list.forEach((m) => {
          materials.add(m);
          const material = m as THREE.MeshBasicMaterial;
          if (material.map) textures.add(material.map);
        });
      }
    });
    Object.values(videoMeshes).forEach((v) => {
      if (v) textures.add(v.texture);
    });
    textures.add(scenery.texture);
    textures.add(overlay.texture);
    textures.forEach((v) => v.dispose());
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    renderer.dispose();
  };
}
