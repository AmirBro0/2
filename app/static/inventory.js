const inventory = document.querySelector("#inventory");
const avatar = document.querySelector("#avatar");
const inventoryLayout = document.querySelector("#inventory-layout");
const recipePanelWrap = document.querySelector("#recipe-panel-wrap");
const recipeGrid = document.querySelector("#recipe-grid");
const recipeInstructions = document.querySelector("#recipe-instructions");
const recipeSearch = document.querySelector("#recipe-search");
const guideButton = document.querySelector("#guide-button");
const filePicker = document.querySelector("#video-picker");
const craftFile = document.querySelector("#craft-file");
const craftKey = document.querySelector("#craft-key");
const craftResult = document.querySelector("#craft-result");
const tooltip = document.querySelector("#item-tooltip");
const tooltipName = document.querySelector("#tooltip-name");
const backdrop = document.querySelector("#modal-backdrop");
const modalTitle = document.querySelector("#modal-title");
const modalContent = document.querySelector("#modal-content");
const modalActions = document.querySelector("#modal-actions");
const toastElement = document.querySelector("#toast");
const assetRoot = "/static/minecraft-local/inventory/";
const itemRoot = `${assetRoot}items/`;
const worldReference = new Image();
worldReference.onload = () => document.body.classList.add("has-world-reference");
worldReference.src = `${assetRoot}world_reference.png`;
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
  const bookOpen = !recipePanelWrap.hidden;
  const scale = Math.min(3.4, (window.innerWidth - 24) / (bookOpen ? 355 : 176), (window.innerHeight - 24) / 166);
  document.documentElement.style.setProperty("--ui-scale", Math.max(bookOpen ? .75 : 1.45, scale).toFixed(3));
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
  renderRecipeInstructions();
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
  if (!state.tooltips || !backdrop.hidden || !element.dataset.detail) return;
  setText(tooltipName, element.dataset.detail, 1.5);
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

const character = new window.InventoryCharacter(avatar, state.followCursor);

const recipeSteps = [
  { id: "video", category: "video", image: "ender_pearl", name: "Видеофайл", value: "Выбрать запись .mov", instruction: "Нажмите на эндер-жемчуг внизу и выберите видеофайл .mov." },
  { id: "key", category: "key", image: "blaze_powder", name: "Ключ", value: "Добавить X-API ключ", instruction: "Нажмите на огненный порошок: ключ займёт нижнюю правую ячейку создания.", craftable: true },
  { id: "change", category: "key", image: "blaze_rod", name: "Сменить ключ", value: "Выбрать другой X-API ключ", instruction: "Огненный стержень откроет поле для другого X-API ключа." },
  { id: "next", category: "other", image: "ender_eye", name: "Следующий шаг", value: "Открыть следующий этап", instruction: "Когда жемчуг и порошок окажутся в ячейках, появится Око Эндера.", craftable: true },
  { id: "settings", category: "other", image: "command_block", name: "Настройки", value: "Открыть настройки", instruction: "Командный блок открывает настройки подсказок и поворота персонажа." },
  { id: "dragon", category: "other", image: "dragon_head", name: "Голова дракона", value: "Назначение появится позже", instruction: "Назначение головы дракона появится на следующем этапе." },
];
let selectedRecipe = null;
let recipeCategory = "all";
let craftableOnly = true;

function renderRecipeInstructions() {
  recipeInstructions.replaceChildren();
  if (!selectedRecipe && !recipeGrid.children.length) {
    recipeInstructions.hidden = false;
    setText(recipeInstructions, "Ничего не найдено", 1, 124);
    return;
  }
  recipeInstructions.hidden = !selectedRecipe;
  if (!selectedRecipe) return;
  const heading = document.createElement("strong");
  const paragraph = document.createElement("p");
  recipeInstructions.append(heading, paragraph);
  setText(heading, selectedRecipe.name, 1, 124);
  setText(paragraph, selectedRecipe.instruction, 1, 124);
}

function renderRecipeGrid() {
  recipeGrid.replaceChildren();
  const query = recipeSearch.value.trim().toLocaleLowerCase("ru");
  const visible = recipeSteps.filter((step) =>
    (recipeCategory === "all" || step.category === recipeCategory)
    && (!craftableOnly || step.craftable)
    && (!query || `${step.name} ${step.value} ${step.instruction}`.toLocaleLowerCase("ru").includes(query)),
  );
  for (const step of visible) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recipe-tile";
    button.setAttribute("aria-label", step.name);
    button.dataset.detail = step.value;
    if (selectedRecipe?.id === step.id) button.classList.add("selected");
    button.append(icon(step.image));
    button.addEventListener("click", () => {
      selectedRecipe = selectedRecipe?.id === step.id ? null : step;
      renderRecipeGrid();
      renderRecipeInstructions();
    });
    bindTooltip(button);
    recipeGrid.append(button);
  }
  if (!visible.length) {
    selectedRecipe = null;
    renderRecipeInstructions();
  } else if (selectedRecipe && !visible.includes(selectedRecipe)) {
    selectedRecipe = null;
    renderRecipeInstructions();
  }
}

function toggleRecipeBook(force) {
  const open = force ?? recipePanelWrap.hidden;
  recipePanelWrap.hidden = !open;
  inventoryLayout.classList.toggle("book-open", open);
  guideButton.setAttribute("aria-expanded", String(open));
  guideButton.setAttribute("aria-label", open ? "Закрыть справочник" : "Открыть справочник");
  guideButton.dataset.detail = open ? "Закрыть справочник" : "Открыть справочник";
  tooltip.hidden = true;
  resizeInventory();
  if (open) { renderRecipeGrid(); renderRecipeInstructions(); }
}

guideButton.addEventListener("click", () => toggleRecipeBook());
recipeSearch.addEventListener("input", renderRecipeGrid);
const recipeFilter = document.querySelector("#recipe-filter");
recipeFilter.addEventListener("click", () => {
  craftableOnly = !craftableOnly;
  recipeFilter.classList.toggle("enabled", craftableOnly);
  recipeFilter.setAttribute("aria-pressed", String(craftableOnly));
  recipeFilter.setAttribute("aria-label", craftableOnly ? "Показать все действия" : "Показать доступные действия");
  renderRecipeGrid();
  renderRecipeInstructions();
});
document.querySelectorAll(".recipe-tab").forEach((tab) => tab.addEventListener("click", () => {
  recipeCategory = tab.dataset.category;
  document.querySelectorAll(".recipe-tab").forEach((candidate) => candidate.classList.toggle("selected", candidate === tab));
  renderRecipeGrid();
  renderRecipeInstructions();
}));
renderRecipeGrid();
renderRecipeInstructions();

const hotbarButtons = [...document.querySelectorAll(".hotbar .slot-button")];
const hotbarSelection = document.querySelector("#hotbar-selection");
const slotAnnouncement = document.querySelector("#selected-slot-announcement");
let selectedSlot = 0;
function selectHotbarSlot(index) {
  selectedSlot = index;
  hotbarSelection.hidden = false;
  hotbarSelection.style.left = `${6 + 18 * index}px`;
  hotbarButtons.forEach((button, buttonIndex) => {
    if (buttonIndex === index) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
  slotAnnouncement.textContent = `Слот ${index + 1}: ${hotbarButtons[index]?.getAttribute("aria-label") || "пусто"}`;
}
hotbarButtons.forEach((button, index) => button.addEventListener("pointerdown", () => selectHotbarSlot(index)));

document.addEventListener("keydown", (event) => {
  if (!backdrop.hidden || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))) return;
  if (/^[1-9]$/.test(event.key)) {
    selectHotbarSlot(Number(event.key) - 1);
    event.preventDefault();
  } else if (event.key === "Enter" && document.activeElement === document.body) {
    hotbarButtons[selectedSlot]?.click();
  }
});

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
  else if (event.key === "Escape" && !recipePanelWrap.hidden) toggleRecipeBook(false);
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
  image.className = "item-icon";
  image.dataset.item = name;
  image.src = `${itemRoot}${name}.png`;
  image.alt = "";
  return image;
}

async function flyItem(source, destination, name) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const sourceImage = source.querySelector("img");
  const start = sourceImage?.getBoundingClientRect() || source.getBoundingClientRect();
  const sourceStyle = getComputedStyle(sourceImage || source);
  const offsetX = (parseFloat(sourceStyle.getPropertyValue("--icon-x")) || 0) * start.width / 16;
  const offsetY = (parseFloat(sourceStyle.getPropertyValue("--icon-y")) || 0) * start.height / 16;
  const finish = destination.getBoundingClientRect();
  const image = icon(name);
  image.className = "flying-item";
  image.style.left = `${start.left}px`;
  image.style.top = `${start.top}px`;
  image.style.width = `${start.width}px`;
  image.style.height = `${start.height}px`;
  document.body.append(image);
  const deltaX = finish.left + (finish.width - start.width) / 2 + offsetX - start.left;
  const deltaY = finish.top + (finish.height - start.height) / 2 + offsetY - start.top;
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
    character.setFollowCursor(enabled);
  });
  modalButton("Готово", closeModal).focus();
});
craftResult.addEventListener("click", () => openInfo("Око Эндера", [
  "Файл и ключ готовы. Следующая страница проверки появится позже.",
]));

if (!state.key) {
  document.querySelector("#powder-button").dataset.detail = "Сначала выберите X-API ключ";
}
