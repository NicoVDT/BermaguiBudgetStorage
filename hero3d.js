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

  // ----- environment: real photographed sunset sky (Poly Haven CC0) -----
  // A real equirect photo is what makes the paint and steel read as physical:
  // every reflection and sheen comes from an actual sky.
  var pmrem = new T.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  new T.TextureLoader().load("static/3d/env.jpg", function (tex) {
    tex.mapping = T.EquirectangularReflectionMapping;
    if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
  });

  // ----- lighting -----
  // The HDRI environment does most of the work now; directional lights only
  // add the sun key (shadows) and a soft camera-side fill.
  scene.add(new T.HemisphereLight(0xf2ead9, 0x2a2722, 0.55));
  var key = new T.DirectionalLight(0xffe7c4, 2.1);
  key.position.set(-8, 12, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  var scam = key.shadow.camera;
  scam.left = -8; scam.right = 8; scam.top = 8; scam.bottom = -8; scam.near = 1; scam.far = 44;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key);
  var rim = new T.DirectionalLight(0xffcf9a, 0.7);
  rim.position.set(10, 5, -8);
  scene.add(rim);
  // front fill from the camera side so the face we see stays bright tan.
  // The doors chapter looks at the +x end, away from the sun key, so a second
  // fill from +x keeps that face readable when the doors swing open.
  var fill = new T.DirectionalLight(0xfff6ea, 1.0);
  fill.position.set(8, 5, 11);
  scene.add(fill);
  var doorFill = new T.DirectionalLight(0xffeede, 0.7);
  doorFill.position.set(14, 3, 2);
  scene.add(doorFill);

  // ----- photoscanned PBR textures (Poly Haven "Container Side", CC0) -----
  // diff = real paint with scratches/wear (recoloured green -> fleet tan),
  // nor  = the actual corrugation profile, dents and weld seams,
  // arm  = AO / roughness / metalness scanned from the same panel.
  function cv(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

  var TAN = 0xc2a567;   // clean warm tan, matches the real fleet
  var texLoader = new T.TextureLoader();
  var maxAniso = renderer.capabilities.getMaxAnisotropy();

  // Every surface gets its own clone (different repeat), sharing the image.
  var pbrMats = [];   // { mat, rx, ry }
  function applyMaps(base, key) {
    pbrMats.forEach(function (e) {
      var t = base.clone();
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.anisotropy = maxAniso;
      t.repeat.set(e.rx, e.ry);
      t.needsUpdate = true;
      e.mat[key] = t;
      if (key === "map") e.mat.color.set(0xffffff);   // tint now baked in
      e.mat.needsUpdate = true;
    });
  }

  // The scan covers ~2m of panel (7 corrugation periods per tile).
  // rx is chosen per surface so the corrugation pitch stays ~0.29m, true to a
  // real 20ft box. Until the maps arrive the material is plain tan, so there
  // is never a grey flash.
  function tanMat(rx, ry) {
    var m = new T.MeshStandardMaterial({
      color: TAN, roughness: 0.55, metalness: 0.2, envMapIntensity: 1.1,
      normalScale: new T.Vector2(1.1, 1.1)
    });
    pbrMats.push({ mat: m, rx: rx, ry: ry || 1.2 });
    return m;
  }

  texLoader.load("static/3d/container_diff.jpg", function (t) {
    // Recolour the green scan to the fleet tan: keep per-pixel luminance
    // (scratches, grime, fade) and re-tint the chroma.
    var img = t.image;
    var c = cv(img.width, img.height), g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    var id = g.getImageData(0, 0, c.width, c.height), d = id.data;
    var sum = 0, i, n = d.length / 4;
    for (i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    var avg = sum / n;                       // scan's mean luminance
    var tr = 172, tg = 144, tb = 86;         // richer tan; tone mapping lifts it
    for (i = 0; i < d.length; i += 4) {
      var l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / avg;
      d[i]     = Math.min(255, tr * l);
      d[i + 1] = Math.min(255, tg * l);
      d[i + 2] = Math.min(255, tb * l);
    }
    g.putImageData(id, 0, 0);
    var tex = new T.CanvasTexture(c);
    if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = T.LinearMipmapLinearFilter;
    applyMaps(tex, "map");
  });
  texLoader.load("static/3d/container_nor.jpg", function (t) { applyMaps(t, "normalMap"); });
  texLoader.load("static/3d/container_arm.jpg", function (t) {
    applyMaps(t, "aoMap");
    applyMaps(t, "roughnessMap");
    applyMaps(t, "metalnessMap");
    // maps take over; roughness 0.85 scales the scan down a touch so the
    // paint keeps a satin sheen instead of going full matte clay
    pbrMats.forEach(function (e) { e.mat.roughness = 0.85; e.mat.metalness = 1; });
  });
  // polygonOffset pulls these trims slightly toward the camera in the depth
  // buffer so they always win over the coplanar wall faces (no shimmer).
  // Real boxes have the frame painted the same colour as the panels, just a
  // touch darker from shadowing and thicker paint; satin so it never sparkles.
  var steelDark = new T.MeshStandardMaterial({ color: 0x84703e, roughness: 0.52, metalness: 0.25, envMapIntensity: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  var castMat = new T.MeshStandardMaterial({ color: 0x35322c, roughness: 0.6, metalness: 0.45, envMapIntensity: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  var rodMat = new T.MeshStandardMaterial({ color: 0xb8b4ac, roughness: 0.38, metalness: 0.85, envMapIntensity: 0.8 });
  var gasketMat = new T.MeshStandardMaterial({ color: 0x14130f, roughness: 0.95, metalness: 0.0 });
  var floorMat = new T.MeshStandardMaterial({ color: 0x241f19, roughness: 0.8, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
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

  // Floor/roof slabs are recessed 3cm inside the wall planes: their dark side
  // faces previously sat EXACTLY on the same plane as the tan walls where they
  // overlap, which z-fought as a stippled band along the bottom/top edges.
  var floor = box(L - 0.06, 0.18, W - 0.06, floorMat);
  floor.position.set(0, -H / 2 + 0.09, 0);
  root.add(floor); register(floor, [0, -9, 0], [0, 0, 0]);

  var inner = new T.Mesh(new T.BoxGeometry(L - 0.2, H - 0.24, W - 0.2), interiorMat);
  root.add(inner); register(inner, [0, -9, 0], [0, 0, 0]);

  // Walls run slightly TALLER than the gap so they overlap into the roof/floor
  // slabs instead of meeting them on the same plane (no coplanar z-fight).
  var wallH = H - 0.12;
  // Narrower than W so its edges tuck inside the side walls (never coplanar).
  var backWall = box(wall, wallH, W - 0.1, tanMat(1.2));
  backWall.position.set(-L / 2 + wall / 2, 0, 0);
  root.add(backWall); register(backWall, [-11, 1, -5], [0, 0.6, 0]);

  var leftWall = box(L - 0.1, wallH, wall, tanMat(3));
  leftWall.position.set(0, 0, -W / 2 + wall / 2);
  root.add(leftWall); register(leftWall, [-4, 3, -12], [0.4, 0, 0]);

  var rightWall = box(L - 0.1, wallH, wall, tanMat(3));
  rightWall.position.set(0, 0, W / 2 - wall / 2);
  root.add(rightWall); register(rightWall, [3, 2, 12], [-0.4, 0, 0]);

  var roof = box(L - 0.06, 0.1, W - 0.06, tanMat(3));
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
    var dp = box(0.06, H - 0.2, W / 2 - 0.08, tanMat(0.58));
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
  // All keyframes sit on a ~15m orbit and target the container centre, so the
  // whole box stays framed the same way through every chapter — no awkward
  // close-ups. The 0.61 key faces the door end square-on while the doors are
  // open (doors open 0.5–0.9). Keys line up with the caption windows.
  var KF = [
    [0.00,  9.0, 4.6, 12.5,  0.0, 0.3, 0.0],
    [0.23,  3.0, 2.8, 14.5,  0.0, 0.2, 0.0],   // long side, low hero angle
    [0.42, -8.5, 3.6, 12.0,  0.0, 0.2, 0.0],   // opposite three-quarter
    [0.61, 13.5, 2.6,  7.5,  0.0, 0.1, 0.0],   // facing the open doors
    [0.80, 11.0, 4.8, 10.0,  0.0, 0.3, 0.0],   // elevated front, doors open
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
    // Scroll-lock the heading: any drag spin / idle drift fades out by ~20%
    // scroll, so every chapter always frames the exact same side of the box
    // (doors face the camera in the doors chapter, however long you idled).
    root.rotation.y = -0.42 + spinOffset * Math.max(0, 1 - p * 5);
    root.position.y += ((H / 2 + idleBob) - root.position.y) * 0.1;

    // camera flies along keyframes by scroll; parallax nudges only near the top
    cameraAt(p);
    // Portrait phones: at the very top the headline sits over the box, so ease
    // the framing down (and slightly back) until the copy scrolls away.
    if (camera.aspect < 0.75) {
      var lift = Math.max(0, 1 - p / 0.16);
      _ct.y += lift * 1.5;
      _cp.x *= 1 + lift * 0.12;
      _cp.z *= 1 + lift * 0.12;
    }
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
