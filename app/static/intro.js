const connectScreen = document.querySelector("#connect-screen");
const menuScreen = document.querySelector("#menu-screen");
const checkingScreen = document.querySelector("#checking-screen");
const loadingScreen = document.querySelector("#loading-screen");
const failureScreen = document.querySelector("#failure-screen");
const form = document.querySelector("#connect-form");
const keyInput = document.querySelector("#intro-key");
const keyVisual = document.querySelector("#key-visual");
const keyRender = document.querySelector("#key-render");
const keyCursor = document.querySelector("#key-cursor");
const connectButton = document.querySelector("#connect-button");
const cancelButton = document.querySelector("#cancel-button");
const menuConnectButton = document.querySelector("#menu-connect-button");
const checkingCancel = document.querySelector("#checking-cancel");
const failureBack = document.querySelector("#failure-back");
const failureReason = document.querySelector("#failure-reason");
const loadProgress = document.querySelector("#load-progress");
const worldBuild = document.querySelector("#world-build");
const panoramaCanvas = document.querySelector("#panorama-canvas");
keyInput.value = "";
let pendingConnection = null;
let minecraftFont = null;

function setDisplayText(element, text) {
  if (!minecraftFont || !text) {
    element.textContent = text;
    return;
  }
  minecraftFont.render(element, text);
}

async function loadMinecraftFont() {
  const directory = "/static/minecraft-local/font";
  const response = await fetch(`${directory}/glyphs.json`);
  if (!response.ok) return;
  const definitions = await response.json();
  const names = ["nonlatin_european", "accented", "ascii"];
  const images = await Promise.all(names.map((name) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = async () => {
      try { await image.decode(); } catch { /* drawImage can still use the loaded image. */ }
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
            const offset = ((rowIndex * cellHeight + y) * image.width + columnIndex * cellWidth + x) * 4 + 3;
            if (pixels[offset] > 0) rightmost = Math.max(rightmost, x);
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

  function advance(character) {
    return character === " " ? 4 : (glyphs.get(character) || glyphs.get("?"))?.advance || 8;
  }
  function widthOf(text) {
    return Array.from(text).reduce((total, character) => total + advance(character), 0);
  }
  minecraftFont = {
    widthOf,
    render(element, text) {
      const scale = Number(element.dataset.minecraftScale || 2);
      const maxWidth = element.classList.contains("error") ? Math.max(1, element.clientWidth / scale) : Infinity;
      const lines = [""];
      for (const word of text.split(" ")) {
        const current = lines.length - 1;
        const candidate = lines[current] ? `${lines[current]} ${word}` : word;
        if (lines[current] && widthOf(candidate) > maxWidth) lines.push(word);
        else lines[current] = candidate;
      }
      const canvas = document.createElement("canvas");
      canvas.className = "mc-glyphs";
      canvas.setAttribute("aria-hidden", "true");
      canvas.width = Math.max(1, Math.ceil(Math.max(...lines.map(widthOf)) * scale));
      canvas.height = Math.ceil((12 * lines.length + 2 * (lines.length - 1)) * scale);
      const context = canvas.getContext("2d");
      context.imageSmoothingEnabled = false;
      lines.forEach((line, lineIndex) => {
        let cursor = 0;
        for (const character of line) {
          const glyph = character === " " ? null : glyphs.get(character) || glyphs.get("?");
          if (glyph) {
            context.drawImage(
              glyph.image, glyph.x, glyph.y, glyph.cellWidth, glyph.cellHeight,
              cursor * scale, (lineIndex * 14 + 10 - glyph.ascent) * scale,
              glyph.cellWidth * scale, glyph.height * scale,
            );
          }
          cursor += advance(character);
        }
      });
      context.globalCompositeOperation = "source-in";
      context.fillStyle = getComputedStyle(element).color;
      context.fillRect(0, 0, canvas.width, canvas.height);
      const accessibleText = document.createElement("span");
      accessibleText.className = "sr-only";
      accessibleText.textContent = text;
      element.replaceChildren(accessibleText, canvas);
    },
  };
  document.querySelectorAll("[data-minecraft-text]").forEach((element) => {
    const text = element.textContent.trim();
    if (text) setDisplayText(element, text);
  });
  renderKeyInput();
}

loadMinecraftFont().catch(() => {});

function renderKeyInput() {
  const value = keyInput.value;
  setDisplayText(keyRender, value);
  const position = keyInput.selectionStart ?? value.length;
  const cursorX = minecraftFont ? minecraftFont.widthOf(value.slice(0, position)) * 2 : position * 12;
  const totalWidth = minecraftFont ? minecraftFont.widthOf(value) * 2 : value.length * 12;
  const offset = Math.max(0, totalWidth - keyVisual.clientWidth + 25);
  keyRender.style.transform = `translateX(${-offset}px)`;
  keyCursor.style.left = `${8 + cursorX - offset}px`;
}

keyInput.addEventListener("input", renderKeyInput);
keyInput.addEventListener("click", renderKeyInput);
keyInput.addEventListener("keyup", renderKeyInput);
keyInput.addEventListener("select", renderKeyInput);
window.addEventListener("resize", renderKeyInput);

function showScreen(screen) {
  [connectScreen, menuScreen, checkingScreen, loadingScreen, failureScreen].forEach((candidate) => {
    candidate.hidden = candidate !== screen;
  });
}

function showMenu() {
  pendingConnection?.abort();
  keyInput.value = "";
  renderKeyInput();
  showScreen(menuScreen);
  menuConnectButton.focus();
}

function showConnect() {
  pendingConnection?.abort();
  showScreen(connectScreen);
  keyInput.focus();
  renderKeyInput();
}

cancelButton.addEventListener("click", showMenu);
menuConnectButton.addEventListener("click", showConnect);
checkingCancel.addEventListener("click", showConnect);
failureBack.addEventListener("click", () => {
  showConnect();
  keyInput.select();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!connectScreen.hidden) showMenu();
  else if (!checkingScreen.hidden || !failureScreen.hidden) showConnect();
});

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function showFailure(reason) {
  setDisplayText(failureReason, reason);
  showScreen(failureScreen);
  failureBack.focus();
}

function drawWorld(progress) {
  const context = worldBuild.getContext("2d");
  context.clearRect(0, 0, worldBuild.width, worldBuild.height);
  context.fillStyle = "rgba(0, 0, 0, .8)";
  context.fillRect(12, 4, 208, 136);
  context.fillStyle = "#050505";
  context.fillRect(12, 4, 208, 5);
  context.fillRect(12, 135, 208, 5);
  context.fillRect(12, 4, 5, 136);
  context.fillRect(215, 4, 5, 136);

  function polygon(points, color) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(...points[0]);
    points.slice(1).forEach((point) => context.lineTo(...point));
    context.closePath();
    context.fill();
  }

  for (let diagonal = 0; diagonal <= 14; diagonal++) {
    for (let x = 0; x < 8; x++) {
      const z = diagonal - x;
      if (z < 0 || z >= 8) continue;
      const order = (diagonal * 8 + x) / 120;
      if (progress < order) continue;
      const height = 1 + ((x * 7 + z * 11 + x * z) % 3);
      const px = 116 + (x - z) * 10;
      const py = 30 + (x + z) * 5 - height * 3;
      const depth = 7 + height * 3;
      const water = (x === 5 && z >= 3) || (x === 6 && z >= 4);
      const sand = !water && (x === 4 && z >= 3);
      const top = water ? "#377abc" : sand ? "#dfd39a" : "#62ad49";
      const left = water ? "#255489" : sand ? "#ab996e" : "#79532f";
      const right = water ? "#1c416d" : sand ? "#91815b" : "#593c23";
      polygon([[px - 10, py + 5], [px, py + 10], [px, py + 10 + depth], [px - 10, py + 5 + depth]], left);
      polygon([[px, py + 10], [px + 10, py + 5], [px + 10, py + 5 + depth], [px, py + 10 + depth]], right);
      polygon([[px, py], [px + 10, py + 5], [px, py + 10], [px - 10, py + 5]], top);
      if (!water && !sand && (x + z) % 5 === 0) {
        context.fillStyle = "#8acc64";
        context.fillRect(px - 2, py + 3, 3, 2);
      }
    }
  }
}

function animateWorld(duration, signal) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = performance.now();
  loadProgress.style.width = "0%";
  drawWorld(0);
  return new Promise((resolve, reject) => {
    function frame(now) {
      if (signal.aborted) {
        reject(new DOMException("Cancelled", "AbortError"));
        return;
      }
      const progress = Math.min(1, (now - start) / duration);
      loadProgress.style.width = `${Math.round(progress * 100)}%`;
      drawWorld(reducedMotion ? 1 : progress);
      if (progress < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = keyInput.value.trim();
  if (!key) return;
  const controller = new AbortController();
  pendingConnection = controller;
  showScreen(checkingScreen);
  checkingCancel.focus();
  try {
    const [response] = await Promise.all([
      fetch("/api/v1/auth/check", {
        headers: { "X-API-Key": key },
        cache: "no-store",
        signal: controller.signal,
      }),
      delay(950, controller.signal),
    ]);
    if (controller.signal.aborted) return;
    if (response.status === 401) {
      showFailure("Неверный X-API ключ");
      return;
    }
    if (!response.ok) {
      showFailure("Сервис временно недоступен");
      return;
    }
    showScreen(loadingScreen);
    await animateWorld(2600, controller.signal);
    if (!controller.signal.aborted) window.location.assign("/app");
  } catch {
    if (!controller.signal.aborted) showFailure("Не удалось подключиться к сервису");
  } finally {
    if (pendingConnection === controller) pendingConnection = null;
  }
});

renderKeyInput();
requestAnimationFrame(() => keyInput.focus());

// The six images are copied from this computer's installed game, never bundled
// with the public repository. A cube texture gives the menu a genuine 360° view.
async function startPanorama() {
  const gl = panoramaCanvas.getContext("webgl", { alpha: true, antialias: false, depth: false });
  if (!gl) return;

  const vertexSource = `
    attribute vec2 position;
    varying vec2 screenPosition;
    void main() {
      screenPosition = position;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec2 screenPosition;
    uniform samplerCube panorama;
    uniform float aspect;
    uniform float yaw;
    uniform float pitch;
    void main() {
      vec3 ray = normalize(vec3(screenPosition.x * aspect * 0.75, screenPosition.y * 0.75, 1.0));
      float cp = cos(pitch);
      float sp = sin(pitch);
      ray = vec3(ray.x, ray.y * cp - ray.z * sp, ray.y * sp + ray.z * cp);
      float cy = cos(yaw);
      float sy = sin(yaw);
      ray = vec3(ray.x * cy + ray.z * sy, ray.y, ray.z * cy - ray.x * sy);
      gl_FragColor = textureCube(panorama, ray);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Panorama shader failed");
    return shader;
  }

  try {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    const images = await Promise.all(Array.from({ length: 6 }, (_, number) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `/static/minecraft-local/panorama_${number}.png`;
    })));
    const targets = [
      gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
      gl.TEXTURE_CUBE_MAP_POSITIVE_X,
      gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
      gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
      gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
      gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
    ];
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    images.forEach((image, number) => gl.texImage2D(targets[number], 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image));
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, "panorama"), 0);
    const aspectLocation = gl.getUniformLocation(program, "aspect");
    const yawLocation = gl.getUniformLocation(program, "yaw");
    const pitchLocation = gl.getUniformLocation(program, "pitch");
    const positions = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positions);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let targetYaw = 0;
    let targetPitch = 0;
    let lookYaw = 0;
    let lookPitch = 0;
    if (!reducedMotion) {
      window.addEventListener("pointermove", (event) => {
        targetYaw = (event.clientX / window.innerWidth - .5) * .24;
        targetPitch = (event.clientY / window.innerHeight - .5) * -.12;
      }, { passive: true });
    }

    function draw(timestamp) {
      if (!document.hidden) {
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.max(1, Math.round(window.innerWidth * pixelRatio));
        const height = Math.max(1, Math.round(window.innerHeight * pixelRatio));
        if (panoramaCanvas.width !== width || panoramaCanvas.height !== height) {
          panoramaCanvas.width = width;
          panoramaCanvas.height = height;
          gl.viewport(0, 0, width, height);
        }
        lookYaw += (targetYaw - lookYaw) * .06;
        lookPitch += (targetPitch - lookPitch) * .06;
        gl.uniform1f(aspectLocation, width / height);
        gl.uniform1f(yawLocation, (reducedMotion ? 0 : timestamp * .000045) + lookYaw);
        gl.uniform1f(pitchLocation, .04 + lookPitch);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      if (!reducedMotion) requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  } catch {
    // The CSS background shows the first local game image if WebGL is unavailable.
  }
}

startPanorama();
