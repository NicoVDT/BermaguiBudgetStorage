/* Bermagui Budget Storage — "Will it fit?" visualiser.
   A second, lightweight Three.js scene: a ghost-walled 20ft container you can
   spin, filled with rough true-scale shapes for whatever the visitor needs to
   store. Lazy-initialised only when the section scrolls into view.
   Uses the same self-hosted three.min.js global as the hero. */
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

  var started = false, renderer, scene, camera, root, items, divider;
  var spin = 0.6, spinVel = 0, dragging = false, lastX = 0, autoSpin = true;

  // ---------- materials ----------
  function mat(c, r, m) {
    return new T.MeshStandardMaterial({ color: c, roughness: r == null ? 0.85 : r, metalness: m || 0 });
  }
  var cardboardA, cardboardB, fabric, white, steel, dark;

  function buildScene() {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    if (T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(33, 1, 0.5, 60);
    camera.position.set(8.2, 4.6, 9.0);
    camera.lookAt(0, -0.3, 0);

    scene.add(new T.HemisphereLight(0xfff4e4, 0x44403a, 0.9));
    var key = new T.DirectionalLight(0xfff0dc, 1.6);
    key.position.set(-6, 9, 7); scene.add(key);
    var fill = new T.DirectionalLight(0xe8eef6, 0.5);
    fill.position.set(7, 3, -6); scene.add(fill);

    cardboardA = mat(0xa9824f); cardboardB = mat(0x97713f);
    fabric = mat(0x5c6258, 0.95); white = mat(0xd8d4cc, 0.6);
    steel = mat(0x8a8d90, 0.5, 0.4); dark = mat(0x3a3733, 0.7, 0.2);

    root = new T.Group();
    root.rotation.y = spin;
    scene.add(root);

    // ghost container: translucent tan shell + solid floor and frame
    var shellMat = new T.MeshStandardMaterial({
      color: 0xc2a567, roughness: 0.6, metalness: 0.1,
      transparent: true, opacity: 0.22, side: T.DoubleSide, depthWrite: false
    });
    function panel(w, h, px, py, pz, ry) {
      var m = new T.Mesh(new T.PlaneGeometry(w, h), shellMat);
      m.position.set(px, py, pz); m.rotation.y = ry || 0;
      root.add(m); return m;
    }
    panel(L, H, 0, 0, -W / 2);                       // far wall
    panel(L, H, 0, 0, W / 2);                        // near wall
    panel(W, H, -L / 2, 0, 0, Math.PI / 2);          // back
    panel(W, H, L / 2, 0, 0, Math.PI / 2);           // door end
    var roof = new T.Mesh(new T.PlaneGeometry(L, W), shellMat);
    roof.rotation.x = -Math.PI / 2; roof.position.y = H / 2; root.add(roof);

    var floor = new T.Mesh(new T.BoxGeometry(L + 0.16, 0.14, W + 0.16), mat(0x8d7148, 0.92));
    floor.position.y = FLOOR - 0.07; root.add(floor);

    // frame edges
    var frameMat = mat(0x84703e, 0.55, 0.25);
    function rail(sx, sy, sz, x, y, z) {
      var m = new T.Mesh(new T.BoxGeometry(sx, sy, sz), frameMat);
      m.position.set(x, y, z); root.add(m);
    }
    var rt = 0.09;
    [-1, 1].forEach(function (iy) {
      [-1, 1].forEach(function (iz) { rail(L + 0.16, rt, rt, 0, iy * H / 2, iz * W / 2); });
      [-1, 1].forEach(function (ix) { rail(rt, rt, W + 0.16, ix * L / 2, iy * H / 2, 0); });
    });
    [-1, 1].forEach(function (ix) {
      [-1, 1].forEach(function (iz) { rail(rt, H + 0.16, rt, ix * L / 2, 0, iz * W / 2); });
    });

    // half-container divider (shown for "half" verdicts)
    divider = new T.Mesh(new T.PlaneGeometry(W, H),
      new T.MeshBasicMaterial({ color: 0xc0510a, transparent: true, opacity: 0.0, side: T.DoubleSide, depthWrite: false }));
    divider.rotation.y = Math.PI / 2;
    divider.position.x = -L / 2 + 3.0;   // 3m mark = half container
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

  function tick() {
    spinVel *= 0.93;
    if (!dragging) spin += spinVel + (autoSpin ? 0.0022 : 0);
    root.rotation.y = spin;
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
    var g = new T.Group(), hullM = mat(0xe8e4da, 0.5);
    var hull = new T.Mesh(new T.BoxGeometry(4.6, 0.75, 1.85), hullM);
    hull.scale.set(1, 1, 1); hull.position.y = 1.0; g.add(hull);
    var bow = new T.Mesh(new T.ConeGeometry(0.92, 1.1, 4), hullM);
    bow.rotation.z = -Math.PI / 2; bow.rotation.y = Math.PI / 4;
    bow.position.set(-2.85, 1.0, 0); g.add(bow);
    var motor = new T.Mesh(new T.BoxGeometry(0.35, 0.7, 0.4), dark); motor.position.set(2.45, 1.15, 0); g.add(motor);
    // trailer
    var frame = new T.Mesh(new T.BoxGeometry(4.4, 0.12, 1.5), steel); frame.position.y = 0.5; g.add(frame);
    [-0.9, 0.9].forEach(function (wz) {
      var wheel = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 0.2, 18), dark);
      wheel.rotation.x = Math.PI / 2; wheel.position.set(0.9, 0.28, wz); g.add(wheel);
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
    // bins on shelves
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
      build: function (g) { g.add(boat(-0.35)); }
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
    divider.material.opacity = p.half ? 0.28 : 0;
    // pop-in animation
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

  // buttons
  document.querySelectorAll(".fit-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".fit-btn").forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      if (!started) { started = true; buildScene(); }
      setPreset(b.dataset.fit);
    });
  });

  // lazy init when scrolled near
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
