/* Bermagui Budget Storage: cinematic, photoreal 3D shipping container hero.
   Apple-product-page style: the container stays centred while the CAMERA orbits
   it through chapters; captions crossfade in sync. Realism comes from a
   procedurally-generated environment map (reflections), ACES filmic tone
   mapping, fine corrugation, weathering and physically-based metals.
   - Slow, cinematic self-assembly on load (~6s).
   - Drag to spin, click the doors to open, gentle idle drift.
   - GSAP ScrollTrigger scrubs a tall stage: camera flies between keyframes,
     doors open for the access chapter, chapter captions fade in/out.
   - Static photo fallback only when WebGL is unavailable.
   Vanilla JS + self-hosted Three.js/GSAP. */
(function () {
  "use strict";

  var docEl = document.documentElement;
  var canvas = document.getElementById("heroCanvas");
  var sticky = document.getElementById("heroSticky");
  var stage = document.getElementById("heroStage");
  var hint = document.getElementById("heroHint");
  var chapterEls = Array.prototype.slice.call(document.querySelectorAll("#chapters .chapter"));

  function webglOK() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch (_) { return false; }
  }
  if (!webglOK() || !window.THREE) { docEl.classList.add("no3d"); return; }

  var T = window.THREE;
  var hasGSAP = !!(window.gsap && window.ScrollTrigger);
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  // ----- renderer -----
  var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  if (T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;

  var scene = new T.Scene();
  // Tight near/far range = far better depth precision (kills edge z-fighting).
  var camera = new T.PerspectiveCamera(38, 1, 0.4, 90);

  // ----- environment map for realistic reflections (procedural, no assets) -----
  (function buildEnvironment() {
    var envScene = new T.Scene();
    // gradient sky dome
    var skyCanvas = document.createElement("canvas");
    skyCanvas.width = 16; skyCanvas.height = 256;
    var sg = skyCanvas.getContext("2d");
    var grd = sg.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0.0, "#cfd6dc");   // sky
    grd.addColorStop(0.45, "#a7adb1");
    grd.addColorStop(0.55, "#6f6a60");   // horizon
    grd.addColorStop(1.0, "#2b2924");   // ground
    sg.fillStyle = grd; sg.fillRect(0, 0, 16, 256);
    var skyTex = new T.CanvasTexture(skyCanvas);
    skyTex.mapping = T.EquirectangularReflectionMapping;
    var dome = new T.Mesh(
      new T.SphereGeometry(50, 24, 16),
      new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide })
    );
    envScene.add(dome);
    // bright soft panels act as studio lights in the reflection
    function panel(x, y, z, s, c) {
      var m = new T.Mesh(new T.PlaneGeometry(s, s), new T.MeshBasicMaterial({ color: c }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m);
    }
    panel(-12, 14, 6, 16, 0xffffff);
    panel(14, 8, -8, 12, 0xfff0d8);
    panel(0, -6, 14, 14, 0x8893a0);

    var pmrem = new T.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  })();

  // ----- lighting -----
  scene.add(new T.HemisphereLight(0xeef2f6, 0x2a2722, 0.5));
  var key = new T.DirectionalLight(0xfff4e2, 2.4);
  key.position.set(-8, 12, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  var scam = key.shadow.camera;
  scam.left = -8; scam.right = 8; scam.top = 8; scam.bottom = -8; scam.near = 1; scam.far = 44;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key);
  var rim = new T.DirectionalLight(0xffd9a0, 1.0);
  rim.position.set(10, 5, -8);
  scene.add(rim);
  // front fill from the camera side so the face we see stays bright tan
  var fill = new T.DirectionalLight(0xfff6ea, 1.0);
  fill.position.set(8, 5, 11);
  scene.add(fill);

  // ----- procedural textures -----
  function cv(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

  // Weathered tan paint: base tone + mottled sun-fade + rust streaks low down.
  function paintTexture() {
    var c = cv(512, 512), g = c.getContext("2d");
    g.fillStyle = "#c2a567"; g.fillRect(0, 0, 512, 512);
    var i, x, y, v;
    for (i = 0; i < 5000; i++) {
      x = Math.random() * 512; y = Math.random() * 512; v = (Math.random() - 0.5) * 26;
      g.fillStyle = "rgba(" + (194 + v) + "," + (165 + v) + "," + (103 + v) + ",0.4)";
      g.fillRect(x, y, 3, 3);
    }
    // light rust streaks low down (the fleet is clean, so keep it subtle)
    for (i = 0; i < 14; i++) {
      x = Math.random() * 512; y = 380 + Math.random() * 120;
      var len = 16 + Math.random() * 60;
      var grd = g.createLinearGradient(x, y, x, y + len);
      grd.addColorStop(0, "rgba(120,70,34,0)");
      grd.addColorStop(0.4, "rgba(120,68,30,0.14)");
      grd.addColorStop(1, "rgba(90,50,24,0)");
      g.fillStyle = grd; g.fillRect(x, y, 1.2 + Math.random() * 1.5, len);
    }
    // scuffs
    g.strokeStyle = "rgba(60,46,26,0.14)"; g.lineWidth = 2;
    for (i = 0; i < 18; i++) {
      g.beginPath(); x = Math.random() * 512; y = Math.random() * 512;
      g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 20); g.stroke();
    }
    var t = new T.CanvasTexture(c);
    if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  // Roughness map: rust patches are rougher; paint mid; gives varied sheen.
  function roughnessTexture() {
    var c = cv(256, 256), g = c.getContext("2d");
    g.fillStyle = "#9a9a9a"; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 400; i++) {
      var x = Math.random() * 256, y = 120 + Math.random() * 136;
      g.fillStyle = "rgba(220,220,220," + (0.1 + Math.random() * 0.3) + ")";
      g.beginPath(); g.arc(x, y, 2 + Math.random() * 6, 0, 6.28); g.fill();
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  // Corrugation bump (vertical bands). A taller canvas + anisotropic filtering
  // are essential: at grazing angles near the floor the fine vertical stripes
  // otherwise alias into a shimmering moiré band (the "flickering" at the
  // bottom edge). Anisotropy + mipmaps resolve those stripes cleanly.
  function corrugation(reps) {
    var c = cv(512, 64), g = c.getContext("2d");
    for (var i = 0; i < reps; i++) {
      var w = 512 / reps, x0 = w * i, grd = g.createLinearGradient(x0, 0, x0 + w, 0);
      grd.addColorStop(0.0, "#2a2a2a"); grd.addColorStop(0.3, "#ffffff");
      grd.addColorStop(0.5, "#f4f4f4"); grd.addColorStop(0.7, "#ffffff");
      grd.addColorStop(1.0, "#161616");
      g.fillStyle = grd; g.fillRect(x0, 0, w, 64);
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.generateMipmaps = true;
    t.minFilter = T.LinearMipmapLinearFilter;
    return t;
  }

  var TAN = 0xc2a567;   // clean warm tan, matches the real fleet
  var paint = paintTexture();
  var rough = roughnessTexture();

  function tanMat(reps) {
    var bump = corrugation(reps);
    // Painted steel = dielectric: keep metalness low so the tan stays bright,
    // let the env map add only a soft sheen on the corrugation ridges.
    return new T.MeshStandardMaterial({
      color: TAN, map: paint, roughnessMap: rough, roughness: 0.62, metalness: 0.16,
      bumpMap: bump, bumpScale: 0.03, envMapIntensity: 0.55
    });
  }
  // polygonOffset pulls these trims slightly toward the camera in the depth
  // buffer so they always win over the coplanar wall faces (no shimmer).
  // Roughness kept fairly high + envMapIntensity modest: sharp little metal
  // parts at grazing angles are the #1 source of specular "sparkle" flicker as
  // the camera orbits, so we deliberately keep them satin rather than mirror.
  var steelDark = new T.MeshStandardMaterial({ color: 0x6f5829, roughness: 0.58, metalness: 0.55, envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  var castMat = new T.MeshStandardMaterial({ color: 0x2b2b28, roughness: 0.55, metalness: 0.55, envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  var rodMat = new T.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.46, metalness: 0.7, envMapIntensity: 0.55 });
  var gasketMat = new T.MeshStandardMaterial({ color: 0x14130f, roughness: 0.95, metalness: 0.0 });
  var floorMat = new T.MeshStandardMaterial({ color: 0x241f19, roughness: 0.8, metalness: 0.3 });
  var interiorMat = new T.MeshStandardMaterial({ color: 0xb8a06a, roughness: 0.85, metalness: 0.1, side: T.BackSide });

  // ----- dimensions (20ft ISO, metres) -----
  var L = 6.06, H = 2.59, W = 2.44, wall = 0.06;

  var root = new T.Group();
  root.position.y = H / 2;
  root.rotation.y = -0.42;
  scene.add(root);

  var parts = [];
  function register(obj, from, fromRot) {
    obj.userData.home = { p: obj.position.clone(), r: obj.rotation.clone() };
    obj.userData.from = { p: new T.Vector3(from[0], from[1], from[2]),
      r: new T.Euler(fromRot[0], fromRot[1], fromRot[2]) };
    parts.push(obj);
  }
  function box(w, h, d, mats) {
    var m = new T.Mesh(new T.BoxGeometry(w, h, d), mats);
    m.castShadow = true; m.receiveShadow = true; return m;
  }

  var floor = box(L, 0.18, W, floorMat);
  floor.position.set(0, -H / 2 + 0.09, 0);
  root.add(floor); register(floor, [0, -9, 0], [0, 0, 0]);

  var inner = new T.Mesh(new T.BoxGeometry(L - 0.2, H - 0.24, W - 0.2), interiorMat);
  root.add(inner); register(inner, [0, -9, 0], [0, 0, 0]);

  // Walls run slightly TALLER than the gap so they overlap into the roof/floor
  // slabs instead of meeting them on the same plane (no coplanar z-fight).
  var wallH = H - 0.12;
  var backWall = box(wall, wallH, W, tanMat(9));
  backWall.position.set(-L / 2 + wall / 2, 0, 0);
  root.add(backWall); register(backWall, [-11, 1, -5], [0, 0.6, 0]);

  var leftWall = box(L - 0.1, wallH, wall, tanMat(22));
  leftWall.position.set(0, 0, -W / 2 + wall / 2);
  root.add(leftWall); register(leftWall, [-4, 3, -12], [0.4, 0, 0]);

  var rightWall = box(L - 0.1, wallH, wall, tanMat(22));
  rightWall.position.set(0, 0, W / 2 - wall / 2);
  root.add(rightWall); register(rightWall, [3, 2, 12], [-0.4, 0, 0]);

  var roof = box(L, 0.1, W, tanMat(22));
  roof.position.set(0, H / 2 - 0.05, 0);
  root.add(roof); register(roof, [0, 11, 0], [0, 0, 0.34]);

  function rail(sx, sy, sz, x, y, z, from) {
    var m = box(sx, sy, sz, steelDark); m.position.set(x, y, z);
    root.add(m); register(m, from, [0, 0, 0]); return m;
  }
  // Edge rails sit a touch proud of the panels so they read as real trims and
  // never share a plane with the walls.
  var rt = 0.1;
  [-1, 1].forEach(function (iy) {
    rail(L, rt, rt, 0, iy * (H / 2 - 0.02), -W / 2 + 0.02, [0, iy * 9, -9]);
    rail(L, rt, rt, 0, iy * (H / 2 - 0.02), W / 2 - 0.02, [0, iy * 9, 9]);
  });

  [-1, 1].forEach(function (ix) {
    [-1, 1].forEach(function (iy) {
      [-1, 1].forEach(function (iz) {
        var cc = box(0.26, 0.26, 0.26, castMat);
        cc.position.set(ix * (L / 2 - 0.06), iy * (H / 2 - 0.06), iz * (W / 2 - 0.06));
        root.add(cc); register(cc, [ix * 12, iy * 10, iz * 10], [0.7, 0.5, 0]);
      });
    });
  });

  // ----- doors -----
  function makeDoor(sign) {
    var pivot = new T.Group();
    pivot.position.set(L / 2 - 0.03, 0, sign * (W / 2 - 0.05));
    var leaf = new T.Group();
    var dp = box(0.06, H - 0.2, W / 2 - 0.08, tanMat(4));
    dp.position.set(0, 0, -sign * (W / 4 - 0.04)); leaf.add(dp);
    var gasket = box(0.02, H - 0.16, W / 2 - 0.02, gasketMat);
    gasket.position.set(-0.04, 0, -sign * (W / 4 - 0.04)); leaf.add(gasket);
    [-1, 1].forEach(function (o) {
      var rz = -sign * (W / 4 - 0.04) + o * 0.28;
      var rod = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, H - 0.34, 14), rodMat);
      rod.position.set(0.06, 0, rz); rod.castShadow = true; leaf.add(rod);
      var handle = box(0.06, 0.34, 0.05, rodMat); handle.position.set(0.11, -0.15, rz); leaf.add(handle);
    });
    leaf.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    pivot.add(leaf);
    pivot.userData.open = sign * 2.15;
    return pivot;
  }
  var doorL = makeDoor(1), doorR = makeDoor(-1);
  root.add(doorL); root.add(doorR);
  register(doorL, [14, 0, 7], [0, -0.9, 0]);
  register(doorR, [14, 0, -7], [0, 0.9, 0]);

  var interiorLight = new T.PointLight(0xffcaa0, 0, 7, 2);
  interiorLight.position.set(-1.4, 0.2, 0);
  root.add(interiorLight);

  // back-wall sign (visible when doors open)
  var sc2 = cv(512, 256), sg2 = sc2.getContext("2d");
  sg2.fillStyle = "#b8a06a"; sg2.fillRect(0, 0, 512, 256);
  sg2.fillStyle = "#1a1a18"; sg2.textAlign = "center"; sg2.font = "bold 56px Georgia, serif";
  sg2.fillText("BERMAGUI", 256, 112);
  sg2.font = "bold 38px Georgia, serif"; sg2.fillText("BUDGET STORAGE", 256, 162);
  sg2.font = "24px Georgia, serif"; sg2.fillStyle = "#5a4a22"; sg2.fillText("since 2022", 256, 208);
  var signTex = new T.CanvasTexture(sc2);
  if (T.SRGBColorSpace) signTex.colorSpace = T.SRGBColorSpace;
  var sign = new T.Mesh(new T.PlaneGeometry(W - 0.5, (W - 0.5) / 2),
    new T.MeshStandardMaterial({ map: signTex, roughness: 0.85 }));
  sign.position.set(-L / 2 + wall + 0.02, 0.1, 0); sign.rotation.y = Math.PI / 2;
  root.add(sign); register(sign, [-11, 1, -5], [0, 0.6, 0]);

  var ground = new T.Mesh(new T.PlaneGeometry(80, 80), new T.ShadowMaterial({ opacity: 0.34 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -H / 2 - 0.001; ground.receiveShadow = true;
  scene.add(ground);

  // scatter parts to start
  parts.forEach(function (p) {
    p.position.copy(p.userData.from.p); p.rotation.copy(p.userData.from.r);
    p.userData.mats = [];
    p.traverse(function (o) {
      if (o.isMesh && o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          m.transparent = true; m.opacity = 0; p.userData.mats.push(m);
        });
      }
    });
  });

  function resize() {
    var w = sticky.clientWidth, h = sticky.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", function () { resize(); if (hasGSAP) ScrollTrigger.refresh(); });

  // ----- slow cinematic assembly -----
  var assembled = false;
  function assemble() {
    if (!hasGSAP) {
      parts.forEach(function (p) {
        p.position.copy(p.userData.home.p); p.rotation.copy(p.userData.home.r);
        p.userData.mats.forEach(function (m) { m.opacity = 1; });
      });
      assembled = true; return;
    }
    var tl = gsap.timeline({ delay: 0.35, onComplete: function () { assembled = true; } });
    parts.forEach(function (p, i) {
      var home = p.userData.home, d = i * 0.16;   // slower stagger
      p.userData.mats.forEach(function (m) {
        tl.to(m, { opacity: 1, duration: 1.1, ease: "power1.out" }, d);
      });
      tl.to(p.position, { x: home.p.x, y: home.p.y, z: home.p.z,
        duration: 2.0, ease: "power3.out" }, d);                 // slow glide
      tl.to(p.rotation, { x: home.r.x, y: home.r.y, z: home.r.z,
        duration: 1.7, ease: "back.out(1.1)" }, d);              // gentle settle, no big bounce
    });
    if (hint) tl.fromTo(hint, { opacity: 0 }, { opacity: 1, duration: 0.8 }, ">-0.4");
  }

  // ----- doors -----
  var doorsOpen = false;
  function setDoors(open, dur) {
    doorsOpen = open;
    if (!hasGSAP) {
      doorL.rotation.y = open ? doorL.userData.open : 0;
      doorR.rotation.y = open ? doorR.userData.open : 0;
      interiorLight.intensity = open ? 1.8 : 0; return;
    }
    gsap.to(doorL.rotation, { y: open ? doorL.userData.open : 0, duration: dur || 1.0, ease: "power2.inOut" });
    gsap.to(doorR.rotation, { y: open ? doorR.userData.open : 0, duration: dur || 1.0, ease: "power2.inOut" });
    gsap.to(interiorLight, { intensity: open ? 2.0 : 0, duration: dur || 1.0 });
  }

  // ----- camera keyframes (Apple-style orbit) -----
  // [progress, camX,camY,camZ, tgtX,tgtY,tgtZ]
  var KF = [
    [0.00,  9.0, 4.6, 12.5,  0.0, 0.3, 0.0],
    [0.20,  1.0, 3.4, 13.5,  0.0, 0.2, 0.0],
    [0.40, 11.5, 2.7,  6.5,  0.0, 0.1, 0.0],
    [0.58,  8.6, 1.7,  8.2,  0.6, 0.0, 1.4],
    [0.74,  3.6, 1.5,  6.0, -1.0, 0.1, 0.0],
    [0.90,  9.0, 4.3, 12.5,  0.0, 0.4, 0.0],
    [1.00,  9.0, 4.6, 12.5,  0.0, 0.3, 0.0]
  ];
  var _cp = new T.Vector3(), _ct = new T.Vector3();
  function smooth(t) { return t * t * (3 - 2 * t); }
  function cameraAt(p) {
    var a = KF[0], b = KF[KF.length - 1], i;
    for (i = 0; i < KF.length - 1; i++) {
      if (p >= KF[i][0] && p <= KF[i + 1][0]) { a = KF[i]; b = KF[i + 1]; break; }
    }
    var span = b[0] - a[0] || 1, t = smooth((p - a[0]) / span);
    _cp.set(a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t);
    _ct.set(a[4] + (b[4] - a[4]) * t, a[5] + (b[5] - a[5]) * t, a[6] + (b[6] - a[6]) * t);
  }

  // ----- interaction: drag spin + parallax -----
  var dragging = false, lastX = 0, spinOffset = 0, spinVel = 0;
  var targetTiltX = 0, targetTiltY = 0, tiltX = 0, tiltY = 0;
  var lastInteract = performance.now();
  function poke() { lastInteract = performance.now(); }

  var downXY = null;
  canvas.addEventListener("pointerdown", function (e) {
    dragging = true; lastX = e.clientX; downXY = [e.clientX, e.clientY];
    canvas.style.cursor = "grabbing";
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener("pointermove", function (e) {
    var r = canvas.getBoundingClientRect();
    targetTiltY = (((e.clientX - r.left) / r.width) - 0.5) * 0.12;
    targetTiltX = (((e.clientY - r.top) / r.height) - 0.5) * 0.1;
    if (dragging) { spinVel = (e.clientX - lastX) * 0.005; spinOffset += spinVel; lastX = e.clientX; poke(); }
  });
  function up(e) {
    dragging = false; canvas.style.cursor = "grab";
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  canvas.addEventListener("pointerup", function (e) {
    up(e);
    if (downXY) {
      var moved = Math.abs(e.clientX - downXY[0]) + Math.abs(e.clientY - downXY[1]);
      downXY = null;
      if (moved <= 6 && assembled) {
        var r = canvas.getBoundingClientRect();
        pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        ray.setFromCamera(pointer, camera);
        if (ray.intersectObjects([doorL, doorR], true).length) { setDoors(!doorsOpen); poke(); }
      }
    }
  });
  canvas.addEventListener("pointerleave", function () { targetTiltX = 0; targetTiltY = 0; });
  canvas.style.cursor = "grab";
  var ray = new T.Raycaster(), pointer = new T.Vector2();

  if (window.DeviceOrientationEvent) {
    window.addEventListener("deviceorientation", function (ev) {
      if (ev.gamma == null) return;
      targetTiltY = Math.max(-0.12, Math.min(0.12, (ev.gamma / 45) * 0.12));
    });
  }

  // ----- scroll progress + chapter captions -----
  var scrollProg = 0;
  if (hasGSAP) {
    ScrollTrigger.create({ trigger: stage, start: "top top", end: "bottom bottom",
      scrub: 0.7, onUpdate: function (s) { scrollProg = s.progress; } });
    gsap.to("#heroCopy", { opacity: 0, y: -24, ease: "none",
      scrollTrigger: { trigger: stage, start: "top top", end: "12% top", scrub: true } });
    gsap.to("#scrollCue", { opacity: 0, ease: "none",
      scrollTrigger: { trigger: stage, start: "top top", end: "8% top", scrub: true } });
  }
  var chapters = chapterEls.map(function (el) {
    return { el: el, s: parseFloat(el.dataset.start), e: parseFloat(el.dataset.end) };
  });
  function updateChapters(p) {
    chapters.forEach(function (c) {
      var o = 0, ty = 24;
      var mid = (c.s + c.e) / 2, halfIn = (mid - c.s) * 0.55;
      if (p >= c.s && p <= c.e) {
        if (p < c.s + halfIn) o = (p - c.s) / halfIn;
        else if (p > c.e - halfIn) o = (c.e - p) / halfIn;
        else o = 1;
        o = Math.max(0, Math.min(1, o));
        ty = (1 - o) * 24;
      }
      c.el.style.opacity = o.toFixed(3);
      c.el.style.transform = "translate(-50%, calc(-50% + " + ty.toFixed(1) + "px))";
    });
  }

  // ----- render loop -----
  function tick() {
    var now = performance.now(), idle = now - lastInteract > 2800;
    var p = scrollProg;

    // doors auto-open for the access chapter
    var wantOpen = p > 0.5 && p < 0.9;
    if (wantOpen !== doorsOpen) setDoors(wantOpen, 0.9);

    // container: mostly still (camera orbits). Drag adds spin; gentle idle drift at top.
    spinVel *= 0.92;
    if (!dragging) spinOffset += (idle && p < 0.06 ? 0.0014 : 0);
    var idleBob = (idle && p < 0.08) ? Math.sin(now * 0.0011) * 0.05 : 0;
    root.rotation.y = -0.42 + spinOffset;
    root.position.y += ((H / 2 + idleBob) - root.position.y) * 0.1;

    // camera flies along keyframes by scroll; parallax nudges only near the top
    cameraAt(p);
    var strength = Math.max(0, 1 - p * 5);
    tiltX += (targetTiltX * strength - tiltX) * 0.06;
    tiltY += (targetTiltY * strength - tiltY) * 0.06;
    camera.position.set(_cp.x + tiltY * 4, _cp.y - tiltX * 3.5, _cp.z);
    camera.lookAt(_ct);

    updateChapters(p);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  assemble();
  tick();
})();
