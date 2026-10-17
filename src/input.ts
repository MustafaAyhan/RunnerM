export type Action = "left" | "right" | "jump" | "slide" | "start" | "mute";

const KEYMAP: Record<string, Action> = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ArrowUp: "jump", KeyW: "jump", Space: "jump",
  ArrowDown: "slide", KeyS: "slide",
  KeyM: "mute",
};

/** Klavye ve dokunmatik kaydırmayı tek bir aksiyon kuyruğuna çevirir. */
export class Input {
  private queue: Action[] = [];
  private pointerStart: { x: number; y: number } | null = null;

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (e.code === "Space" || e.code === "Enter") this.queue.push("start");
      const action = KEYMAP[e.code];
      if (!action) return;
      e.preventDefault();
      this.queue.push(action);
    });

    window.addEventListener("pointerdown", (e) => {
      this.pointerStart = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("pointerup", (e) => {
      if (!this.pointerStart) return;
      const dx = e.clientX - this.pointerStart.x;
      const dy = e.clientY - this.pointerStart.y;
      this.pointerStart = null;
      this.queue.push("start");
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return; // kaydırma değil, dokunma
      if (Math.abs(dx) > Math.abs(dy)) this.queue.push(dx > 0 ? "right" : "left");
      else this.queue.push(dy < 0 ? "jump" : "slide");
    });
  }

  /** Bu kareye kadar biriken aksiyonları döndürür ve kuyruğu boşaltır. */
  drain(): Action[] {
    const actions = this.queue;
    this.queue = [];
    return actions;
  }
}
