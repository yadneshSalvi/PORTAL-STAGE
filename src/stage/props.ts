import * as THREE from "three";
import { CORAL, GOLD, PAPER, TEAL } from "./scene-art";

function flat(color: string) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
}
function ellipse(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  material: THREE.Material,
) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}
export const UMBRELLA_GRIP = { x: 0, y: -100, z: 12 } as const;
export function makeUmbrella() {
  const group = new THREE.Group();
  const cream = flat("#E9DBB7"),
    teal = flat("#73BDB0"),
    darkTeal = flat("#418F85"),
    coral = flat(CORAL),
    brass = flat(GOLD);
  const canopy = new THREE.Shape();
  canopy.moveTo(-155, 0);
  canopy.bezierCurveTo(-122, 88, -52, 114, 0, 116);
  canopy.bezierCurveTo(52, 114, 122, 88, 155, 0);
  for (let i = 5; i >= 0; i--) {
    const right = -155 + ((i + 1) / 6) * 310,
      left = -155 + (i / 6) * 310;
    canopy.quadraticCurveTo((left + right) / 2, 22, left, 0);
  }
  canopy.closePath();
  const mesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(canopy, {
      depth: 8,
      bevelEnabled: true,
      bevelSize: 2,
      bevelThickness: 2,
      bevelSegments: 2,
      steps: 1,
    }),
    cream,
  );
  group.add(mesh);
  const wedge = new THREE.Shape();
  wedge.moveTo(0, 116);
  wedge.bezierCurveTo(-45, 86, -62, 32, -52, 0);
  wedge.quadraticCurveTo(-26, 22, 0, 0);
  wedge.quadraticCurveTo(26, 22, 52, 0);
  wedge.bezierCurveTo(62, 32, 45, 86, 0, 116);
  const colored = new THREE.Mesh(new THREE.ShapeGeometry(wedge), teal);
  colored.position.z = 11;
  group.add(colored);
  const edge = new THREE.Shape();
  edge.moveTo(0, 116);
  edge.bezierCurveTo(55, 112, 125, 80, 155, 0);
  edge.quadraticCurveTo(130, 22, 103, 0);
  edge.bezierCurveTo(105, 50, 66, 100, 0, 116);
  const side = new THREE.Mesh(new THREE.ShapeGeometry(edge), darkTeal);
  side.position.z = 12;
  group.add(side);
  const patch = new THREE.Shape();
  patch.moveTo(51, 43);
  patch.lineTo(83, 54);
  patch.lineTo(103, 25);
  patch.lineTo(68, 13);
  patch.closePath();
  const patchMesh = new THREE.Mesh(new THREE.ShapeGeometry(patch), coral);
  patchMesh.position.z = 15;
  group.add(patchMesh);
  const stitches: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const x = 56 + i * 8;
    stitches.push(
      new THREE.Vector3(x, 42 + i * 2.9, 17),
      new THREE.Vector3(x + 3, 37 + i * 2.9, 17),
    );
    const x2 = 70 + i * 8;
    stitches.push(
      new THREE.Vector3(x2, 18 + i * 2.8, 17),
      new THREE.Vector3(x2 + 3, 23 + i * 2.8, 17),
    );
  }
  group.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(stitches),
      new THREE.LineBasicMaterial({ color: PAPER }),
    ),
  );
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 137, 12),
    brass,
  );
  shaft.position.set(0, -66, 12);
  group.add(shaft);
  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(19, 4, 10, 28, Math.PI),
    brass,
  );
  hook.rotation.z = Math.PI;
  hook.position.set(19, -133, 12);
  group.add(hook);
  const spike = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 14, 10), brass);
  spike.position.set(0, 122, 5);
  group.add(spike);
  const droplets = new THREE.Group();
  const water = flat(TEAL);
  for (let i = 0; i < 9; i++) {
    const drop = ellipse(-134 + i * 32, -10 - (i % 3) * 12, 18, 3, 6, 3, water);
    droplets.add(drop);
  }
  group.add(droplets);
  const gripRoot = new THREE.Group();
  gripRoot.name = "umbrella-grip";
  group.name = "umbrella-authored-body";
  group.position.set(-UMBRELLA_GRIP.x, -UMBRELLA_GRIP.y, -UMBRELLA_GRIP.z);
  gripRoot.add(group);
  return { group: gripRoot, body: group, droplets };
}
export function makePip() {
  const group = new THREE.Group();
  const skin = flat("#9CDEBD"),
    shade = flat("#60A996"),
    ink = new THREE.MeshBasicMaterial({ color: "#182D35" }),
    glint = new THREE.MeshBasicMaterial({ color: PAPER }),
    blush = flat(CORAL);
  group.add(ellipse(0, 31, 0, 40, 43, 23, skin));
  const earA = ellipse(-24, 72, -2, 12, 29, 10, shade);
  earA.rotation.z = 0.45;
  const earB = ellipse(24, 72, -2, 12, 29, 10, shade);
  earB.rotation.z = -0.45;
  group.add(earA, earB);
  for (const x of [-14, 14]) {
    group.add(ellipse(x, 36, 22, 5, 7, 3, ink));
    group.add(ellipse(x - 1.3, 38, 25, 1.7, 2.1, 1, glint));
    group.add(ellipse(x * 1.8, 24, 20, 7, 4, 2, blush));
    const foot = ellipse(x * 1.4, -6, 7, 12, 6, 11, shade);
    group.add(foot);
  }
  group.add(ellipse(-16, 58, 17, 11, 4, 2, glint));
  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(6, 1.2, 6, 14, Math.PI),
    ink,
  );
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, 23, 25);
  group.add(mouth);
  const tail = new THREE.Mesh(
    new THREE.TorusGeometry(15, 4, 8, 24, Math.PI * 1.55),
    shade,
  );
  tail.position.set(39, 13, -6);
  tail.rotation.z = -0.8;
  group.add(tail);
  return group;
}
