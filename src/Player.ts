import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { AABB } from "./collision";
import {
  GRAVITY, JUMP_VELOCITY, LANE_SWITCH_SHARPNESS, LANE_WIDTH,
  PLAYER_HEIGHT, PLAYER_SLIDE_HEIGHT, PLAYER_WIDTH, SLIDE_TIME, START_SPEED,
} from "./config";

const MODEL_URL = "/models/RobotExpressive.glb";

/** Modeldeki klip adları (RobotExpressive). */
type Clip = "Idle" | "Running" | "Jump" | "Death";

export class Player {
  readonly mesh = new THREE.Group();
  /** Görsel kısım; kayarken sadece bu ezilir, fizik pozisyonu mesh'te kalır. */
  private visual = new THREE.Group();

  private mixer: THREE.AnimationMixer;
  private actions: Record<Clip, THREE.AnimationAction>;
  private current: THREE.AnimationAction | null = null;

  private lane = 0;          // -1, 0, 1
  private velocityY = 0;
  private slideTimer = 0;

  static async load(): Promise<Player> {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    return new Player(gltf);
  }

  private constructor(gltf: GLTF) {
    const model = gltf.scene;
    model.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });

    // Modeli oyuncu boyuna ölçekle, ayakları y=0'a oturt ve yolun ilerisine (-Z) döndür.
    const box = new THREE.Box3().setFromObject(model);
    const scale = PLAYER_HEIGHT / (box.max.y - box.min.y);
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;
    model.rotation.y = Math.PI;

    this.visual.add(model);
    this.mesh.add(this.visual);

    this.mixer = new THREE.AnimationMixer(model);
    const clip = (name: Clip) => {
      const c = THREE.AnimationClip.findByName(gltf.animations, name);
      if (!c) throw new Error(`Animasyon bulunamadı: ${name}`);
      return this.mixer.clipAction(c);
    };
    this.actions = { Idle: clip("Idle"), Running: clip("Running"), Jump: clip("Jump"), Death: clip("Death") };
    for (const a of [this.actions.Jump, this.actions.Death]) {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }

    this.play("Idle", 0);
  }

  get isGrounded() { return this.mesh.position.y <= 0; }
  get isSliding() { return this.slideTimer > 0; }
  get height() { return this.isSliding ? PLAYER_SLIDE_HEIGHT : PLAYER_HEIGHT; }

  reset() {
    this.lane = 0;
    this.velocityY = 0;
    this.slideTimer = 0;
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    this.visual.scale.set(1, 1, 1);
    this.play("Idle");
  }

  run() { this.play("Running"); }
  die() { this.play("Death", 0.1); }

  moveLane(dir: -1 | 1) {
    this.lane = THREE.MathUtils.clamp(this.lane + dir, -1, 1);
  }

  jump() {
    if (!this.isGrounded) return;
    this.slideTimer = 0;
    this.velocityY = JUMP_VELOCITY;
    // Klibi havada kalma süresine sığdır
    const airTime = (2 * JUMP_VELOCITY) / -GRAVITY;
    this.actions.Jump.timeScale = this.actions.Jump.getClip().duration / airTime;
    this.play("Jump", 0.08);
  }

  slide() {
    // Havadayken aşağı basmak hızlı düşürür, yerdeyken kaydırır.
    if (!this.isGrounded) this.velocityY = Math.min(this.velocityY, -JUMP_VELOCITY);
    this.slideTimer = SLIDE_TIME;
  }

  /** Fizik ve hareket; sadece oyun oynanırken çağrılır. */
  update(dt: number, speed: number) {
    const pos = this.mesh.position;

    // Şerit değişimi: hedef X'e üstel yumuşatma (kare hızından bağımsız).
    const targetX = this.lane * LANE_WIDTH;
    pos.x += (targetX - pos.x) * (1 - Math.exp(-LANE_SWITCH_SHARPNESS * dt));
    this.mesh.rotation.z = (pos.x - targetX) * 0.08;

    // Zıplama
    const wasGrounded = this.isGrounded;
    this.velocityY += GRAVITY * dt;
    pos.y += this.velocityY * dt;
    if (pos.y <= 0) { pos.y = 0; this.velocityY = 0; }
    if (!wasGrounded && this.isGrounded) this.play("Running", 0.1);

    // Kayma: modeli ezerek ve geriye yatırarak
    if (this.isGrounded) this.slideTimer = Math.max(0, this.slideTimer - dt);
    const k = 1 - Math.exp(-20 * dt);
    this.visual.scale.y += (this.height / PLAYER_HEIGHT - this.visual.scale.y) * k;
    this.visual.rotation.x += ((this.isSliding ? 0.35 : 0) - this.visual.rotation.x) * k;

    // Koşu animasyonu hızla birlikte hızlansın
    this.actions.Running.timeScale = 1 + 0.6 * (speed / START_SPEED - 1);
  }

  /** Animasyon karıştırıcı; menü ve oyun sonu dahil her karede çağrılır. */
  animate(dt: number) {
    this.mixer.update(dt);
  }

  getBounds(): AABB {
    const { x, y, z } = this.mesh.position;
    const half = (PLAYER_WIDTH / 2) * 0.85; // biraz affedici hitbox
    return {
      minX: x - half, maxX: x + half,
      minY: y, maxY: y + this.height,
      minZ: z - half, maxZ: z + half,
    };
  }

  private play(name: Clip, fade = 0.2) {
    const next = this.actions[name];
    if (next === this.current) return;
    next.reset().play();
    if (this.current) next.crossFadeFrom(this.current, fade, false);
    this.current = next;
  }
}
