import * as THREE from "three";
import type { ShowState } from "@/lib/contracts";
import { canvasTexture, CORAL, GOLD, PAPER, TEAL } from "./scene-art";

export function makeParcel() {
  const group = new THREE.Group();
  group.name = "persistent-midnight-parcel";
  const kraft = new THREE.MeshStandardMaterial({
    color: "#c99667",
    roughness: 0.94,
  });
  const edge = new THREE.MeshStandardMaterial({
    color: "#aa7854",
    roughness: 0.94,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(192, 126, 96), [
    edge,
    edge,
    kraft,
    edge,
    kraft,
    edge,
  ]);
  body.position.y = 58;
  group.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(206, 17, 106), kraft);
  lid.position.y = 129;
  group.add(lid);
  const ribbon = new THREE.MeshBasicMaterial({ color: CORAL });
  const vertical = new THREE.Mesh(new THREE.PlaneGeometry(13, 127), ribbon);
  vertical.position.set(-14, 58, 49);
  group.add(vertical);
  const horizontal = new THREE.Mesh(new THREE.PlaneGeometry(194, 12), ribbon);
  horizontal.position.set(0, 70, 50);
  group.add(horizontal);
  const tagArt = canvasTexture(256, 160);
  const tag = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 62.5),
    new THREE.MeshBasicMaterial({ map: tagArt.texture, transparent: true }),
  );
  tag.position.set(44, 100, 54);
  tag.rotation.z = -0.13;
  group.add(tag);
  const cord = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-14, 132, 55),
      new THREE.Vector3(17, 132, 55),
      new THREE.Vector3(36, 116, 55),
    ]),
    new THREE.LineBasicMaterial({ color: "#e4ce9f" }),
  );
  group.add(cord);
  const creaseMaterial = new THREE.LineBasicMaterial({
    color: "#744d40",
    transparent: true,
    opacity: 0.5,
  });
  const creases = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-95, 120, 50),
      new THREE.Vector3(-68, 93, 50),
      new THREE.Vector3(-95, 101, 50),
      new THREE.Vector3(-77, 107, 50),
      new THREE.Vector3(96, -5, 50),
      new THREE.Vector3(70, 16, 50),
      new THREE.Vector3(82, -5, 50),
      new THREE.Vector3(92, 23, 50),
    ]),
    creaseMaterial,
  );
  group.add(creases);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(172, 35),
    new THREE.MeshBasicMaterial({
      color: GOLD,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }),
  );
  glow.position.set(0, 121, 52);
  group.add(glow);
  let lastTag = "";
  return {
    group,
    update(show: ShowState, now: number, calm: boolean) {
      const parcel = show.parcel;
      if (!parcel) return;
      const key = `${parcel.tag}:${parcel.stamped}`;
      if (key !== lastTag) {
        lastTag = key;
        const ctx = tagArt.ctx;
        ctx.clearRect(0, 0, 256, 160);
        ctx.fillStyle = PAPER;
        ctx.beginPath();
        ctx.moveTo(0, 12);
        ctx.lineTo(220, 12);
        ctx.lineTo(254, 78);
        ctx.lineTo(220, 148);
        ctx.lineTo(0, 148);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#9d6a51";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = "#503e42";
        ctx.textAlign = "left";
        ctx.font = "16px Inter, Arial";
        ctx.fillText("MIDNIGHT POST", 15, 43);
        ctx.font = "25px Fraunces, Georgia";
        ctx.fillText(parcel.tag.slice(0, 16), 15, 80, 190);
        ctx.font = "13px Inter, Arial";
        ctx.fillText("KEEP THIS TAG", 15, 125);
        if (parcel.stamped) {
          ctx.strokeStyle = CORAL;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(204, 112, 25, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = CORAL;
          ctx.font = "28px Georgia";
          ctx.textAlign = "center";
          ctx.fillText("☾", 204, 123);
        }
        tagArt.texture.needsUpdate = true;
      }
      const open = parcel.opened
        ? calm
          ? 1
          : Math.min(1, Math.max(0, (now - (parcel.openedAt || now)) / 900))
        : 0;
      lid.position.set(-35 * open, 129 + open * 58, 0);
      lid.rotation.z = -0.23 * open;
      glow.visible = parcel.opened;
      (glow.material as THREE.MeshBasicMaterial).color.set(
        parcel.contents === "garden" ? TEAL : GOLD,
      );
      creases.visible = parcel.damage > 0;
      creaseMaterial.opacity = Math.min(0.85, 0.25 + parcel.damage * 0.6);
      tag.rotation.z = -0.13 + (calm ? 0 : Math.sin(now / 1300) * 0.018);
    },
  };
}
