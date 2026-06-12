/* Bermagui Budget Storage — "Will it fit?" visualiser.
   Photoreal dollhouse: the container uses the same scanned PBR maps as the
   hero, and whichever walls face the camera fade out automatically as it
   spins, so you always see inside a realistic box (live cutaway, like the
   pre-rendered images storage sites use — but interactive).
   Lazy-initialised only when the section scrolls into view. */
(function () {
  "use strict";

  var canvas = document.getElementById("fitCanvas");
  var stage = document.getElementById("fitStage");
  var verdictEl = document.getElementById("fitVerdict");
  if (!canvas || !window.THREE) return;
  var T = window.THREE;

  // interior of a 20ft box, metres
  var L = 5.9, W = 2.35, H = 2.39;
  var FLOOR = -H / 2;

  var started = false, renderer, scene, camera, root, items, divider, walls = [];
  var spin = 0.6, spinVel = 0, dragging = false, lastX = 0, autoSpin = true;
  var _camLocal = new T.Vector3();

  function mat(c, r, m) {
    return new T.MeshStandardMaterial({ color: c, roughness: r == null ? 0.85 : r, metalness: m || 0 });
  }
  var cardboardA, cardboardB, fabric, white, steel, dark;

  function buildScene() {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    if (T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(33, 1, 0.5, 60);
    camera.position.set(8.2, 4.6, 9.0);
    camera.lookAt(0, -0.3, 0);

    scene.add(new T.HemisphereLight(0xfff4e4, 0x44403a, 0.65));
    var key = new T.DirectionalLight(0xfff0dc, 1.7);
    key.position.set(-5, 9, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    var sc = key.shadow.camera;
    sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 2; sc.far = 30;
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
    scene.add(key);
    var fill = new T.DirectionalLight(0xe8eef6, 0.5);
    fill.position.set(7, 3, -6); scene.add(fill);

    cardboardA = mat(0xa9824f); cardboardB = mat(0x97713f);
    fabric = mat(0x5c6258, 0.95); white = mat(0xd8d4cc, 0.6);
    steel = mat(0x8a8d90, 0.5, 0.4); dark = mat(0x3a3733, 0.7, 0.2);

    root = new T.Group();
    root.rotation.y = spin;
    scene.add(root);

    // ---- environment for realistic reflections (same sky as the hero) ----
    var pmrem = new T.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    new T.TextureLoader().load("static/3d/env.jpg", function (tex) {
      tex.mapping = T.EquirectangularReflectionMapping;
      if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      scene.environment = pmrem.fromEquirectangular(tex).texture;
      tex.dispose();
    });

    // ---- photoreal container shell (scanned PBR maps, recoloured tan) ----
    // Each wall has its OWN material so its opacity can fade independently
    // when it faces the camera (dollhouse cutaway).
    var maxAniso = renderer.capabilities.getMaxAnisotropy();
    var wallMats = [];
    function wallMat(rx) {
      var m = new T.MeshStandardMaterial({
        color: 0xc2a567, roughness: 0.55, metalness: 0.2, envMapIntensity: 0.9,
        normalScale: new T.Vector2(1.0, 1.0),
        transparent: true, opacity: 1, depthWrite: false, side: T.DoubleSide
      });
      wallMats.push({ mat: m, rx: rx });
      return m;
    }
    function applyMaps(base, key) {
      wallMats.forEach(function (e) {
        var t = base.clone();
        t.wrapS = t.wrapT = T.RepeatWrapping;
        t.anisotropy = maxAniso;
        t.repeat.set(e.rx, 1.0);
        t.needsUpdate = true;
        e.mat[key] = t;
        if (key === "map") e.mat.color.set(0xffffff);
        e.mat.needsUpdate = true;
      });
    }
    var texLoader = new T.TextureLoader();
    texLoader.load("static/3d/container_diff.jpg", function (t) {
      var img = t.image;
      var c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      var g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      var id = g.getImageData(0, 0, c.width, c.height), d = id.data;
      var sum = 0, i;
      for (i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      var avg = sum / (d.length / 4);
      for (i = 0; i < d.length; i += 4) {
        var l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / avg;
        d[i] = Math.min(255, 172 * l); d[i + 1] = Math.min(255, 144 * l); d[i + 2] = Math.min(255, 86 * l);
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
      applyMaps(t, "aoMap"); applyMaps(t, "roughnessMap"); applyMaps(t, "metalnessMap");
      wallMats.forEach(function (e) { e.mat.roughness = 0.85; e.mat.metalness = 1; });
    });

    // walls: [w, h, x, y, z, rotY, outwardNormal, textureRepeat]
    function wall(w, h, x, z, ry, nx, nz, rx) {
      var m = new T.Mesh(new T.PlaneGeometry(w, h), wallMat(rx));
      m.position.set(x, 0, z); m.rotation.y = ry;
      root.add(m);
      walls.push({ mesh: m, n: new T.Vector3(nx, 0, nz) });
      return m;
    }
    wall(L, H, 0, -W / 2, 0, 0, -1, 3);              // far side
    wall(L, H, 0, W / 2, 0, 0, 1, 3);                // near side
    wall(W, H, -L / 2, 0, Math.PI / 2, -1, 0, 1.2);  // back
    wall(W, H, L / 2, 0, Math.PI / 2, 1, 0, 1.2);    // door end
    var roof = new T.Mesh(new T.PlaneGeometry(L, W), wallMat(3));
    roof.rotation.x = -Math.PI / 2; roof.position.y = H / 2;
    root.add(roof);
    walls.push({ mesh: roof, n: new T.Vector3(0, 1, 0) });

    // plywood floor (always solid, catches the shadows)
    var floor = new T.Mesh(new T.BoxGeometry(L + 0.16, 0.14, W + 0.16), mat(0x8d7148, 0.92));
    floor.position.y = FLOOR - 0.07; floor.receiveShadow = true; root.add(floor);

    // steel frame stays solid: it reads as a real box even with walls faded
    var frameMat = mat(0x84703e, 0.55, 0.25);
    function rail(sx, sy, sz, x, y, z) {
      var m = new T.Mesh(new T.BoxGeometry(sx, sy, sz), frameMat);
      m.position.set(x, y, z); m.castShadow = true; root.add(m);
    }
    var rt = 0.09;
    [-1, 1].forEach(function (iy) {
      [-1, 1].forEach(function (iz) { rail(L + 0.16, rt, rt, 0, iy * H / 2, iz * W / 2); });
      [-1, 1].forEach(function (ix) { rail(rt, rt, W + 0.16, ix * L / 2, iy * H / 2, 0); });
    });
    var castM = mat(0x35322c, 0.6, 0.45);
    [-1, 1].forEach(function (ix) {
      [-1, 1].forEach(function (iz) {
        rail(rt, H + 0.16, rt, ix * L / 2, 0, iz * W / 2);
        [-1, 1].forEach(function (iy) {
          var cc = new T.Mesh(new T.BoxGeometry(0.2, 0.2, 0.2), castM);
          cc.position.set(ix * L / 2, iy * H / 2, iz * W / 2);
          root.add(cc);
        });
      });
    });

    // half-container divider (shown for "half" verdicts)
    divider = new T.Mesh(new T.PlaneGeometry(W, H),
      new T.MeshBasicMaterial({ color: 0xc0510a, transparent: true, opacity: 0.0, side: T.DoubleSide, depthWrite: false }));
    divider.rotation.y = Math.PI / 2;
    divider.position.x = -L / 2 + 3.0;
    root.add(divider);

    items = new T.Group();
    root.add(items);

    // drag to spin
    canvas.style.cursor = "grab";
    canvas.style.touchAction = "pan-y";
    canvas.addEventListener("pointerdown", function (e) {
      dragging = true; lastX = e.clientX; autoSpin = false;
      canvas.style.cursor = "grabbing";
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      spinVel = (e.clientX - lastX) * 0.006; spin += spinVel; lastX = e.clientX;
    });
    function up() { dragging = false; canvas.style.cursor = "grab"; }
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    resize();
    window.addEventListener("resize", resize);
    tick();
  }

  function resize() {
    if (!renderer) return;
    var w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  var _n = new T.Vector3();
  function tick() {
    spinVel *= 0.93;
    if (!dragging) spin += spinVel + (autoSpin ? 0.0022 : 0);
    root.rotation.y = spin;

    // dollhouse cutaway: walls facing the camera fade out
    _camLocal.copy(camera.position);
    root.worldToLocal(_camLocal);
    _camLocal.normalize();
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      var facing = _n.copy(w.n).dot(_camLocal);          // >0 = faces camera
      var target = facing > 0.18 ? 0.06 : 1.0;
      w.mesh.material.opacity += (target - w.mesh.material.opacity) * 0.14;
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  // ---------- item builders (rough, true-ish scale) ----------
  function bx(w, h, d, m, x, z, lift) {
    var v = new T.Mesh(new T.BoxGeometry(w, h, d), m);
    v.position.set(x, FLOOR + (lift || 0) + h / 2, z);
    return v;
  }
  function boxRow(n, x0, z, m1, m2, lift) {
    var g = new T.Group();
    for (var i = 0; i < n; i++) {
      var s = 0.5 + (i % 3) * 0.06;
      g.add(bx(s, s, s, i % 2 ? m1 : m2, x0 + i * 0.62, z, lift || 0));
    }
    return g;
  }
  function sofa(x, z, rot) {
    var g = new T.Group();
    var seat = new T.Mesh(new T.BoxGeometry(1.8, 0.45, 0.8), fabric); seat.position.y = 0.225; g.add(seat);
    var back = new T.Mesh(new T.BoxGeometry(1.8, 0.5, 0.24), fabric); back.position.set(0, 0.65, -0.28); g.add(back);
    [-1, 1].forEach(function (s) {
      var a = new T.Mesh(new T.BoxGeometry(0.24, 0.32, 0.8), fabric);
      a.position.set(s * 0.78, 0.55, 0); g.add(a);
    });
    g.position.set(x, FLOOR, z); g.rotation.y = rot || 0;
    return g;
  }
  function fridge(x, z) { return bx(0.7, 1.7, 0.7, white, x, z); }
  function washer(x, z) { return bx(0.6, 0.85, 0.6, white, x, z); }
  function mattress(x, z) {
    var m = bx(0.25, 1.9, 1.4, mat(0xcfc8ba, 0.9), x, z);
    m.rotation.x = 0.06; return m;
  }
  function car(x) {
    var g = new T.Group(), paint = mat(0x7a8087, 0.4, 0.6);
    var body = new T.Mesh(new T.BoxGeometry(4.4, 0.55, 1.78), paint); body.position.y = 0.55; g.add(body);
    var cab = new T.Mesh(new T.BoxGeometry(2.2, 0.5, 1.6), mat(0x4d5256, 0.3, 0.5)); cab.position.set(-0.2, 1.05, 0); g.add(cab);
    [-1.45, 1.45].forEach(function (wx) {
      [-0.82, 0.82].forEach(function (wz) {
        var wheel = new T.Mesh(new T.CylinderGeometry(0.31, 0.31, 0.22, 18), dark);
        wheel.rotation.x = Math.PI / 2; wheel.position.set(wx, 0.31, wz); g.add(wheel);
      });
    });
    g.position.set(x, FLOOR, 0);
    return g;
  }
  function boat(x) {
    // whole package (bow tip to motor) ~5.4m so it sits INSIDE the 5.9m box
    var g = new T.Group(), hullM = mat(0xe8e4da, 0.5);
    var hull = new T.Mesh(new T.BoxGeometry(3.8, 0.7, 1.7), hullM);
    hull.position.y = 1.0; g.add(hull);
    var bow = new T.Mesh(new T.ConeGeometry(0.78, 0.95, 4), hullM);
    bow.rotation.z = -Math.PI / 2; bow.rotation.y = Math.PI / 4;
    bow.scale.z = 1.45;
    bow.position.set(-2.35, 1.0, 0); g.add(bow);
    var motor = new T.Mesh(new T.BoxGeometry(0.32, 0.65, 0.38), dark); motor.position.set(2.05, 1.12, 0); g.add(motor);
    var frame = new T.Mesh(new T.BoxGeometry(4.2, 0.12, 1.4), steel); frame.position.y = 0.5; g.add(frame);
    var drawbar = new T.Mesh(new T.BoxGeometry(0.7, 0.08, 0.12), steel);
    drawbar.position.set(-2.3, 0.46, 0); g.add(drawbar);
    [-0.85, 0.85].forEach(function (wz) {
      var wheel = new T.Mesh(new T.CylinderGeometry(0.26, 0.26, 0.2, 18), dark);
      wheel.rotation.x = Math.PI / 2; wheel.position.set(0.8, 0.26, wz); g.add(wheel);
    });
    g.position.set(x, FLOOR, 0);
    return g;
  }
  function shelves(x, z) {
    var g = new T.Group(), shelfM = steel;
    for (var i = 0; i < 4; i++) {
      var s = new T.Mesh(new T.BoxGeometry(1.8, 0.05, 0.6), shelfM);
      s.position.y = 0.1 + i * 0.55; g.add(s);
    }
    [-0.88, 0.88].forEach(function (px) {
      [-0.28, 0.28].forEach(function (pz) {
        var leg = new T.Mesh(new T.BoxGeometry(0.06, 1.85, 0.06), shelfM);
        leg.position.set(px, 0.925, pz); g.add(leg);
      });
    });
    for (var j = 0; j < 6; j++) {
      var b = new T.Mesh(new T.BoxGeometry(0.45, 0.32, 0.45), j % 2 ? cardboardA : mat(0x445261, 0.8));
      b.position.set(-0.6 + (j % 3) * 0.6, 0.32 + Math.floor(j / 3) * 0.55, 0); g.add(b);
    }
    g.position.set(x, FLOOR, z);
    return g;
  }
  function toolchest(x, z) {
    var g = new T.Group();
    var c = new T.Mesh(new T.BoxGeometry(0.9, 1.1, 0.5), mat(0x8c2f24, 0.45, 0.5));
    c.position.y = 0.55; g.add(c);
    g.position.set(x, FLOOR, z); return g;
  }

  // ---------- presets ----------
  var PRESETS = {
    home: {
      verdict: "A 2–3 bedroom home fits the full 20ft — with room to walk in.",
      tag: "Full 20ft · $250/mo", half: false,
      build: function (g) {
        g.add(boxRow(4, -2.55, -0.72, cardboardA, cardboardB));
        g.add(boxRow(4, -2.55, -0.72, cardboardB, cardboardA, 0.62));
        g.add(boxRow(3, -2.55, 0.0, cardboardA, cardboardB));
        g.add(sofa(-0.4, 0.62, 0));
        g.add(fridge(1.3, -0.6)); g.add(washer(2.1, -0.6));
        g.add(mattress(1.0, 0.55)); g.add(boxRow(2, 1.7, 0.55, cardboardB, cardboardA));
      }
    },
    flat: {
      verdict: "A one-bedder's worth — the half container is plenty.",
      tag: "Half 20ft · $150/mo", half: true,
      build: function (g) {
        g.add(boxRow(3, -2.55, -0.65, cardboardA, cardboardB));
        g.add(boxRow(2, -2.55, 0.1, cardboardB, cardboardA));
        g.add(sofa(-1.6, 0.55, 0));
        g.add(mattress(-0.6, -0.4));
      }
    },
    car: {
      verdict: "A car drives straight in — about 1.5 m spare in a full 20ft.",
      tag: "Full 20ft · $250/mo", half: false,
      build: function (g) { g.add(car(-0.55)); }
    },
    boat: {
      verdict: "Trailer boats to ~5.5 m fit the full 20ft, motor and all.",
      tag: "Full 20ft · $250/mo", half: false,
      build: function (g) { g.add(boat(0)); }
    },
    tools: {
      verdict: "Shelves, chest and gear — a half container makes a solid lockup.",
      tag: "Half 20ft · $150/mo", half: true,
      build: function (g) {
        g.add(shelves(-2.3, 0));
        g.add(toolchest(-1.0, -0.55));
        g.add(boxRow(2, -1.3, 0.55, cardboardA, cardboardB));
      }
    }
  };

  function setPreset(name) {
    var p = PRESETS[name];
    if (!p || !items) return;
    while (items.children.length) items.remove(items.children[0]);
    p.build(items);
    items.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    divider.material.opacity = p.half ? 0.28 : 0;
    if (window.gsap) {
      items.children.forEach(function (g, i) {
        var ty = g.position.y;
        gsap.fromTo(g.position, { y: ty + 2.2 }, { y: ty, duration: 0.55, delay: i * 0.05, ease: "power3.out" });
        g.traverse(function (o) {
          if (o.isMesh) {
            o.material.transparent = true;
            gsap.fromTo(o.material, { opacity: 0 }, { opacity: 1, duration: 0.4, delay: i * 0.05 });
          }
        });
      });
    }
    if (verdictEl) {
      verdictEl.innerHTML = '<b>' + p.tag + '</b> ' + p.verdict;
      verdictEl.classList.remove("flash");
      void verdictEl.offsetWidth;
      verdictEl.classList.add("flash");
    }
  }

  document.querySelectorAll(".fit-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".fit-btn").forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      if (!started) { started = true; buildScene(); }
      setPreset(b.dataset.fit);
    });
  });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (en) {
      if (en[0].isIntersecting) {
        io.disconnect();
        if (!started) {
          started = true; buildScene();
          var first = document.querySelector(".fit-btn");
          if (first) { first.classList.add("on"); setPreset(first.dataset.fit); }
        }
      }
    }, { rootMargin: "200px" });
    io.observe(stage);
  } else {
    started = true; buildScene(); setPreset("home");
  }
})();
