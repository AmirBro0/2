const inventory = document.querySelector("#inventory");
const avatar = document.querySelector("#avatar");
const filePicker = document.querySelector("#video-picker");
const craftFile = document.querySelector("#craft-file");
const craftKey = document.querySelector("#craft-key");
const craftResult = document.querySelector("#craft-result");
const tooltip = document.querySelector("#item-tooltip");
const tooltipName = document.querySelector("#tooltip-name");
const tooltipDetail = document.querySelector("#tooltip-detail");
const backdrop = document.querySelector("#modal-backdrop");
const modalTitle = document.querySelector("#modal-title");
const modalContent = document.querySelector("#modal-content");
const modalActions = document.querySelector("#modal-actions");
const toastElement = document.querySelector("#toast");
const assetRoot = "/static/minecraft-local/inventory/";
const keyStorage = "fortebank-api-key";
const state = {
  file: null,
  key: sessionStorage.getItem(keyStorage) || "",
  keyPlaced: false,
  tooltips: localStorage.getItem("inventory-tooltips") !== "off",
  followCursor: localStorage.getItem("inventory-follow-cursor") !== "off",
};
let font = null;
let toastTimer = null;

function resizeInventory() {
  const scale = Math.min(3, (window.innerWidth - 24) / 176, (window.innerHeight - 24) / 166);
  document.documentElement.style.setProperty("--ui-scale", Math.max(1.45, scale).toFixed(3));
}
window.addEventListener("resize", resizeInventory);
resizeInventory();

async function loadBitmapFont() {
  const directory = "/static/minecraft-local/font";
  const response = await fetch(`${directory}/glyphs.json`);
  if (!response.ok) return;
  const definitions = await response.json();
  const names = ["nonlatin_european", "accented", "ascii"];
  const images = await Promise.all(names.map((name) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = async () => {
      try { await image.decode(); } catch { /* The loaded bitmap is still drawable. */ }
      resolve(image);
    };
    image.onerror = reject;
    image.src = `${directory}/${name}.png`;
  })));
  const glyphs = new Map();
  names.forEach((name, index) => {
    const image = images[index];
    const { chars, ascent, height } = definitions[name];
    const cellWidth = image.width / 16;
    const cellHeight = image.height / chars.length;
    const sheet = document.createElement("canvas");
    sheet.width = image.width;
    sheet.height = image.height;
    const context = sheet.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    chars.forEach((row, rowIndex) => {
      Array.from(row).forEach((character, columnIndex) => {
        if (!character || character === "\u0000" || glyphs.has(character)) return;
        let rightmost = -1;
        for (let y = 0; y < cellHeight; y++) {
          for (let x = 0; x < cellWidth; x++) {
            const alpha = ((rowIndex * cellHeight + y) * image.width + columnIndex * cellWidth + x) * 4 + 3;
            if (pixels[alpha] > 0) rightmost = Math.max(rightmost, x);
          }
        }
        if (rightmost < 0) return;
        glyphs.set(character, {
          image, x: columnIndex * cellWidth, y: rowIndex * cellHeight,
          cellWidth, cellHeight, ascent, height,
          advance: Math.ceil((rightmost + 1) * height / cellHeight) + 1,
        });
      });
    });
  });
  const advance = (character) => character === " " ? 4 : (glyphs.get(character) || glyphs.get("?"))?.advance || 8;
  const widthOf = (text) => Array.from(text).reduce((total, character) => total + advance(character), 0);
  font = {
    widthOf,
    render(element, text, scale = 2, maxWidth = Infinity) {
      const lines = [""];
      for (const word of text.split(" ")) {
        const last = lines.length - 1;
        const candidate = lines[last] ? `${lines[last]} ${word}` : word;
        if (lines[last] && widthOf(candidate) * scale > maxWidth) lines.push(word);
        else lines[last] = candidate;
      }
      const canvas = document.createElement("canvas");
      canvas.className = "mc-glyphs";
      canvas.setAttribute("aria-hidden", "true");
      canvas.width = Math.max(1, Math.ceil(Math.max(...lines.map(widthOf)) * scale));
      canvas.height = Math.ceil((12 * lines.length + 2 * (lines.length - 1)) * scale);
      const context = canvas.getContext("2d");
      context.imageSmoothingEnabled = false;
      lines.forEach((line, index) => {
        let cursor = 0;
        for (const character of line) {
          const glyph = character === " " ? null : glyphs.get(character) || glyphs.get("?");
          if (glyph) context.drawImage(
            glyph.image, glyph.x, glyph.y, glyph.cellWidth, glyph.cellHeight,
            cursor * scale, (index * 14 + 10 - glyph.ascent) * scale,
            glyph.cellWidth * scale, glyph.height * scale,
          );
          cursor += advance(character);
        }
      });
      context.globalCompositeOperation = "source-in";
      context.fillStyle = getComputedStyle(element).color;
      context.fillRect(0, 0, canvas.width, canvas.height);
      const accessible = document.createElement("span");
      accessible.className = "visually-hidden";
      accessible.textContent = text;
      element.replaceChildren(accessible, canvas);
    },
  };
  setText(document.querySelector("#craft-title"), "Создание", 1);
  document.querySelector("#new-api-key")?.dispatchEvent(new Event("input"));
}

function setText(element, text, scale = 2, maxWidth = Infinity) {
  if (font && text) font.render(element, text, scale, maxWidth);
  else element.textContent = text;
}
loadBitmapFont().catch(() => {});

function showToast(message) {
  clearTimeout(toastTimer);
  setText(toastElement, message, 1.5, Math.min(window.innerWidth - 52, 560));
  toastElement.hidden = false;
  toastTimer = setTimeout(() => { toastElement.hidden = true; }, 2800);
}

function positionTooltip(x, y) {
  const left = Math.min(window.innerWidth - tooltip.offsetWidth - 8, x + 15);
  const top = Math.min(window.innerHeight - tooltip.offsetHeight - 8, y + 18);
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

function showTooltip(element, x, y) {
  if (!state.tooltips || !backdrop.hidden || !element.dataset.tip) return;
  setText(tooltipName, element.dataset.tip || "", 2);
  setText(tooltipDetail, element.dataset.detail || "", 1.5);
  tooltipDetail.hidden = !element.dataset.detail;
  tooltip.hidden = false;
  positionTooltip(x, y);
}

function bindTooltip(element) {
  element.addEventListener("pointerenter", (event) => showTooltip(element, event.clientX, event.clientY));
  element.addEventListener("pointermove", (event) => {
    if (!tooltip.hidden) positionTooltip(event.clientX, event.clientY);
  });
  element.addEventListener("pointerleave", () => { tooltip.hidden = true; });
  element.addEventListener("focus", () => {
    const box = element.getBoundingClientRect();
    showTooltip(element, box.right, box.top);
  });
  element.addEventListener("blur", () => { tooltip.hidden = true; });
}
document.querySelectorAll("[data-tip]").forEach(bindTooltip);

const skin = new Image();
skin.src = "/static/custom-skin.png";
const avatarContext = avatar.getContext("2d");
avatarContext.imageSmoothingEnabled = false;
const gaze = { x: 0, y: 0, targetX: 0, targetY: 0 };
function drawAvatar() {
  avatarContext.clearRect(0, 0, 50, 70);
  if (!skin.complete || !skin.naturalWidth) return;
  const unitX = skin.naturalWidth / 64;
  const unitY = skin.naturalHeight / 32;
  const crop = (sx, sy, sw, sh, dx, dy, dw, dh) => {
    avatarContext.drawImage(skin, sx * unitX, sy * unitY, sw * unitX, sh * unitY, dx, dy, dw, dh);
  };
  const lean = Math.round(gaze.x * 1.5);
  avatarContext.fillStyle = "#142440";
  avatarContext.fillRect(16 + lean, 46, 8, 19);
  avatarContext.fillRect(26 + lean, 46, 8, 19);
  crop(0, 28, 8, 4, 15 + lean, 63, 9, 6);
  crop(40, 28, 8, 4, 26 + lean, 63, 9, 6);
  crop(0, 20, 16, 12, 7 + lean, 22, 8, 28);
  crop(40, 20, 16, 12, 35 + lean, 22, 8, 28);
  crop(16, 20, 24, 12, 14 + lean, 22, 22, 27);
  const headX = Math.round(17 + gaze.x * 3);
  const headY = Math.round(4 + gaze.y * 2);
  if (gaze.x < -.15) crop(2, 8, 8, 8, headX - 2, headY, 4, 18);
  if (gaze.x > .15) crop(18, 8, 8, 8, headX + 14, headY, 4, 18);
  crop(10, 8, 8, 8, headX, headY, 16, 18);
}
skin.onload = drawAvatar;
document.addEventListener("pointermove", (event) => {
  if (!state.followCursor) return;
  const box = avatar.getBoundingClientRect();
  const centerX = box.left + box.width / 2;
  const centerY = box.top + box.height / 2;
  gaze.targetX = Math.max(-1, Math.min(1, (event.clientX - centerX) / 260));
  gaze.targetY = Math.max(-1, Math.min(1, (event.clientY - centerY) / 220));
}, { passive: true });
function animateAvatar() {
  gaze.x += (gaze.targetX - gaze.x) * .14;
  gaze.y += (gaze.targetY - gaze.y) * .14;
  drawAvatar();
  requestAnimationFrame(animateAvatar);
}
requestAnimationFrame(animateAvatar);

let focusBeforeModal = null;
function closeModal() {
  backdrop.hidden = true;
  focusBeforeModal?.focus();
}

function openModal(title) {
  focusBeforeModal = document.activeElement;
  tooltip.hidden = true;
  modalContent.replaceChildren();
  modalActions.replaceChildren();
  backdrop.hidden = false;
  setText(modalTitle, title, 2, 380);
}

function modalParagraph(text) {
  const paragraph = document.createElement("p");
  modalContent.append(paragraph);
  setText(paragraph, text, 1.5, modalContent.clientWidth - 8);
  return paragraph;
}

function modalButton(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pixel-button";
  modalActions.append(button);
  setText(button, label, 1.5, (modalActions.clientWidth - 20) / 2);
  button.addEventListener("click", action);
  return button;
}

function openInfo(title, lines) {
  openModal(title);
  for (const line of lines) modalParagraph(line);
  modalButton("Назад", closeModal).focus();
}

backdrop.addEventListener("click", (event) => {
  if (event.target === backdrop) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !backdrop.hidden) closeModal();
});

async function validateKey(key) {
  const response = await fetch("/api/v1/auth/check", {
    headers: { "X-API-Key": key }, cache: "no-store",
  });
  return response.status;
}

function openKeyModal() {
  openModal("X-API ключ");
  const label = document.createElement("label");
  label.htmlFor = "new-api-key";
  modalContent.append(label);
  setText(label, "Введите ключ", 1.5);
  const input = document.createElement("input");
  input.id = "new-api-key";
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.value = state.key;
  const keyField = document.createElement("div");
  keyField.className = "modal-key-field";
  const keyVisual = document.createElement("div");
  keyVisual.className = "modal-key-visual";
  keyVisual.setAttribute("aria-hidden", "true");
  const keyRender = document.createElement("span");
  keyRender.className = "modal-key-render";
  const keyCursor = document.createElement("span");
  keyCursor.className = "modal-key-cursor";
  keyVisual.append(keyRender, keyCursor);
  keyField.append(input, keyVisual);
  modalContent.append(keyField);
  function renderInput() {
    if (!font) return;
    input.classList.add("bitmap-ready");
    setText(keyRender, input.value, 1.5);
    const position = input.selectionStart ?? input.value.length;
    const totalWidth = font.widthOf(input.value) * 1.5;
    const cursorX = font.widthOf(input.value.slice(0, position)) * 1.5;
    const offset = Math.max(0, totalWidth - keyVisual.clientWidth + 16);
    keyRender.style.transform = `translateX(${-offset}px)`;
    keyCursor.style.left = `${cursorX - offset}px`;
  }
  for (const eventName of ["input", "click", "keyup", "select"]) input.addEventListener(eventName, renderInput);
  renderInput();
  const error = document.createElement("p");
  error.className = "error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  modalContent.append(error);
  async function save() {
    const key = input.value.trim();
    if (!key) {
      setText(error, "Введите X-API ключ", 1.5);
      error.hidden = false;
      return;
    }
    saveButton.disabled = true;
    try {
      const status = await validateKey(key);
      if (status !== 200) {
        setText(error, status === 401 ? "Неверный X-API ключ" : "Сервер не отвечает", 1.5);
        error.hidden = false;
        return;
      }
      state.key = key;
      state.keyPlaced = false;
      sessionStorage.setItem(keyStorage, key);
      document.querySelector("#powder-button").dataset.detail = "Добавить X-API ключ в создание";
      craftKey.replaceChildren();
      craftKey.setAttribute("aria-label", "Ключ не добавлен");
      updateResult();
      closeModal();
      showToast("Ключ принят. Добавьте порошок в создание");
    } catch {
      setText(error, "Локальный сервер не отвечает", 1.5);
      error.hidden = false;
    } finally {
      saveButton.disabled = false;
    }
  }
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); save(); }
  });
  const saveButton = modalButton("Сохранить", save);
  modalButton("Отмена", closeModal);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  renderInput();
}

function icon(name) {
  const image = document.createElement("img");
  image.src = `${assetRoot}${name}.png`;
  image.alt = "";
  return image;
}

async function flyItem(source, destination, name) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const start = source.querySelector("img")?.getBoundingClientRect() || source.getBoundingClientRect();
  const finish = destination.getBoundingClientRect();
  const image = icon(name);
  image.className = "flying-item";
  image.style.left = `${start.left}px`;
  image.style.top = `${start.top}px`;
  image.style.width = `${start.width}px`;
  image.style.height = `${start.height}px`;
  document.body.append(image);
  const deltaX = finish.left + (finish.width - start.width) / 2 - start.left;
  const deltaY = finish.top + (finish.height - start.height) / 2 - start.top;
  try {
    await image.animate([
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${deltaX}px, ${deltaY}px) scale(1.15)`, opacity: 1, offset: .7 },
      { transform: `translate(${deltaX}px, ${deltaY}px) scale(1)`, opacity: 1 },
    ], { duration: 540, easing: "ease-in-out" }).finished;
  } finally {
    image.remove();
  }
}

function updateResult() {
  const ready = Boolean(state.file && state.keyPlaced);
  craftResult.hidden = !ready;
  craftResult.classList.toggle("ready", ready);
}

document.querySelector("#pearl-button").addEventListener("click", () => {
  tooltip.hidden = true;
  filePicker.value = "";
  filePicker.click();
});
filePicker.addEventListener("change", async () => {
  const file = filePicker.files?.[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".mov")) {
    showToast("Выберите видеофайл .mov");
    return;
  }
  state.file = file;
  craftFile.replaceChildren();
  await flyItem(document.querySelector("#pearl-button"), craftFile, "ender_pearl");
  craftFile.append(icon("ender_pearl"));
  craftFile.setAttribute("aria-label", `Выбран файл ${file.name}`);
  craftFile.dataset.tip = "Эндер-жемчуг";
  craftFile.dataset.detail = file.name;
  updateResult();
  showToast(`Выбран файл: ${file.name}`);
});

document.querySelector("#powder-button").addEventListener("click", async () => {
  tooltip.hidden = true;
  if (!state.key) { openKeyModal(); return; }
  try {
    if (await validateKey(state.key) !== 200) {
      openKeyModal();
      return;
    }
  } catch {
    showToast("Локальный сервер не отвечает");
    return;
  }
  craftKey.replaceChildren();
  await flyItem(document.querySelector("#powder-button"), craftKey, "blaze_powder");
  craftKey.append(icon("blaze_powder"));
  craftKey.setAttribute("aria-label", "X-API ключ добавлен");
  craftKey.dataset.tip = "Огненный порошок";
  craftKey.dataset.detail = "X-API ключ добавлен";
  state.keyPlaced = true;
  updateResult();
  showToast(state.file ? "Создано Око Эндера" : "Ключ добавлен. Выберите видеофайл");
});

bindTooltip(craftFile);
bindTooltip(craftKey);
document.querySelector("#rod-button").addEventListener("click", openKeyModal);
document.querySelector("#guide-button").addEventListener("click", () => openInfo("Справочник", [
  "1. Нажмите на эндер-жемчуг и выберите видеофайл .mov.",
  "2. Огненный порошок добавит X-API ключ. Стержень позволит его сменить.",
  "3. Жемчуг и порошок займут ячейки создания. Появится Око Эндера.",
  "4. Око откроет следующий этап проверки, когда он будет готов.",
]));
document.querySelector("#dragon-button").addEventListener("click", () => openInfo("Голова дракона", [
  "Назначение этого предмета появится на следующем этапе.",
]));
document.querySelector("#settings-button").addEventListener("click", () => {
  openModal("Настройки");
  function setting(labelText, checked, onChange) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.addEventListener("change", () => onChange(checkbox.checked));
    label.append(checkbox, ` ${labelText}`);
    modalContent.append(label);
  }
  setting("Подсказки предметов", state.tooltips, (enabled) => {
    state.tooltips = enabled;
    localStorage.setItem("inventory-tooltips", enabled ? "on" : "off");
    if (!enabled) tooltip.hidden = true;
  });
  setting("Персонаж следит за курсором", state.followCursor, (enabled) => {
    state.followCursor = enabled;
    localStorage.setItem("inventory-follow-cursor", enabled ? "on" : "off");
    if (!enabled) { gaze.targetX = 0; gaze.targetY = 0; }
  });
  modalButton("Готово", closeModal).focus();
});
craftResult.addEventListener("click", () => openInfo("Око Эндера", [
  "Файл и ключ готовы. Следующая страница проверки появится позже.",
]));

if (!state.key) {
  document.querySelector("#powder-button").dataset.detail = "Сначала выберите X-API ключ";
}
