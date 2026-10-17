import * as THREE from "three";
import { DESPAWN_Z, LANE_WIDTH, SPAWN_Z } from "./config";

/**
 * Yol kenarı dekorları. Sabit sayıda "slot" yolla birlikte kamera tarafına akar;
 * kameranın arkasına geçen slot en uzağa sarılır ve içine yeni rastgele bir obje konur.
 * Tüm geometri ve materyaller paylaşımlı, yani obje başına sadece hafif Mesh nesneleri oluşur.
 */

const ROAD_EDGE = (LANE_WIDTH * 3) / 2;
const TRACK_START = SPAWN_Z - 20;
const TRACK_LENGTH = DESPAWN_Z - TRACK_START;

const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });

const M = {
  trunk:   mat(0x7a5230),
  leaves:  [mat(0x3f9b3a), mat(0x58b847), mat(0x2f7d3b)],
  pine:    mat(0x2e6b3f),
  bush:    mat(0x4f9e3c),
  rock:    mat(0x8c8f94),
  walls:   [mat(0xf2e6d0), mat(0xe8c39e), mat(0xc9d6df), mat(0xf5d1d1)],
  roof:    [mat(0xb5483b), mat(0x5a6e8c), mat(0x8a5a3c)],
  window:  mat(0x9fd3ff, { emissive: 0x223344 }),
  pole:    mat(0x3a3d42, { roughness: 0.5, metalness: 0.4 }),
  lamp:    mat(0xfff3c4, { emissive: 0xffe9a0, emissiveIntensity: 0.8 }),
  cloud:   mat(0xffffff, { roughness: 1 }),
};

const G = {
  trunk:   new THREE.CylinderGeometry(0.15, 0.22, 1.4, 6).translate(0, 0.7, 0),
  crown:   new THREE.IcosahedronGeometry(1, 0),
  cone:    new THREE.ConeGeometry(1, 1.6, 7),
  bush:    new THREE.IcosahedronGeometry(0.6, 0),
  rock:    new THREE.DodecahedronGeometry(0.5, 0),
  box:     new THREE.BoxGeometry(1, 1, 1),
  roof:    new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4),
  pole:    new THREE.CylinderGeometry(0.06, 0.08, 4, 6).translate(0, 2, 0),
  arm:     new THREE.BoxGeometry(0.9, 0.08, 0.08),
  bulb:    new THREE.BoxGeometry(0.35, 0.12, 0.25),
  puff:    new THREE.IcosahedronGeometry(1, 1),
};

const rand = THREE.MathUtils.randFloat;
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, shadow = true) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

// ---- Obje üreticileri (hepsi tabanı y=0'da olan bir Group döndürür) ----

function tree() {
  const g = new THREE.Group();
  g.add(mesh(G.trunk, M.trunk));
  const crown = mesh(G.crown, pick(M.leaves));
  crown.position.y = 2;
  crown.scale.set(1.1, 1.2, 1.1);
  g.add(crown);
  g.scale.setScalar(rand(0.8, 1.5));
  return g;
}

function pine() {
  const g = new THREE.Group();
  g.add(mesh(G.trunk, M.trunk));
  for (let i = 0; i < 3; i++) {
    const c = mesh(G.cone, M.pine);
    c.position.y = 1.6 + i * 0.75;
    c.scale.setScalar(1 - i * 0.25);
    g.add(c);
  }
  g.scale.setScalar(rand(0.9, 1.6));
  return g;
}

function bush() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = mesh(G.bush, M.bush);
    b.position.set(rand(-0.5, 0.5), 0.35, rand(-0.5, 0.5));
    b.scale.setScalar(rand(0.7, 1.1));
    g.add(b);
  }
  return g;
}

function rock() {
  const r = mesh(G.rock, M.rock);
  r.scale.set(rand(0.6, 1.4), rand(0.4, 0.9), rand(0.6, 1.4));
  r.position.y = 0.2;
  r.rotation.y = rand(0, Math.PI);
  const g = new THREE.Group();
  g.add(r);
  return g;
}

function house(facing: number) {
  const g = new THREE.Group();
  const w = rand(3, 5), h = rand(2.5, 5), d = rand(3, 5);

  const body = mesh(G.box, pick(M.walls));
  body.scale.set(w, h, d);
  body.position.y = h / 2;
  g.add(body);

  const roof = mesh(G.roof, pick(M.roof));
  roof.scale.set(w * 1.05, rand(1.2, 2), d * 1.05);
  roof.position.y = h + roof.scale.y / 2;
  g.add(roof);

  // Yola bakan cephede pencere sırası
  const floors = Math.max(1, Math.floor(h / 1.6));
  for (let f = 0; f < floors; f++) {
    for (const z of [-d / 4, d / 4]) {
      const win = mesh(G.box, M.window, false);
      win.scale.set(0.05, 0.6, 0.7);
      win.position.set((facing * w) / 2, 1 + f * 1.5, z);
      g.add(win);
    }
  }
  return g;
}

function lamp(side: number) {
  const g = new THREE.Group();
  g.add(mesh(G.pole, M.pole));
  const arm = mesh(G.arm, M.pole);
  arm.position.set(-side * 0.4, 3.95, 0);
  g.add(arm);
  const bulb = mesh(G.bulb, M.lamp, false);
  bulb.position.set(-side * 0.75, 3.85, 0);
  g.add(bulb);
  return g;
}

function cloud() {
  const g = new THREE.Group();
  const puffs = Math.floor(rand(3, 6));
  for (let i = 0; i < puffs; i++) {
    const p = mesh(G.puff, M.cloud, false);
    p.position.set(i * 1.6 - puffs * 0.8, rand(-0.3, 0.4), rand(-0.6, 0.6));
    p.scale.setScalar(rand(1.1, 1.9));
    g.add(p);
  }
  return g;
}

// ---- Bantlar: her bant kendi slotlarını ve obje seçimini yönetir ----

interface Band {
  count: number;
  /** Yol ile aynı hızda akma oranı (bulutlar için < 1, paralaks). */
  parallax: number;
  place(slot: THREE.Group, side: number): void;
}

const BANDS: Band[] = [
  {
    // Yol kenarı lambaları: düzenli aralıklı, her iki tarafta
    count: 8,
    parallax: 1,
    place(slot, side) {
      slot.add(lamp(side));
      slot.position.x = side * (ROAD_EDGE + 0.8);
    },
  },
  {
    // Yakın bant: ağaç, çalı, kaya
    count: 22,
    parallax: 1,
    place(slot, side) {
      slot.add(pick([tree, tree, pine, bush, bush, rock])());
      slot.position.x = side * rand(ROAD_EDGE + 2.5, ROAD_EDGE + 10);
    },
  },
  {
    // Uzak bant: evler ve iri ağaçlar
    count: 14,
    parallax: 1,
    place(slot, side) {
      const builder = Math.random() < 0.5 ? () => house(-side) : pick([tree, pine]);
      slot.add(builder());
      slot.position.x = side * rand(ROAD_EDGE + 12, ROAD_EDGE + 30);
      slot.rotation.y = builder === tree || builder === pine ? rand(0, Math.PI) : 0;
    },
  },
  {
    // Gökyüzü: yavaş akan bulutlar
    count: 6,
    parallax: 0.15,
    place(slot, side) {
      slot.add(cloud());
      slot.position.x = side * rand(5, 45);
      slot.position.y = rand(18, 28);
    },
  },
];

interface Slot { group: THREE.Group; band: Band; side: number; }

export class Decor {
  readonly group = new THREE.Group();
  private slots: Slot[] = [];

  constructor() {
    for (const band of BANDS) {
      for (const side of [-1, 1]) {
        for (let i = 0; i < band.count; i++) {
          const slot: Slot = { group: new THREE.Group(), band, side };
          // Lambalar eşit aralıklı, diğerleri rastgele dağılsın
          const t = band === BANDS[0] ? i / band.count : Math.random();
          this.fill(slot, TRACK_START + t * TRACK_LENGTH);
          this.slots.push(slot);
          this.group.add(slot.group);
        }
      }
    }
  }

  update(dz: number) {
    for (const slot of this.slots) {
      const g = slot.group;
      g.position.z += dz * slot.band.parallax;
      if (g.position.z > DESPAWN_Z) this.fill(slot, g.position.z - TRACK_LENGTH);
    }
  }

  private fill(slot: Slot, z: number) {
    const g = slot.group;
    g.clear();
    g.position.set(0, 0, z);
    g.rotation.set(0, 0, 0);
    slot.band.place(g, slot.side);
  }
}
