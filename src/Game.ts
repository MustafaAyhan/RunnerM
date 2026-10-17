import * as THREE from "three";
import { MAX_SPEED, SPEED_GAIN, START_SPEED } from "./config";
import { Input } from "./input";
import { Player } from "./Player";
import { World } from "./World";

type State = "menu" | "playing" | "over";

export class Game {
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
  private timer = new THREE.Timer();

  private input = new Input();
  private player = new Player();
  private world = new World();

  private state: State = "menu";
  private speed = START_SPEED;
  private distance = 0;
  private coins = 0;
  private best = Number(localStorage.getItem("runner.best") ?? 0);

  private hud = {
    score: document.getElementById("score")!,
    coins: document.getElementById("coins")!,
    overlay: document.getElementById("overlay")!,
    title: document.getElementById("title")!,
    subtitle: document.getElementById("subtitle")!,
  };

  constructor() {
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

    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop((t) => this.tick(t));
  }

  private reset() {
    this.speed = START_SPEED;
    this.distance = 0;
    this.coins = 0;
    this.player.reset();
    this.world.reset();
    this.updateHud();
  }

  private start() {
    if (this.state === "over") this.reset();
    this.state = "playing";
    this.hud.overlay.classList.add("hidden");
  }

  private gameOver() {
    this.state = "over";
    const score = Math.floor(this.distance) + this.coins * 10;
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
      if (this.state !== "playing") {
        if (action === "start") this.start();
        continue;
      }
      if (action === "left") this.player.moveLane(-1);
      else if (action === "right") this.player.moveLane(1);
      else if (action === "jump") this.player.jump();
      else if (action === "slide") this.player.slide();
    }

    if (this.state === "playing") {
      this.speed = Math.min(MAX_SPEED, this.speed + SPEED_GAIN * dt);
      this.distance += this.speed * dt;

      this.player.update(dt);
      this.world.update(dt, this.speed, elapsed);

      const bounds = this.player.getBounds();
      this.coins += this.world.collectCoins(bounds);
      if (this.world.hitsObstacle(bounds)) this.gameOver();

      this.updateHud();
    }

    // Kamera oyuncuyu yatayda yumuşakça takip eder
    const camTargetX = this.player.mesh.position.x * 0.5;
    this.camera.position.x += (camTargetX - this.camera.position.x) * (1 - Math.exp(-6 * dt));

    this.renderer.render(this.scene, this.camera);
  }

  private updateHud() {
    this.hud.score.textContent = String(Math.floor(this.distance) + this.coins * 10);
    this.hud.coins.textContent = `🪙 ${this.coins}`;
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
