import * as THREE from "three";
import { MAX_SPEED, SPEED_GAIN, START_SPEED } from "./config";
import { Input } from "./input";
import { Player } from "./Player";
import { POWERUP_SPECS, PowerUps, type PowerUpKind } from "./PowerUps";
import { Sound } from "./Sound";
import { World } from "./World";

type State = "menu" | "playing" | "over";

export class Game {
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
  private timer = new THREE.Timer();

  private input = new Input();
  private world = new World();
  private sound = new Sound();
  private powerUps = new PowerUps();

  private state: State = "menu";
  private speed = START_SPEED;
  private score = 0;
  private coins = 0;
  /** Kalkan bir darbeyi emdikten sonraki kısa dokunulmazlık süresi. */
  private invulnerable = 0;
  private magnetTarget = new THREE.Vector3();
  private best = Number(localStorage.getItem("runner.best") ?? 0);

  private hud = {
    score: document.getElementById("score")!,
    coins: document.getElementById("coins")!,
    overlay: document.getElementById("overlay")!,
    title: document.getElementById("title")!,
    subtitle: document.getElementById("subtitle")!,
    mute: document.getElementById("mute")!,
    powerups: document.getElementById("powerups")!,
  };
  private powerUpChips = new Map<PowerUpKind, { el: HTMLElement; bar: HTMLElement }>();

  /** Model gibi asenkron kaynakları yükleyip oyunu kurar. */
  static async create(): Promise<Game> {
    return new Game(await Player.load());
  }

  private constructor(private player: Player) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    const sky = new THREE.Color(0x87ceeb);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 60, 140);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x446644, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -40, far: 60 });
    sun.target.position.set(0, 0, -10);
    this.scene.add(sun, sun.target);

    this.camera.position.set(0, 5, 9);
    this.camera.lookAt(0, 1, -6);

    this.scene.add(this.world.group, this.player.mesh);
    this.reset();

    // Butona basmak oyunu başlatmasın diye pointerdown'ı Input'a ulaştırmıyoruz
    this.hud.mute.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.hud.mute.addEventListener("click", () => this.toggleMute());
    this.updateMuteButton();

    // Geliştirirken konsoldan denemek için: game.onPowerUp("shield") gibi
    if (import.meta.env.DEV) Object.assign(window, { game: this });

    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop((t) => this.tick(t));
  }

  private reset() {
    this.speed = START_SPEED;
    this.score = 0;
    this.coins = 0;
    this.invulnerable = 0;
    this.powerUps.reset();
    this.player.reset();
    this.world.reset();
    this.updateHud();
  }

  private start() {
    if (this.state === "over") this.reset();
    this.state = "playing";
    this.player.run();
    this.sound.unlock();
    this.sound.startMusic();
    this.hud.overlay.classList.add("hidden");
  }

  private gameOver() {
    this.state = "over";
    this.player.die();
    this.sound.crash();
    this.sound.stopMusic();
    const score = Math.floor(this.score);
    if (score > this.best) {
      this.best = score;
      localStorage.setItem("runner.best", String(score));
    }
    this.hud.title.textContent = "OYUN BİTTİ";
    this.hud.subtitle.textContent = `Skor: ${score} · En iyi: ${this.best}`;
    this.hud.overlay.classList.remove("hidden");
  }

  private tick(time: number) {
    this.timer.update(time);
    // Sekme arka plandan dönünce dev bir dt gelmesin
    const dt = Math.min(this.timer.getDelta(), 1 / 30);
    const elapsed = this.timer.getElapsed();

    for (const action of this.input.drain()) {
      if (action === "mute") { this.toggleMute(); continue; }
      if (this.state !== "playing") {
        if (action === "start") this.start();
        continue;
      }
      if (action === "left" || action === "right") {
        if (this.player.moveLane(action === "left" ? -1 : 1)) this.sound.lane();
      } else if (action === "jump") {
        if (this.player.jump()) this.sound.jump();
      } else if (action === "slide") {
        this.player.slide();
        this.sound.slide();
      }
    }

    if (this.state === "playing") {
      this.speed = Math.min(MAX_SPEED, this.speed + SPEED_GAIN * dt);
      const multiplier = this.powerUps.isActive("double") ? 2 : 1;
      this.score += this.speed * dt * multiplier;
      this.sound.setTempo(this.speed / START_SPEED);

      this.player.update(dt, this.speed);
      this.world.update(dt, this.speed, elapsed);

      for (const kind of this.powerUps.update(dt)) this.onPowerUpEnd(kind);
      if (this.powerUps.isActive("magnet")) {
        const p = this.player.mesh.position;
        this.world.attractCoins(this.magnetTarget.set(p.x, p.y + 0.9, p.z), dt);
      }

      const bounds = this.player.getBounds();
      const collected = this.world.collectCoins(bounds);
      if (collected > 0) {
        this.coins += collected;
        this.score += collected * 10 * multiplier;
        this.sound.coin();
      }
      for (const kind of this.world.collectPowerUps(bounds)) this.onPowerUp(kind);

      this.invulnerable = Math.max(0, this.invulnerable - dt);
      this.player.setVisible(this.invulnerable === 0 || Math.floor(elapsed * 16) % 2 === 0);
      if (this.invulnerable === 0 && this.world.hitsObstacle(bounds)) {
        if (this.powerUps.isActive("shield")) this.absorbHit(bounds);
        else this.gameOver();
      }

      this.updateHud();
    }

    this.player.animate(dt);

    // Kamera oyuncuyu yatayda yumuşakça takip eder
    const camTargetX = this.player.mesh.position.x * 0.5;
    this.camera.position.x += (camTargetX - this.camera.position.x) * (1 - Math.exp(-6 * dt));

    this.renderer.render(this.scene, this.camera);
  }

  private onPowerUp(kind: PowerUpKind) {
    this.powerUps.activate(kind);
    if (kind === "shield") this.player.setShield(true);
    this.sound.powerUp();
  }

  private onPowerUpEnd(kind: PowerUpKind) {
    if (kind === "shield") this.player.setShield(false);
    this.sound.powerDown();
  }

  private absorbHit(bounds: ReturnType<Player["getBounds"]>) {
    this.powerUps.consume("shield");
    this.player.setShield(false);
    this.world.smashObstacles(bounds);
    this.invulnerable = 1;
    this.sound.shieldBreak();
  }

  private toggleMute() {
    this.sound.unlock();
    this.sound.toggleMute();
    this.updateMuteButton();
  }

  private updateMuteButton() {
    this.hud.mute.textContent = this.sound.isMuted ? "🔇" : "🔊";
    const label = this.sound.isMuted ? "Sesi aç (M)" : "Sesi kapat (M)";
    this.hud.mute.title = label;
    this.hud.mute.setAttribute("aria-label", label);
  }

  private updateHud() {
    this.hud.score.textContent = String(Math.floor(this.score));
    this.hud.coins.textContent = `🪙 ${this.coins}`;
    this.updatePowerUpHud();
  }

  /** Aktif power-up'lar için süre çubuklu rozetler; DOM sadece değişince güncellenir. */
  private updatePowerUpHud() {
    const active = this.powerUps.entries();
    for (const [kind, chip] of this.powerUpChips) {
      if (!active.some((a) => a.kind === kind)) {
        chip.el.remove();
        this.powerUpChips.delete(kind);
      }
    }
    for (const { kind, ratio } of active) {
      let chip = this.powerUpChips.get(kind);
      if (!chip) {
        const spec = POWERUP_SPECS[kind];
        const el = document.createElement("div");
        el.className = "powerup";
        el.style.setProperty("--c", `#${spec.color.toString(16).padStart(6, "0")}`);
        el.innerHTML = `<span class="icon">${spec.icon}</span><span class="name">${spec.label}</span><span class="track"><span class="bar"></span></span>`;
        chip = { el, bar: el.querySelector<HTMLElement>(".bar")! };
        this.hud.powerups.append(el);
        this.powerUpChips.set(kind, chip);
      }
      chip.bar.style.transform = `scaleX(${ratio})`;
      chip.el.classList.toggle("ending", ratio < 0.25);
    }
  }

  private resize() {
    const { innerWidth: w, innerHeight: h } = window;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Dar (dikey) ekranlarda üç şerit de görünsün diye görüş açısını genişlet
    this.camera.fov = w < h ? 75 : 60;
    this.camera.updateProjectionMatrix();
  }
}
