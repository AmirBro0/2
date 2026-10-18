/* A six-part Minecraft model. Front textures come from the user's DS reference;
   the other faces continue its hair, hoodie, trousers and shoes. */
window.InventoryCharacter = class InventoryCharacter {
  constructor(container, followCursor = true) {
    this.container = container;
    this.followCursor = followCursor;
    this.pose = { yaw: 0, pitch: 0 };
    this.target = { yaw: 0, pitch: 0 };
    this.canvas = container.querySelector("canvas");
    this.gl = this.canvas.getContext("webgl", { alpha: true, antialias: false });
    if (!this.gl) return;
    this.parts = [
      { name: "head", center: [0, 28, 0], size: [8, 8, 8], crop: [133, 58, 118, 117] },
      { name: "body", center: [0, 18, 0], size: [8, 12, 4], crop: [133, 175, 118, 175] },
      { name: "left-arm", center: [-6, 18, 0], size: [4, 12, 4], crop: [75, 175, 59, 175] },
      { name: "right-arm", center: [6, 18, 0], size: [4, 12, 4], crop: [251, 175, 59, 175] },
      { name: "left-leg", center: [-2, 6, 0], size: [4, 12, 4], crop: [133, 350, 59, 177] },
      { name: "right-leg", center: [2, 6, 0], size: [4, 12, 4], crop: [192, 350, 59, 177] },
    ];
    this.reference = new Image();
    this.reference.onload = () => {
      this.buildTexture();
      this.initializeRenderer();
      container.classList.add("model-ready");
      this.wake();
    };
    this.reference.src = "/static/character-art.png";
    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      cancelAnimationFrame(this.frame);
      this.frame = null;
      this.ready = false;
      container.classList.remove("model-ready");
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      this.initializeRenderer();
      container.classList.add("model-ready");
      this.wake();
    });
    document.addEventListener("pointermove", (event) => {
      if (!this.followCursor || event.pointerType === "touch") return;
      const box = container.getBoundingClientRect();
      const dx = event.clientX - box.left - box.width / 2;
      const dy = event.clientY - box.top - box.height * .43;
      this.target.yaw = Math.max(-.65, Math.min(.65, Math.atan2(dx, box.height * 1.25)));
      this.target.pitch = Math.max(-.18, Math.min(.18, Math.atan2(dy, box.height * 2) * .4));
      this.wake();
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => this.resetPose());
    window.addEventListener("blur", () => this.resetPose());
    window.addEventListener("resize", () => this.wake());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        cancelAnimationFrame(this.frame);
        this.frame = null;
      } else this.wake();
    });
    this.resizeObserver = new ResizeObserver(() => this.wake());
    this.resizeObserver.observe(container.closest(".inventory-wrap") || container);
  }

  setFollowCursor(enabled) {
    this.followCursor = enabled;
    if (!enabled) this.resetPose();
  }

  resetPose() {
    this.target = { yaw: 0, pitch: 0 };
    this.wake();
  }

  buildTexture() {
    const atlas = document.createElement("canvas");
    atlas.width = 64;
    atlas.height = 128;
    const context = atlas.getContext("2d");
    context.imageSmoothingEnabled = false;
    const skin = "#ce9e7a", hair = "#1b1725", purple = "#6940db", navy = "#24233f";
    this.parts.forEach((part, row) => {
      const [width, height, depth] = part.size;
      part.faces = [];
      for (let face = 0; face < 6; face++) {
        const x = face * 10 + 1, y = row * 20 + 1;
        const w = face === 2 || face === 3 ? depth : width;
        const h = face >= 4 ? depth : height;
        part.faces.push({ x, y, width: w, height: h });
        context.save();
        context.translate(x, y);
        const rect = (color, rx, ry, rw, rh) => {
          context.fillStyle = color;
          context.fillRect(rx, ry, rw, rh);
        };
        if (face === 0) {
          context.drawImage(this.reference, ...part.crop, 0, 0, w, h);
        } else if (part.name === "head") {
          rect(skin, 0, 0, w, h);
          if (face === 4 || face === 1) {
            rect(hair, 0, 0, w, h);
            rect("#262030", 1, 1, 2, 1);
            rect("#221d2c", w - 3, 3, 2, 2);
            if (face === 1) rect(skin, 2, 7, 4, 1);
          } else if (face !== 5) {
            rect(hair, 0, 0, w, 2);
            rect(hair, face === 2 ? 0 : w - 1, 2, 1, 2);
            rect("#b78061", 3, 4, 2, 2);
          }
        } else if (part.name === "body") {
          rect(purple, 0, 0, w, h);
          if (face === 1) {
            rect("#49289c", 1, 0, 6, 4);
            rect("#5732bc", 2, 0, 4, 3);
            rect("#5c35c8", 0, 4, 1, 7);
            rect("#4b2b9f", 7, 4, 1, 7);
          } else if (face < 4) rect("#5732b9", 0, 0, 1, h);
          if (face < 4) rect("#432786", 0, h - 1, w, 1);
          if (face === 4) rect("#332249", 2, 0, 4, h);
        } else if (part.name.endsWith("arm")) {
          rect(purple, 0, 0, w, h);
          if (face < 4) {
            rect("#5932be", 0, 0, 1, h - 1);
            rect("#5832b6", 0, 9, w, 1);
            rect("#39256c", 0, 10, w, 1);
            rect(skin, 0, 11, w, 1);
          } else if (face === 5) rect(skin, 0, 0, w, h);
        } else {
          rect(navy, 0, 0, w, h);
          if (face < 4) {
            rect("#1a1a30", 0, 0, 1, 10);
            rect("#1c1b30", 0, 9, w, 1);
            rect("#dedce2", 0, 10, w, 1);
            rect("#85808f", 0, 11, w, 1);
          } else if (face === 5) rect("#706b7b", 0, 0, w, h);
        }
        context.restore();
      }
    });
    this.atlas = atlas;
  }

  initializeRenderer() {
    const gl = this.gl;
    const shader = (type, source) => {
      const result = gl.createShader(type);
      gl.shaderSource(result, source);
      gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
      return result;
    };
    const vertex = shader(gl.VERTEX_SHADER, `
      attribute vec3 position;
      attribute vec2 uv;
      attribute float light;
      varying vec2 textureUV;
      varying float brightness;
      void main() {
        gl_Position = vec4(position, 1.0);
        textureUV = uv;
        brightness = light;
      }`);
    const fragment = shader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform sampler2D skin;
      varying vec2 textureUV;
      varying float brightness;
      void main() {
        vec4 color = texture2D(skin, textureUV);
        gl_FragColor = vec4(color.rgb * brightness, color.a);
      }`);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    for (const [name, size, offset] of [["position", 3, 0], ["uv", 2, 12], ["light", 1, 20]]) {
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 24, offset);
    }
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.DITHER);
    gl.clearColor(0, 0, 0, 0);
    this.ready = true;
  }

  rotate([x, y, z], yaw, pitch) {
    const rx = x * Math.cos(yaw) + z * Math.sin(yaw);
    const rz = -x * Math.sin(yaw) + z * Math.cos(yaw);
    return [rx, y * Math.cos(pitch) - rz * Math.sin(pitch), y * Math.sin(pitch) + rz * Math.cos(pitch)];
  }

  draw() {
    const gl = this.gl;
    const box = this.container.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(box.width * ratio));
    const height = Math.max(1, Math.round(box.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const vertices = [];
    const halfHeight = 20, halfWidth = halfHeight * box.width / box.height;
    for (const part of this.parts) {
      const [w, h, d] = part.size.map((value) => value / 2);
      const faces = [
        [[-w,h,d],[w,h,d],[w,-h,d],[-w,-h,d],[0,0,1]],
        [[w,h,-d],[-w,h,-d],[-w,-h,-d],[w,-h,-d],[0,0,-1]],
        [[-w,h,-d],[-w,h,d],[-w,-h,d],[-w,-h,-d],[-1,0,0]],
        [[w,h,d],[w,h,-d],[w,-h,-d],[w,-h,d],[1,0,0]],
        [[-w,h,-d],[w,h,-d],[w,h,d],[-w,h,d],[0,1,0]],
        [[-w,-h,d],[w,-h,d],[w,-h,-d],[-w,-h,-d],[0,-1,0]],
      ];
      const headYaw = part.name === "head" ? this.pose.yaw * .18 : 0;
      const headPitch = part.name === "head" ? this.pose.pitch * .55 : 0;
      faces.forEach((face, faceIndex) => {
        const normal = this.rotate(this.rotate(face[4], headYaw, headPitch), this.pose.yaw, this.pose.pitch);
        if (normal[2] <= 0) return;
        const light = .72 + .28 * Math.max(0, normal[0] * -.35 + normal[1] * .45 + normal[2] * .82);
        const texture = part.faces[faceIndex];
        const uv = [[0,0],[1,0],[1,1],[0,1]];
        for (const corner of [0, 1, 2, 0, 2, 3]) {
          let point = this.rotate(face[corner], headYaw, headPitch);
          point = point.map((value, index) => value + part.center[index] - (index === 1 ? 16 : 0));
          point = this.rotate(point, this.pose.yaw, this.pose.pitch);
          vertices.push(point[0] / halfWidth, point[1] / halfHeight, -point[2] / 64,
            (texture.x + .01 + uv[corner][0] * (texture.width - .02)) / 64,
            (texture.y + .01 + uv[corner][1] * (texture.height - .02)) / 128, light);
        }
      });
    }
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 6);
  }

  wake() {
    if (!this.ready || this.frame || document.hidden) return;
    this.previousTime = performance.now();
    this.frame = requestAnimationFrame((time) => this.animate(time));
  }

  animate(time) {
    this.frame = null;
    const easing = 1 - Math.exp(-14 * Math.min((time - this.previousTime) / 1000, .05));
    this.previousTime = time;
    for (const axis of ["yaw", "pitch"]) this.pose[axis] += (this.target[axis] - this.pose[axis]) * easing;
    this.draw();
    const moving = Math.abs(this.target.yaw - this.pose.yaw) + Math.abs(this.target.pitch - this.pose.pitch) > .0001;
    if (moving) this.frame = requestAnimationFrame((next) => this.animate(next));
  }
};
