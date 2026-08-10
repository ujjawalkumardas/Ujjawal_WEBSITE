/* =========================================================
   Cursor fluid — a GPU Navier-Stokes solver driven by pointer motion.
   Each pointer move injects velocity + dye; the sim advects, applies
   vorticity confinement, then projects to a divergence-free field.
   ========================================================= */
(() => {
  const canvas = document.getElementById('fluid');
  if (!canvas) return;

  /* Skip where it would be wasted or unwelcome: no hover pointer, or reduced motion. */
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const config = {
    SIM_RESOLUTION: 128,
    DYE_RESOLUTION: 1440,
    DENSITY_DISSIPATION: 3.5,
    VELOCITY_DISSIPATION: 2,
    PRESSURE: 0.1,
    PRESSURE_ITERATIONS: 20,
    CURL: 3,
    SPLAT_RADIUS: 0.2,
    SPLAT_FORCE: 6000,
    SHADING: true,
    COLOR_UPDATE_SPEED: 10,
  };

  /* ---------------------------------------------------------
     Context
     --------------------------------------------------------- */
  const params = {
    alpha: true, depth: false, stencil: false,
    antialias: false, preserveDrawingBuffer: false,
  };

  let gl = canvas.getContext('webgl2', params);
  const isWebGL2 = !!gl;
  if (!gl) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
  if (!gl) return;

  let halfFloat, supportLinearFiltering;
  if (isWebGL2) {
    gl.getExtension('EXT_color_buffer_float');
    supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
  } else {
    halfFloat = gl.getExtension('OES_texture_half_float');
    supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
  }
  gl.clearColor(0, 0, 0, 1);

  const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;

  function supportRenderTextureFormat(internalFormat, format, type) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(texture);
    return ok;
  }

  /* Fall back down the channel counts until the driver accepts one. */
  function getSupportedFormat(internalFormat, format, type) {
    if (supportRenderTextureFormat(internalFormat, format, type)) {
      return { internalFormat, format };
    }
    if (!isWebGL2) return null;
    switch (internalFormat) {
      case gl.R16F:  return getSupportedFormat(gl.RG16F, gl.RG, type);
      case gl.RG16F: return getSupportedFormat(gl.RGBA16F, gl.RGBA, type);
      default:       return null;
    }
  }

  const formatRGBA = isWebGL2
    ? getSupportedFormat(gl.RGBA16F, gl.RGBA, halfFloatTexType)
    : getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType);
  const formatRG = isWebGL2
    ? getSupportedFormat(gl.RG16F, gl.RG, halfFloatTexType)
    : getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType);
  const formatR = isWebGL2
    ? getSupportedFormat(gl.R16F, gl.RED, halfFloatTexType)
    : getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType);

  if (!formatRGBA) return; /* no float render targets — bail rather than draw garbage */
  if (!supportLinearFiltering) config.DYE_RESOLUTION = 512;

  /* ---------------------------------------------------------
     Shaders
     --------------------------------------------------------- */
  function compile(type, source, keywords) {
    let src = source;
    if (keywords) src = keywords.map(k => `#define ${k}\n`).join('') + source;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  function link(vs, fs) {
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
    }
    return program;
  }

  function uniforms(program) {
    const map = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(program, i).name;
      map[name] = gl.getUniformLocation(program, name);
    }
    return map;
  }

  class Program {
    constructor(vs, fs) {
      this.program = link(vs, fs);
      this.uniforms = uniforms(this.program);
    }
    bind() { gl.useProgram(this.program); }
  }

  const baseVertex = compile(gl.VERTEX_SHADER, `
    precision highp float;
    attribute vec2 aPosition;
    varying vec2 vUv, vL, vR, vT, vB;
    uniform vec2 texelSize;
    void main () {
      vUv = aPosition * 0.5 + 0.5;
      vL = vUv - vec2(texelSize.x, 0.0);
      vR = vUv + vec2(texelSize.x, 0.0);
      vT = vUv + vec2(0.0, texelSize.y);
      vB = vUv - vec2(0.0, texelSize.y);
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `);

  const copyShader = compile(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    void main () { gl_FragColor = texture2D(uTexture, vUv); }
  `);

  const clearShader = compile(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;
    void main () { gl_FragColor = value * texture2D(uTexture, vUv); }
  `);

  /* Dye is lit by its own gradient so the smoke reads as volume, not flat colour. */
  const displayShader = compile(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv, vL, vR, vT, vB;
    uniform sampler2D uTexture;
    uniform vec2 texelSize;
    void main () {
      vec3 c = texture2D(uTexture, vUv).rgb;
    #ifdef SHADING
      vec3 lc = texture2D(uTexture, vL).rgb;
      vec3 rc = texture2D(uTexture, vR).rgb;
      vec3 tc = texture2D(uTexture, vT).rgb;
      vec3 bc = texture2D(uTexture, vB).rgb;
      float dx = length(rc) - length(lc);
      float dy = length(tc) - length(bc);
      vec3 n = normalize(vec3(dx, dy, length(texelSize)));
      float diffuse = clamp(dot(n, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);
      c *= diffuse;
    #endif
      float a = max(c.r, max(c.g, c.b));
      gl_FragColor = vec4(c, a);
    }
  `, config.SHADING ? ['SHADING'] : null);

  const splatShader = compile(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;
    void main () {
      vec2 p = vUv - point.xy;
      p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      vec3 base = texture2D(uTarget, vUv).xyz;
      gl_FragColor = vec4(base + splat, 1.0);
    }
  `);

  /* MANUAL_FILTERING reproduces bilinear sampling where the driver can't filter floats. */
  const advectionShader = compile(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform vec2 dyeTexelSize;
    uniform float dt;
    uniform float dissipation;

    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
      vec2 st = uv / tsize - 0.5;
      vec2 iuv = floor(st);
      vec2 fuv = fract(st);
      vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
      vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
      vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
      vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
      return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }

    void main () {
    #ifdef MANUAL_FILTERING
      vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
      vec4 result = bilerp(uSource, coord, dyeTexelSize);
    #else
      vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
      vec4 result = texture2D(uSource, coord);
    #endif
      float decay = 1.0 + dissipation * dt;
      gl_FragColor = result / decay;
    }
  `, supportLinearFiltering ? null : ['MANUAL_FILTERING']);

  const divergenceShader = compile(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv, vL, vR, vT, vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).x;
      float R = texture2D(uVelocity, vR).x;
      float T = texture2D(uVelocity, vT).y;
      float B = texture2D(uVelocity, vB).y;
      vec2 C = texture2D(uVelocity, vUv).xy;
      if (vL.x < 0.0)  { L = -C.x; }
      if (vR.x > 1.0)  { R = -C.x; }
      if (vT.y > 1.0)  { T = -C.y; }
      if (vB.y < 0.0)  { B = -C.y; }
      gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
    }
  `);

  const curlShader = compile(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv, vL, vR, vT, vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).y;
      float R = texture2D(uVelocity, vR).y;
      float T = texture2D(uVelocity, vT).x;
      float B = texture2D(uVelocity, vB).x;
      gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
    }
  `);

  /* Vorticity confinement puts back the small curls the advection step smears out. */
  const vorticityShader = compile(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv, vL, vR, vT, vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float curl;
    uniform float dt;
    void main () {
      float L = texture2D(uCurl, vL).x;
      float R = texture2D(uCurl, vR).x;
      float T = texture2D(uCurl, vT).x;
      float B = texture2D(uCurl, vB).x;
      float C = texture2D(uCurl, vUv).x;

      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= curl * C;
      force.y *= -1.0;

      vec2 velocity = texture2D(uVelocity, vUv).xy;
      velocity += force * dt;
      velocity = min(max(velocity, -1000.0), 1000.0);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
  `);

  const pressureShader = compile(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv, vL, vR, vT, vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      float divergence = texture2D(uDivergence, vUv).x;
      gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
    }
  `);

  const gradientSubtractShader = compile(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv, vL, vR, vT, vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      vec2 velocity = texture2D(uVelocity, vUv).xy;
      velocity.xy -= vec2(R - L, T - B);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
  `);

  const copyProgram = new Program(baseVertex, copyShader);
  const clearProgram = new Program(baseVertex, clearShader);
  const splatProgram = new Program(baseVertex, splatShader);
  const advectionProgram = new Program(baseVertex, advectionShader);
  const divergenceProgram = new Program(baseVertex, divergenceShader);
  const curlProgram = new Program(baseVertex, curlShader);
  const vorticityProgram = new Program(baseVertex, vorticityShader);
  const pressureProgram = new Program(baseVertex, pressureShader);
  const gradienSubtractProgram = new Program(baseVertex, gradientSubtractShader);
  const displayProgram = new Program(baseVertex, displayShader);

  /* ---------------------------------------------------------
     Fullscreen blit
     --------------------------------------------------------- */
  const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    return (target, clear = false) => {
      if (target == null) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else {
        gl.viewport(0, 0, target.width, target.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      }
      if (clear) {
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };
  })();

  /* ---------------------------------------------------------
     Render targets
     --------------------------------------------------------- */
  let dye, velocity, divergence, curl, pressure;

  function createFBO(w, h, internalFormat, format, type, filter) {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture, fbo, width: w, height: h,
      texelSizeX: 1 / w, texelSizeY: 1 / h,
      attach(id) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      },
    };
  }

  function createDoubleFBO(w, h, internalFormat, format, type, filter) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, filter);
    let fbo2 = createFBO(w, h, internalFormat, format, type, filter);
    return {
      width: w, height: h,
      texelSizeX: fbo1.texelSizeX, texelSizeY: fbo1.texelSizeY,
      get read() { return fbo1; },
      set read(v) { fbo1 = v; },
      get write() { return fbo2; },
      set write(v) { fbo2 = v; },
      swap() { const t = fbo1; fbo1 = fbo2; fbo2 = t; },
    };
  }

  function resizeFBO(target, w, h, internalFormat, format, type, filter) {
    const next = createFBO(w, h, internalFormat, format, type, filter);
    copyProgram.bind();
    gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
    blit(next);
    return next;
  }

  function resizeDoubleFBO(target, w, h, internalFormat, format, type, filter) {
    if (target.width === w && target.height === h) return target;
    target.read = resizeFBO(target.read, w, h, internalFormat, format, type, filter);
    target.write = createFBO(w, h, internalFormat, format, type, filter);
    target.width = w;
    target.height = h;
    target.texelSizeX = 1 / w;
    target.texelSizeY = 1 / h;
    return target;
  }

  function getResolution(resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1 / aspectRatio;
    const min = Math.round(resolution);
    const max = Math.round(resolution * aspectRatio);
    return gl.drawingBufferWidth > gl.drawingBufferHeight
      ? { width: max, height: min }
      : { width: min, height: max };
  }

  function initFramebuffers() {
    const simRes = getResolution(config.SIM_RESOLUTION);
    const dyeRes = getResolution(config.DYE_RESOLUTION);
    const texType = halfFloatTexType;
    const filtering = supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    gl.disable(gl.BLEND);

    dye = dye
      ? resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, formatRGBA.internalFormat, formatRGBA.format, texType, filtering)
      : createDoubleFBO(dyeRes.width, dyeRes.height, formatRGBA.internalFormat, formatRGBA.format, texType, filtering);

    velocity = velocity
      ? resizeDoubleFBO(velocity, simRes.width, simRes.height, formatRG.internalFormat, formatRG.format, texType, filtering)
      : createDoubleFBO(simRes.width, simRes.height, formatRG.internalFormat, formatRG.format, texType, filtering);

    divergence = createFBO(simRes.width, simRes.height, formatR.internalFormat, formatR.format, texType, gl.NEAREST);
    curl = createFBO(simRes.width, simRes.height, formatR.internalFormat, formatR.format, texType, gl.NEAREST);
    pressure = createDoubleFBO(simRes.width, simRes.height, formatR.internalFormat, formatR.format, texType, gl.NEAREST);
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      return true;
    }
    return false;
  }

  /* ---------------------------------------------------------
     Pointer state
     --------------------------------------------------------- */
  function makePointer() {
    return {
      texcoordX: 0, texcoordY: 0,
      prevTexcoordX: 0, prevTexcoordY: 0,
      deltaX: 0, deltaY: 0,
      moved: false,
      color: { r: 0, g: 0, b: 0 },
    };
  }
  const pointer = makePointer();

  /* HSV keeps successive splats vivid and evenly spaced around the wheel. */
  function HSVtoRGB(h, s, v) {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: return { r: v, g: t, b: p };
      case 1: return { r: q, g: v, b: p };
      case 2: return { r: p, g: v, b: t };
      case 3: return { r: p, g: q, b: v };
      case 4: return { r: t, g: p, b: v };
      default: return { r: v, g: p, b: q };
    }
  }

  /* Palette-locked: scarlet through deep red, with occasional white puffs so the
     trail keeps some tonal range instead of reading as one flat red. */
  function generateColor() {
    let c;
    if (Math.random() < 0.22) {
      c = { r: 1, g: 1, b: 1 };
    } else {
      const hue = (0.985 + Math.random() * 0.035) % 1;  /* ~354°–366° */
      c = HSVtoRGB(hue, 0.82 + Math.random() * 0.18, 1.0);
    }
    c.r *= 0.18; c.g *= 0.18; c.b *= 0.18;
    return c;
  }

  function correctDeltaX(delta) {
    const aspectRatio = canvas.width / canvas.height;
    return aspectRatio < 1 ? delta * aspectRatio : delta;
  }
  function correctDeltaY(delta) {
    const aspectRatio = canvas.width / canvas.height;
    return aspectRatio > 1 ? delta / aspectRatio : delta;
  }

  function updatePointer(x, y) {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = x / canvas.clientWidth;
    pointer.texcoordY = 1 - y / canvas.clientHeight;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
  }

  let firstMove = true;
  window.addEventListener('pointermove', e => {
    if (firstMove) {
      /* Seed both coords so the first frame doesn't splat a streak from 0,0 */
      pointer.texcoordX = e.clientX / canvas.clientWidth;
      pointer.texcoordY = 1 - e.clientY / canvas.clientHeight;
      pointer.color = generateColor();
      firstMove = false;
      return;
    }
    updatePointer(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener('pointerdown', () => { pointer.color = generateColor(); }, { passive: true });

  /* ---------------------------------------------------------
     Splats
     --------------------------------------------------------- */
  function correctRadius(radius) {
    const aspectRatio = canvas.width / canvas.height;
    return aspectRatio > 1 ? radius * aspectRatio : radius;
  }

  function splat(x, y, dx, dy, color) {
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x, y);
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(splatProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100));
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
    blit(dye.write);
    dye.swap();
  }

  function applyInputs() {
    if (!pointer.moved) return;
    pointer.moved = false;
    const dx = pointer.deltaX * config.SPLAT_FORCE;
    const dy = pointer.deltaY * config.SPLAT_FORCE;
    splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
  }

  /* ---------------------------------------------------------
     Simulation step
     --------------------------------------------------------- */
  function step(dt) {
    gl.disable(gl.BLEND);

    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();

    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    /* Jacobi iterations on the pressure Poisson equation */
    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    gradienSubtractProgram.bind();
    gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!supportLinearFiltering) {
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    }
    let velocityId = velocity.read.attach(0);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
    gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    if (!supportLinearFiltering) {
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
    }
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
  }

  function render() {
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    displayProgram.bind();
    gl.uniform2f(displayProgram.uniforms.texelSize, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
    gl.uniform1i(displayProgram.uniforms.uTexture, dye.read.attach(0));
    blit(null);
  }

  /* ---------------------------------------------------------
     Loop
     --------------------------------------------------------- */
  let lastUpdate = Date.now();
  let colorTimer = 0;

  function calcDeltaTime() {
    const now = Date.now();
    let dt = (now - lastUpdate) / 1000;
    dt = Math.min(dt, 0.016666);
    lastUpdate = now;
    return dt;
  }

  function updateColor(dt) {
    colorTimer += dt * config.COLOR_UPDATE_SPEED;
    if (colorTimer >= 1) {
      colorTimer = colorTimer % 1;
      pointer.color = generateColor();
    }
  }

  function update() {
    const dt = calcDeltaTime();
    if (resizeCanvas()) initFramebuffers();
    updateColor(dt);
    applyInputs();
    step(dt);
    render();
    requestAnimationFrame(update);
  }

  resizeCanvas();
  initFramebuffers();
  pointer.color = generateColor();
  update();
})();
