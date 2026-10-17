const connectScreen = document.querySelector("#connect-screen");
const menuScreen = document.querySelector("#menu-screen");
const form = document.querySelector("#connect-form");
const keyInput = document.querySelector("#intro-key");
const errorText = document.querySelector("#connect-error");
const connectButton = document.querySelector("#connect-button");
const cancelButton = document.querySelector("#cancel-button");
const menuConnectButton = document.querySelector("#menu-connect-button");
const panoramaCanvas = document.querySelector("#panorama-canvas");
let pendingConnection = null;

function showError(message) {
  errorText.textContent = message;
  errorText.hidden = !message;
}

function showMenu() {
  pendingConnection?.abort();
  keyInput.value = "";
  showError("");
  connectScreen.hidden = true;
  menuScreen.hidden = false;
  menuConnectButton.focus();
}

function showConnect() {
  menuScreen.hidden = true;
  connectScreen.hidden = false;
  keyInput.focus();
}

cancelButton.addEventListener("click", showMenu);
menuConnectButton.addEventListener("click", showConnect);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !connectScreen.hidden) showMenu();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = keyInput.value.trim();
  if (!key) {
    showError("Введите X-API ключ.");
    keyInput.focus();
    return;
  }
  showError("");
  connectButton.disabled = true;
  connectButton.textContent = "Подключение...";
  const controller = new AbortController();
  pendingConnection = controller;
  try {
    const response = await fetch("/api/v1/auth/check", {
      headers: { "X-API-Key": key },
      cache: "no-store",
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    if (response.status === 401) {
      showError("Неверный X-API ключ.");
      return;
    }
    if (!response.ok) {
      showError("Сервис временно недоступен. Попробуйте ещё раз.");
      return;
    }
    window.location.assign("/app");
  } catch {
    if (!controller.signal.aborted) showError("Не удалось подключиться к сервису.");
  } finally {
    if (pendingConnection === controller) pendingConnection = null;
    connectButton.disabled = false;
    connectButton.textContent = "Подключиться";
  }
});

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
