import * as THREE from "three";

export type PowerUpKind = "magnet" | "shield" | "double";

export const POWERUP_SPECS: Record<PowerUpKind, { icon: string; label: string; duration: number; color: number }> = {
  magnet: { icon: "🧲", label: "Mıknatıs", duration: 8, color: 0xe63946 },
  shield: { icon: "🛡️", label: "Kalkan", duration: 10, color: 0x3fa7ff },
  double: { icon: "✖️2", label: "Çift puan", duration: 10, color: 0x7ddc3f },
};
export const POWERUP_KINDS = Object.keys(POWERUP_SPECS) as PowerUpKind[];

/** Aktif power-up'ların kalan sürelerini tutar. */
export class PowerUps {
  private timers = new Map<PowerUpKind, number>();

  reset() { this.timers.clear(); }

  /** Aynı power-up tekrar alınırsa süre baştan başlar. */
  activate(kind: PowerUpKind) {
    this.timers.set(kind, POWERUP_SPECS[kind].duration);
  }

  /** Süresi dolan veya kullanılan power-up'ı kaldırır (ör. kalkan bir darbeyi emince). */
  consume(kind: PowerUpKind) { this.timers.delete(kind); }

  isActive(kind: PowerUpKind) { return this.timers.has(kind); }

  /** Süreleri azaltır, bu karede biten power-up'ları döndürür. */
  update(dt: number): PowerUpKind[] {
    const expired: PowerUpKind[] = [];
    for (const [kind, left] of this.timers) {
      if (left - dt <= 0) {
        this.timers.delete(kind);
        expired.push(kind);
      } else {
        this.timers.set(kind, left - dt);
      }
    }
    return expired;
  }

  /** HUD için: [tür, kalan süre, 0..1 oran] listesi. */
  entries(): { kind: PowerUpKind; left: number; ratio: number }[] {
    return [...this.timers].map(([kind, left]) => ({
      kind, left, ratio: left / POWERUP_SPECS[kind].duration,
    }));
  }
}

// ---- Yoldaki toplanabilir görünümler ----

const glow = (color: number) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.2 });

/** Her tür için farklı silüet: renk körlüğünde de ayırt edilebilsin. */
export function createPowerUpMesh(kind: PowerUpKind): THREE.Group {
  const g = new THREE.Group();
  const color = POWERUP_SPECS[kind].color;

  if (kind === "magnet") {
    // U şeklinde mıknatıs: yarım halka + gümüş uçlar
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.13, 10, 20, Math.PI), glow(color));
    arc.rotation.z = Math.PI;
    g.add(arc);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.3 });
    for (const x of [-0.38, 0.38]) {
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 10), tipMat);
      tip.position.set(x, 0.1, 0);
      g.add(tip);
    }
  } else if (kind === "shield") {
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), glow(color)));
  } else {
    // İki iç içe kutu: "x2" hissi
    for (const [i, s] of [0.5, 0.32].entries()) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), glow(color));
      box.rotation.set(Math.PI / 4, Math.PI / 4, 0);
      box.position.x = i === 0 ? -0.18 : 0.25;
      g.add(box);
    }
  }

  // Altında yerde parlayan halka: uzaktan fark edilsin
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.75, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  ring.position.y = -0.95;
  ring.name = "ring";
  g.add(ring);

  g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.name !== "ring") o.castShadow = true; });
  return g;
}
