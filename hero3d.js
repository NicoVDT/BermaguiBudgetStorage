/* Bermagui Budget Storage: interactive 3D shipping container hero.
   - Realistic 20ft tan container built procedurally (corrugation, corner
     castings, door lock rods + handles, rubber gaskets, scuffs).
   - On load the parts fly in from 3D space and snap together (floor, walls,
     roof, doors) with spring easing via GSAP.
   - Once assembled: mouse / gyro parallax tilt, click the doors to swing them
     open and reveal a lit interior, gentle idle bob.
   - GSAP ScrollTrigger scrubs the whole scene: the container slides aside and
     shrinks, the doors open for the "sizes" beat, then it settles.
   - Static image fallback for prefers-reduced-motion or no WebGL.
   Vanilla JS + CDN libs; deploys as-is to GitHub Pages. */
(function () {
  "use strict";

  var docEl = document.documentElement;
  var canvas = document.getElementById("heroCanvas");
  var sticky = document.getElementById("heroSticky");
  var stage = document.getElementById("heroStage");
  var hint = document.getElementById("heroHint");
  var cue = document.getElementById("scrollCue");
  var stageWord = document.getElementById("heroStageWord");

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function webglOK() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch (_) { return false; }
  }

  // Fall back to the static layout if we can't (or shouldn't) run 3D.
  if (reduced || !webglOK() || !window.THREE) {
    docEl.classList.add("no3d");
    return;
  }

  var T = window.THREE;
  var hasGSAP = !!(window.gsap && window.ScrollTrigger);
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  // ----- renderer / scene / camera -----
  var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  if (T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;

  var scene = new T.Scene();
  var camera = new T.PerspectiveCamera(34, 1, 0.1, 200);
  camera.position.set(8.5, 4.2, 11);
  camera.lookAt(0, 0.4, 0);

  // ----- lighting: above-left key + soft fill -----
  scene.add(new T.HemisphereLight(0xfff6e8, 0x3a3a32, 1.25));
  var key = new T.DirectionalLight(0xfff2dc, 2.9);
  key.position.set(-7, 11, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  var sc = key.shadow.camera;
  sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 40;
  key.shadow.bias = -0.0004;
  scene.add(key);
  var rim = new T.DirectionalLight(0xffd9a0, 1.1);
  rim.position.set(9, 4, -7);
  scene.add(rim);
  // front fill from the camera side so the face nearest us isn't muddy
  var fill = new T.DirectionalLight(0xffffff, 1.1);
  fill.position.set(8, 5, 10);
  scene.add(fill);

  // ----- procedural textures (drawn on canvases, no external assets) -----
  function makeCanvas(w, h) {
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    return c;
  }
  // Tan paint with subtle sun-fade mottling + faint scuffs.
  function paintTexture() {
    var c = makeCanvas(256, 256), g = c.getContext("2d");
    g.fillStyle = "#9c7a3c"; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 1400; i++) {
      var x = Math.random() * 256, y = Math.random() * 256;
      var v = (Math.random() - 0.5) * 26;
      g.fillStyle = "rgba(" + (156 + v) + "," + (122 + v) + "," + (60 + v) + ",0.35)";
      g.fillRect(x, y, 2, 2);
    }
    // a few darker scuffs
    g.strokeStyle = "rgba(60,46,24,0.18)"; g.lineWidth = 2;
    for (var s = 0; s < 14; s++) {
      g.beginPath();
      var sx = Math.random() * 256, sy = Math.random() * 256;
      g.moveTo(sx, sy); g.lineTo(sx + (Math.random() - 0.5) * 40, sy + (Math.random() - 0.5) * 18);
      g.stroke();
    }
    var t = new T.CanvasTexture(c);
    if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }
  // Corrugation as a normal-ish bump: repeating light/dark vertical bands.
  function corrugation(reps) {
    var c = makeCanvas(512, 16), g = c.getContext("2d");
    for (var i = 0; i < reps; i++) {
      var w = 512 / reps, x0 = w * i;
      var grd = g.createLinearGradient(x0, 0, x0 + w, 0);
      grd.addColorStop(0.0, "#3a3a3a");
      grd.addColorStop(0.28, "#ffffff");
      grd.addColorStop(0.5, "#f2f2f2");
      grd.addColorStop(0.72, "#ffffff");
      grd.addColorStop(1.0, "#1f1f1f");
      g.fillStyle = grd; g.fillRect(x0, 0, w, 16);
    }
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }

  var TAN = 0x9c7a3c;
  var paint = paintTexture();

  function sideMaterial(reps, vertical) {
    var bump = corrugation(reps);
    if (vertical) bump.rotation = Math.PI / 2, bump.center.set(0.5, 0.5);
    var m = new T.MeshStandardMaterial({
      color: TAN, map: paint, roughness: 0.72, metalness: 0.35,
      bumpMap: bump, bumpScale: 0.04
    });
    return m;
  }

  var steelDark = new T.MeshStandardMaterial({ color: 0x6f5829, roughness: 0.5, metalness: 0.6 });
  var castMat = new T.MeshStandardMaterial({ color: 0x2b2b28, roughness: 0.6, metalness: 0.7 });
  var rodMat = new T.MeshStandardMaterial({ color: 0x8a6f34, roughness: 0.35, metalness: 0.85 });
  var gasketMat = new T.MeshStandardMaterial({ color: 0x1a1a18, roughness: 0.9, metalness: 0.1 });
  var floorMat = new T.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.85, metalness: 0.2 });
  var interiorMat = new T.MeshStandardMaterial({ color: 0xb8a06a, roughness: 0.9, metalness: 0.1, side: T.BackSide });

  // ----- dimensions (metres, 20ft ISO) -----
  var L = 6.06, H = 2.59, W = 2.44, wall = 0.06;

  // Container root. Children carry their own "home" position; assembly tweens
  // them from a start offset back to home.
  var root = new T.Group();
  root.position.y = H / 2;
  root.rotation.y = -0.34;       // isometric-ish, front + one side visible
  scene.add(root);

  var parts = [];   // { mesh, home:{pos,rot}, from:{pos,rot} }
  function register(obj, fromPos, fromRot) {
    obj.userData.home = { p: obj.position.clone(), r: obj.rotation.clone() };
    obj.userData.from = {
      p: new T.Vector3(fromPos[0], fromPos[1], fromPos[2]),
      r: new T.Euler(fromRot[0], fromRot[1], fromRot[2])
    };
    parts.push(obj);
  }

  function panel(w, h, d, mats) {
    var g = new T.BoxGeometry(w, h, d);
    var m = new T.Mesh(g, mats);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // Floor frame (dark steel) sits at the bottom.
  var floor = panel(L, 0.18, W, floorMat);
  floor.position.set(0, -H / 2 + 0.09, 0);
  root.add(floor); register(floor, [0, -7, 0], [0, 0, 0]);

  // Interior shell (so open doors reveal walls, not see-through).
  var inner = new T.Mesh(new T.BoxGeometry(L - 0.14, H - 0.2, W - 0.14), interiorMat);
  inner.position.set(0, 0, 0);
  root.add(inner); register(inner, [0, -7, 0], [0, 0, 0]);

  // Back wall (closed end, -X) with horizontal corrugation.
  var backWall = panel(wall, H - 0.2, W, sideMaterial(12, false));
  backWall.position.set(-L / 2 + wall / 2, 0, 0);
  root.add(backWall); register(backWall, [-9, 1, -4], [0, 0.5, 0]);

  // Long side walls (-Z and +Z) with vertical corrugation.
  var leftWall = panel(L - 0.1, H - 0.2, wall, sideMaterial(40, false));
  leftWall.position.set(0, 0, -W / 2 + wall / 2);
  root.add(leftWall); register(leftWall, [-3, 2, -10], [0.3, 0, 0]);

  var rightWall = panel(L - 0.1, H - 0.2, wall, sideMaterial(40, false));
  rightWall.position.set(0, 0, W / 2 - wall / 2);
  root.add(rightWall); register(rightWall, [2, 1.5, 10], [-0.3, 0, 0]);

  // Roof with shallow corrugation.
  var roof = panel(L, 0.1, W, sideMaterial(36, false));
  roof.position.set(0, H / 2 - 0.05, 0);
  root.add(roof); register(roof, [0, 9, 0], [0, 0, 0.3]);

  // Top + bottom side rails and corner posts (frame).
  function rail(sx, sy, sz, x, y, z, from) {
    var m = panel(sx, sy, sz, steelDark);
    m.position.set(x, y, z);
    root.add(m); register(m, from, [0, 0, 0]);
    return m;
  }
  var rt = 0.1;
  [-1, 1].forEach(function (iy) {
    rail(L, rt, rt, 0, iy * (H / 2 - 0.05), -W / 2 + 0.05, [0, iy * 8, -8]);
    rail(L, rt, rt, 0, iy * (H / 2 - 0.05), W / 2 - 0.05, [0, iy * 8, 8]);
  });

  // 8 corner casting blocks (dark, chunky).
  [-1, 1].forEach(function (ix) {
    [-1, 1].forEach(function (iy) {
      [-1, 1].forEach(function (iz) {
        var cc = panel(0.26, 0.26, 0.26, castMat);
        cc.position.set(ix * (L / 2 - 0.06), iy * (H / 2 - 0.06), iz * (W / 2 - 0.06));
        root.add(cc);
        register(cc, [ix * 11, iy * 9, iz * 9], [0.6, 0.4, 0]);
      });
    });
  });

  // ----- doors (+X end): two leaves on hinge pivots, with gaskets, rods, handles -----
  function makeDoor(sign) {
    // pivot at the outer vertical edge so it swings like a real door
    var pivot = new T.Group();
    var hingeZ = sign * (W / 2 - 0.05);
    pivot.position.set(L / 2 - 0.03, 0, hingeZ);

    var leaf = new T.Group();
    var doorPanel = panel(0.06, H - 0.2, W / 2 - 0.08, sideMaterial(8, false));
    doorPanel.position.set(0, 0, -sign * (W / 4 - 0.04));
    leaf.add(doorPanel);

    // rubber gasket frame
    var gasket = panel(0.02, H - 0.16, W / 2 - 0.02, gasketMat);
    gasket.position.set(-0.04, 0, -sign * (W / 4 - 0.04));
    leaf.add(gasket);

    // two lock rods + handles per leaf
    [-1, 1].forEach(function (o) {
      var rz = -sign * (W / 4 - 0.04) + o * 0.28;
      var rod = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, H - 0.34, 12), rodMat);
      rod.position.set(0.06, 0, rz); rod.castShadow = true;
      leaf.add(rod);
      var handle = new T.Mesh(new T.BoxGeometry(0.06, 0.34, 0.05), rodMat);
      handle.position.set(0.11, -0.15, rz);
      leaf.add(handle);
    });
    leaf.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    pivot.add(leaf);
    pivot.userData.closed = 0;
    pivot.userData.open = sign * 2.1;  // radians swing outward
    return pivot;
  }
  var doorL = makeDoor(1);
  var doorR = makeDoor(-1);
  root.add(doorL); root.add(doorR);
  // doors fly in last, from the front
  register(doorL, [13, 0, 6], [0, -0.8, 0]);
  register(doorR, [13, 0, -6], [0, 0.8, 0]);

  // Faint warm interior glow lamp (lights up when doors open).
  var interiorLight = new T.PointLight(0xffcaa0, 0, 6, 2);
  interiorLight.position.set(-1.4, 0.2, 0);
  root.add(interiorLight);

  // Back-wall "sign" with the business name, visible when doors open.
  var signCanvas = makeCanvas(512, 256), sg = signCanvas.getContext("2d");
  sg.fillStyle = "#b8a06a"; sg.fillRect(0, 0, 512, 256);
  sg.fillStyle = "#1a1a18"; sg.textAlign = "center";
  sg.font = "bold 54px Georgia, serif";
  sg.fillText("BERMAGUI", 256, 110);
  sg.font = "bold 40px Georgia, serif";
  sg.fillText("BUDGET STORAGE", 256, 165);
  sg.font = "26px Georgia, serif";
  sg.fillStyle = "#5a4a22";
  sg.fillText("since 2022", 256, 210);
  var signTex = new T.CanvasTexture(signCanvas);
  if (T.SRGBColorSpace) signTex.colorSpace = T.SRGBColorSpace;
  var sign = new T.Mesh(new T.PlaneGeometry(W - 0.5, (W - 0.5) / 2),
    new T.MeshStandardMaterial({ map: signTex, roughness: 0.8 }));
  sign.position.set(-L / 2 + wall + 0.02, 0.1, 0);
  sign.rotation.y = Math.PI / 2;
  root.add(sign); register(sign, [-9, 1, -4], [0, 0.5, 0]);

  // ----- contact shadow ground -----
  var ground = new T.Mesh(new T.PlaneGeometry(60, 60), new T.ShadowMaterial({ opacity: 0.32 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -H / 2 - 0.001;
  ground.receiveShadow = true;
  scene.add(ground);

  // ----- start state: parts scattered + invisible -----
  parts.forEach(function (p) {
    p.position.copy(p.userData.from.p);
    p.rotation.copy(p.userData.from.r);
    p.userData.mats = [];
    p.traverse(function (o) {
      if (o.isMesh && o.material) {
        var mm = Array.isArray(o.material) ? o.material : [o.material];
        mm.forEach(function (m) { m.transparent = true; m.opacity = 0; p.userData.mats.push(m); });
      }
    });
  });

  // ----- resize -----
  function resize() {
    var w = sticky.clientWidth, h = sticky.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", function () { resize(); if (hasGSAP) ScrollTrigger.refresh(); });

  // ----- assembly animation on load -----
  var assembled = false;
  function assemble() {
    if (!hasGSAP) {
      // No GSAP: just snap to home and show.
      parts.forEach(function (p) {
        p.position.copy(p.userData.home.p); p.rotation.copy(p.userData.home.r);
        p.userData.mats.forEach(function (m) { m.opacity = 1; });
      });
      assembled = true; return;
    }
    var tl = gsap.timeline({ onComplete: function () { assembled = true; revealHint(); } });
    parts.forEach(function (p, i) {
      var home = p.userData.home;
      var delay = i * 0.045;
      // fade in
      p.userData.mats.forEach(function (m) {
        tl.to(m, { opacity: 1, duration: 0.5, ease: "power1.out" }, delay);
      });
      tl.to(p.position, {
        x: home.p.x, y: home.p.y, z: home.p.z,
        duration: 1.1, ease: "elastic.out(0.85, 0.6)"
      }, delay);
      tl.to(p.rotation, {
        x: home.r.x, y: home.r.y, z: home.r.z,
        duration: 0.9, ease: "power3.out"
      }, delay);
    });
  }

  function revealHint() {
    if (hint) gsap.fromTo(hint, { opacity: 0 }, { opacity: 1, duration: 0.6 });
  }

  // ----- door open/close (click + scroll) -----
  var doorsOpen = false;
  function setDoors(open, dur) {
    doorsOpen = open;
    if (!hasGSAP) {
      doorL.rotation.y = open ? doorL.userData.open : 0;
      doorR.rotation.y = open ? doorR.userData.open : 0;
      interiorLight.intensity = open ? 1.6 : 0;
      return;
    }
    gsap.to(doorL.rotation, { y: open ? doorL.userData.open : 0, duration: dur || 0.9, ease: "power2.inOut" });
    gsap.to(doorR.rotation, { y: open ? doorR.userData.open : 0, duration: dur || 0.9, ease: "power2.inOut" });
    gsap.to(interiorLight, { intensity: open ? 1.8 : 0, duration: dur || 0.9 });
  }

  // raycast door clicks
  var ray = new T.Raycaster(), pointer = new T.Vector2();
  var downXY = null;
  canvas.addEventListener("pointerdown", function (e) { downXY = [e.clientX, e.clientY]; });
  canvas.addEventListener("pointerup", function (e) {
    if (!assembled || !downXY) return;
    var moved = Math.abs(e.clientX - downXY[0]) + Math.abs(e.clientY - downXY[1]);
    downXY = null;
    if (moved > 6) return; // that was a drag, not a click
    var r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(pointer, camera);
    var hits = ray.intersectObjects([doorL, doorR], true);
    if (hits.length) { setDoors(!doorsOpen); pokeIdle(); }
  });

  // ----- drag to spin + mouse parallax tilt -----
  var spinVel = 0, dragging = false, lastX = 0, autoSpin = 0.0016;
  var tiltX = 0, tiltY = 0, targetTiltX = 0, targetTiltY = 0;
  var lastInteract = performance.now();
  function pokeIdle() { lastInteract = performance.now(); }

  canvas.addEventListener("pointerdown", function (e) {
    dragging = true; lastX = e.clientX; canvas.style.cursor = "grabbing";
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener("pointermove", function (e) {
    var r = canvas.getBoundingClientRect();
    targetTiltY = (((e.clientX - r.left) / r.width) - 0.5) * 0.17;   // up to ~10deg
    targetTiltX = (((e.clientY - r.top) / r.height) - 0.5) * 0.14;
    if (dragging) { spinVel = (e.clientX - lastX) * 0.005; root.rotation.y += spinVel; lastX = e.clientX; pokeIdle(); }
  });
  function endDrag(e) { dragging = false; canvas.style.cursor = "grab"; try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointerleave", function () { targetTiltX = 0; targetTiltY = 0; });
  canvas.style.cursor = "grab";

  // gyroscope tilt on mobile
  if (window.DeviceOrientationEvent) {
    window.addEventListener("deviceorientation", function (ev) {
      if (ev.gamma == null) return;
      targetTiltY = Math.max(-0.17, Math.min(0.17, (ev.gamma / 45) * 0.17));
      targetTiltX = Math.max(-0.14, Math.min(0.14, ((ev.beta - 45) / 45) * 0.14));
    });
  }

  // ----- scroll choreography -----
  var scrollProg = 0;     // 0..1 across the hero stage
  if (hasGSAP) {
    ScrollTrigger.create({
      trigger: stage,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.6,
      onUpdate: function (self) { scrollProg = self.progress; }
    });
    // fade hero copy + cue out as we leave the first screen
    gsap.to("#heroCopy", {
      opacity: 0, y: -30, ease: "none",
      scrollTrigger: { trigger: stage, start: "top top", end: "30% top", scrub: true }
    });
    gsap.to("#scrollCue", {
      opacity: 0, ease: "none",
      scrollTrigger: { trigger: stage, start: "top top", end: "12% top", scrub: true }
    });
    if (stageWord) {
      stageWord.innerHTML = "Two sizes.<br>One fair price.<small>Full $250/mo &middot; Half $150/mo</small>";
      gsap.fromTo("#heroStageWord", { opacity: 0, x: 40 }, {
        opacity: 1, x: 0, ease: "none",
        scrollTrigger: { trigger: stage, start: "38% top", end: "62% top", scrub: true }
      });
    }
  }

  // ----- render loop -----
  var clock = new T.Clock();
  function tick() {
    var dt = clock.getDelta();
    var now = performance.now();
    var idle = now - lastInteract > 2600;

    if (assembled) {
      // scroll-driven master pose
      // 0.0-0.35: front view, settle.   0.35-0.7: rotate to show side, doors open, slide right + shrink.
      // 0.7-1.0: ease to a calm parked pose.
      var p = scrollProg;
      var baseRotY = -0.34 - p * 1.5;
      var targetScale = 1 - p * 0.34;
      var targetPosX = p * 2.6;          // slide to the right (world units)
      var targetPosY = H / 2 + Math.sin(p * Math.PI) * 0.3;

      // doors driven by scroll beat (open through the middle of the stage)
      var wantOpen = p > 0.4 && p < 0.96;
      if (wantOpen !== doorsOpen) setDoors(wantOpen, 0.7);

      if (!dragging) {
        // blend auto-spin (only near top) with scroll rotation
        var autoComponent = (p < 0.05 && idle) ? autoSpin : 0;
        root.rotation.y += (baseRotY - root.rotation.y) * 0.08 + autoComponent;
      }
      root.scale.setScalar(root.scale.x + (targetScale - root.scale.x) * 0.1);
      root.position.x += (targetPosX - root.position.x) * 0.1;
      root.position.y += (targetPosY - root.position.y) * 0.1;

      // idle bob + breathing when untouched and at the top
      if (idle && p < 0.1) {
        var b = Math.sin(now * 0.0012);
        root.position.y = targetPosY + b * 0.06;
        root.rotation.z = Math.sin(now * 0.0009) * 0.006;
      } else {
        root.rotation.z += (0 - root.rotation.z) * 0.1;
      }

      // mouse / gyro parallax tilt (only near the top, before scroll takes over)
      var tiltStrength = Math.max(0, 1 - p * 4);
      tiltX += (targetTiltX * tiltStrength - tiltX) * 0.06;
      tiltY += (targetTiltY * tiltStrength - tiltY) * 0.06;
      camera.position.x = 8.5 + tiltY * 6;
      camera.position.y = 4.2 - tiltX * 5;
      camera.lookAt(root.position.x, 0.4, 0);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  // kick off
  assemble();
  tick();
})();
