import * as THREE from "three";
import type { AABB } from "./collision";
import {
  GRAVITY, JUMP_VELOCITY, LANE_SWITCH_SHARPNESS, LANE_WIDTH,
  PLAYER_HEIGHT, PLAYER_SLIDE_HEIGHT, PLAYER_WIDTH, SLIDE_TIME,
} from "./config";

export class Player {
  readonly mesh = new THREE.Group();
  private body: THREE.Mesh;

  private lane = 0;          // -1, 0, 1
  private velocityY = 0;
  private slideTimer = 0;
  private runTime = 0;

  constructor() {
    const material = new THREE.MeshStandardMaterial({ color: 0xff5533, roughness: 0.5 });
    // Pivot ayakta olsun diye geometriyi yukarı kaydırıyoruz; kayarken sadece Y ölçeği küçülür.
    const geometry = new THREE.BoxGeometry(PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_WIDTH);
    geometry.translate(0, PLAYER_HEIGHT / 2, 0);
    this.body = new THREE.Mesh(geometry, material);
    this.body.castShadow = true;
    this.mesh.add(this.body);
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
    this.body.scale.set(1, 1, 1);
  }

  moveLane(dir: -1 | 1) {
    this.lane = THREE.MathUtils.clamp(this.lane + dir, -1, 1);
  }

  jump() {
    if (!this.isGrounded) return;
    this.slideTimer = 0;
    this.velocityY = JUMP_VELOCITY;
  }

  slide() {
    // Havadayken aşağı basmak hızlı düşürür, yerdeyken kaydırır.
    if (!this.isGrounded) this.velocityY = Math.min(this.velocityY, -JUMP_VELOCITY);
    this.slideTimer = SLIDE_TIME;
  }

  update(dt: number) {
    this.runTime += dt;
    const pos = this.mesh.position;

    // Şerit değişimi: hedef X'e üstel yumuşatma (kare hızından bağımsız).
    const targetX = this.lane * LANE_WIDTH;
    pos.x += (targetX - pos.x) * (1 - Math.exp(-LANE_SWITCH_SHARPNESS * dt));
    this.mesh.rotation.z = (pos.x - targetX) * 0.08;

    // Zıplama
    this.velocityY += GRAVITY * dt;
    pos.y += this.velocityY * dt;
    if (pos.y <= 0) { pos.y = 0; this.velocityY = 0; }

    // Kayma
    if (this.isGrounded) this.slideTimer = Math.max(0, this.slideTimer - dt);
    const targetScaleY = this.height / PLAYER_HEIGHT;
    this.body.scale.y += (targetScaleY - this.body.scale.y) * (1 - Math.exp(-20 * dt));

    // Koşarken hafif zıplama efekti
    const bob = this.isGrounded && !this.isSliding ? Math.abs(Math.sin(this.runTime * 12)) * 0.08 : 0;
    this.body.position.y = bob;
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
}
