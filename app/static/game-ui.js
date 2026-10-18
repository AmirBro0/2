(() => {
  const soundSlot = "forte-game-sound";
  let soundOn = localStorage.getItem(soundSlot) === "on", toastTimer;
  const sound = (name, volume = .2) => {
    if (!soundOn || document.hidden) return;
    const audio = new Audio(`/static/minecraft-local/ui/${name}.ogg`);
    audio.volume = volume;
    audio.play().catch(() => {});
  };
  const toggle = document.createElement("button");
  toggle.type = "button"; toggle.className = "game-sound-toggle";
  function syncSound() {
    toggle.textContent = `Звуки: ${soundOn ? "вкл" : "выкл"}`;
    toggle.setAttribute("aria-pressed", String(soundOn));
    toggle.setAttribute("aria-label", `Звуки Minecraft: ${soundOn ? "включены" : "выключены"}`);
  }
  toggle.addEventListener("click", () => { soundOn = !soundOn; localStorage.setItem(soundSlot, soundOn ? "on" : "off"); syncSound(); if (soundOn) sound("click"); });
  syncSound(); document.body.append(toggle);
  document.addEventListener("click", event => {
    const button = event.target.closest("button,a.mc-button,a.pixel-button");
    if (button && button !== toggle && !button.disabled) sound("click", .14);
  }, true);
  const toast = document.createElement("div");
  toast.className = "game-achievement"; toast.hidden = true; toast.setAttribute("role", "status");
  const icon = document.createElement("img"); icon.src = "/static/minecraft-local/inventory/items/ender_eye.png"; icon.alt = "";
  const words = document.createElement("div"), title = document.createElement("span"), detail = document.createElement("span");
  words.append(title, detail); toast.append(icon, words); document.body.append(toast);
  function notify(heading, message, celebrate = false) {
    clearTimeout(toastTimer); title.textContent = heading; detail.textContent = message;
    toast.hidden = false;
    if (celebrate) sound("levelup", .15);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
  }
  async function portal() {
    sound("portal", .12);
    const layer = document.createElement("div"); layer.className = "portal-transition"; layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
    await new Promise(resolve => setTimeout(resolve, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650));
  }
  window.GameUI = { sound, notify, portal };
  window.addEventListener("pageshow", () => document.querySelector(".portal-transition")?.remove());
})();
