import * as THREE from "three";
import { intersects, type AABB } from "./collision";
import { Decor } from "./Decor";
import { DESPAWN_Z, LANES, LANE_WIDTH, MAX_ROW_GAP, MIN_ROW_GAP, SPAWN_Z } from "./config";

/**
 * wall:    şerit değiştirmek zorundasın
 * barrier: alçak engel, üstünden zıpla
 * bar:     yüksek çubuk, altından kay
 */
type ObstacleKind = "wall" | "barrier" | "bar";

interface Obstacle { kind: ObstacleKind; mesh: THREE.Mesh; size: THREE.Vector3; active: boolean; }
interface Coin { mesh: THREE.Mesh; active: boolean; }

const OBSTACLE_SPECS: Record<ObstacleKind, { size: [number, number, number]; y: number; color: number }> = {
  wall:    { size: [2.4, 3.0, 1.2], y: 1.5,  color: 0x3355aa },
  barrier: { size: [2.4, 1.0, 0.6], y: 0.5,  color: 0xddaa22 },
  bar:     { size: [2.6, 0.5, 0.5], y: 1.55, color: 0xcc2255 },
};
const OBSTACLE_KINDS = Object.keys(OBSTACLE_SPECS) as ObstacleKind[];
const COIN_SIZE = new THREE.Vector3(0.7, 0.7, 0.7);

export class World {
  readonly group = new THREE.Group();
  private obstacles: Obstacle[] = [];
  private coins: Coin[] = [];
  private groundTexture: THREE.CanvasTexture;
  private decor = new Decor();
  private distanceToNextRow = 0;

  private coinGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.1, 20).rotateX(Math.PI / 2);
  private coinMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd700, metalness: 0.6, roughness: 0.3, emissive: 0x332200,
  });

  constructor() {
    this.groundTexture = createGroundTexture();
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(LANE_WIDTH * 3, 200),
      new THREE.MeshStandardMaterial({ map: this.groundTexture }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.z = -80;
    road.receiveShadow = true;
    this.group.add(road);

    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x5ca94a }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.01;
    grass.receiveShadow = true;
    this.group.add(grass);

    this.group.add(this.decor.group);
  }

  reset() {
    for (const o of this.obstacles) deactivate(o);
    for (const c of this.coins) deactivate(c);
    this.distanceToNextRow = 40; // başlangıçta biraz nefes alanı
  }

  update(dt: number, speed: number, time: number) {
    const dz = speed * dt;

    // Zemin dokusunu kaydırarak hareket hissi
    this.groundTexture.offset.y += (dz / 200) * this.groundTexture.repeat.y;
    this.decor.update(dz);

    for (const o of this.obstacles) {
      if (!o.active) continue;
      o.mesh.position.z += dz;
      if (o.mesh.position.z > DESPAWN_Z) deactivate(o);
    }
    for (const c of this.coins) {
      if (!c.active) continue;
      c.mesh.position.z += dz;
      c.mesh.rotation.y = time * 4;
      if (c.mesh.position.z > DESPAWN_Z) deactivate(c);
    }

    this.distanceToNextRow -= dz;
    if (this.distanceToNextRow <= 0) {
      this.spawnRow(SPAWN_Z);
      // Hız arttıkça sıralar arası mesafe de artar ki tepki süresi korunsun
      this.distanceToNextRow = THREE.MathUtils.randFloat(MIN_ROW_GAP, MAX_ROW_GAP) * Math.sqrt(speed / 18);
    }
  }

  hitsObstacle(player: AABB): boolean {
    return this.obstacles.some((o) => o.active && intersects(player, boundsOf(o.mesh.position, o.size)));
  }

  /** Oyuncunun değdiği altınları toplar ve sayısını döndürür. */
  collectCoins(player: AABB): number {
    let collected = 0;
    for (const c of this.coins) {
      if (c.active && intersects(player, boundsOf(c.mesh.position, COIN_SIZE))) {
        deactivate(c);
        collected++;
      }
    }
    return collected;
  }

  private spawnRow(z: number) {
    // En az bir şerit her zaman tamamen boş kalsın
    const lanes = [...LANES].sort(() => Math.random() - 0.5);
    const blockedCount = Math.random() < 0.35 ? 2 : 1;

    for (const lane of lanes.slice(0, blockedCount)) {
      const kind = OBSTACLE_KINDS[Math.floor(Math.random() * OBSTACLE_KINDS.length)];
      this.spawnObstacle(kind, lane, z);
    }

    if (Math.random() < 0.6) {
      const free = lanes[blockedCount];
      for (let i = 0; i < 5; i++) this.spawnCoin(free, z + 6 - i * 2.5);
    }
  }

  private spawnObstacle(kind: ObstacleKind, lane: number, z: number) {
    let o = this.obstacles.find((x) => !x.active && x.kind === kind);
    if (!o) {
      const spec = OBSTACLE_SPECS[kind];
      const size = new THREE.Vector3(...spec.size);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.y, size.z),
        new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.6 }),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.y = spec.y;
      o = { kind, mesh, size, active: false };
      this.obstacles.push(o);
      this.group.add(mesh);
    }
    activate(o, lane, z);
  }

  private spawnCoin(lane: number, z: number) {
    let c = this.coins.find((x) => !x.active);
    if (!c) {
      const mesh = new THREE.Mesh(this.coinGeometry, this.coinMaterial);
      mesh.castShadow = true;
      mesh.position.y = 0.9;
      c = { mesh, active: false };
      this.coins.push(c);
      this.group.add(mesh);
    }
    activate(c, lane, z);
  }
}

// Nesne havuzu: mesh'ler silinmez, gizlenip tekrar kullanılır.
function activate(item: { mesh: THREE.Mesh; active: boolean }, lane: number, z: number) {
  item.mesh.position.x = lane * LANE_WIDTH;
  item.mesh.position.z = z;
  item.mesh.visible = true;
  item.active = true;
}

function deactivate(item: { mesh: THREE.Mesh; active: boolean }) {
  item.active = false;
  item.mesh.visible = false;
}

function boundsOf(center: THREE.Vector3, size: THREE.Vector3): AABB {
  return {
    minX: center.x - size.x / 2, maxX: center.x + size.x / 2,
    minY: center.y - size.y / 2, maxY: center.y + size.y / 2,
    minZ: center.z - size.z / 2, maxZ: center.z + size.z / 2,
  };
}

/** Şerit çizgili asfalt dokusu (dış dosya gerektirmeden canvas ile). */
function createGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#555a60";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#3f4348";
  ctx.fillRect(0, 0, 6, 256);
  ctx.fillRect(250, 0, 6, 256);
  ctx.fillStyle = "#e8e8e8";
  for (const x of [256 / 3, (256 * 2) / 3]) ctx.fillRect(x - 3, 0, 6, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 40);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
