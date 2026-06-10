/* Bermagui Budget Storage: live 3D shipping container for the hero.
   Procedurally built with Three.js (no video assets needed). Auto-rotates
   slowly; visitors can drag to spin it. Falls back to the photo if WebGL
   is unavailable, and stands down entirely if a container-3d.mp4 video
   has taken over the hero. Honours prefers-reduced-motion. */
(function () {
  "use strict";

  var frame = document.getElementById("heroFrame");
  if (!frame || frame.classList.contains("video-on")) return;

  // Bail out politely on very old browsers.
  try {
    var test = document.createElement("canvas");
    if (!(test.getContext("webgl2") || test.getContext("webgl"))) return;
  } catch (_) { return; }

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js";
  s.onload = init;
  document.head.appendChild(s);

  function init() {
    var T = window.THREE;
    var scene = new T.Scene();

    var canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;cursor:grab;touch-action:pan-y;";
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    var camera = new T.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(7.2, 3.6, 9.2);
    camera.lookAt(0, 0.2, 0);

    // Lighting: soft daylight.
    scene.add(new T.HemisphereLight(0xfff9ec, 0x8a8676, 1.05));
    var sun = new T.DirectionalLight(0xfff4e0, 1.6);
    sun.position.set(6, 9, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -6; sun.shadow.camera.right = 6;
    sun.shadow.camera.top = 6; sun.shadow.camera.bottom = -6;
    scene.add(sun);

    // ---- container group ----
    var box = new T.Group();
    var L = 6.06, H = 2.59, W = 2.44; // real 20ft dimensions in metres

    var tan = 0xd9c8a3;       // matches the real fleet
    var tanDark = 0xc4b186;

    // Corrugation bump texture drawn on a canvas (cheap, no asset files).
    function corrTexture(reps) {
      var c = document.createElement("canvas");
      c.width = 512; c.height = 64;
      var g = c.getContext("2d");
      var grd;
      for (var i = 0; i < reps; i++) {
        var x0 = (512 / reps) * i, w = 512 / reps;
        grd = g.createLinearGradient(x0, 0, x0 + w, 0);
        grd.addColorStop(0, "#808080");
        grd.addColorStop(0.35, "#ffffff");
        grd.addColorStop(0.65, "#ffffff");
        grd.addColorStop(1, "#202020");
        g.fillStyle = grd;
        g.fillRect(x0, 0, w, 64);
      }
      var t = new T.CanvasTexture(c);
      t.wrapS = t.wrapT = T.RepeatWrapping;
      return t;
    }

    var sideMat = new T.MeshStandardMaterial({
      color: tan, roughness: 0.62, metalness: 0.25,
      bumpMap: corrTexture(26), bumpScale: 0.025
    });
    var endMat = new T.MeshStandardMaterial({
      color: tan, roughness: 0.62, metalness: 0.25,
      bumpMap: corrTexture(10), bumpScale: 0.02
    });
    var topMat = new T.MeshStandardMaterial({
      color: tanDark, roughness: 0.7, metalness: 0.2,
      bumpMap: corrTexture(22), bumpScale: 0.02
    });

    var body = new T.Mesh(
      new T.BoxGeometry(L, H, W),
      [endMat, endMat, topMat, topMat, sideMat, sideMat]
    );
    body.castShadow = true;
    box.add(body);

    // Real corrugation: thin vertical ribs proud of each long side.
    var ribMat = new T.MeshStandardMaterial({ color: tan, roughness: 0.58, metalness: 0.28 });
    var ribGeo = new T.BoxGeometry(0.1, H - 0.18, 0.05);
    var ribs = 24;
    for (var r = 0; r < ribs; r++) {
      var rx = -L / 2 + 0.35 + (r * (L - 0.7)) / (ribs - 1);
      [-1, 1].forEach(function (iz) {
        var rib = new T.Mesh(ribGeo, ribMat);
        rib.position.set(rx, 0, iz * (W / 2 + 0.025));
        rib.castShadow = true;
        box.add(rib);
      });
    }
    // Ribs across the closed (non-door) end too.
    var endRibGeo = new T.BoxGeometry(0.05, H - 0.18, 0.1);
    for (var q = 0; q < 9; q++) {
      var rz = -W / 2 + 0.3 + (q * (W - 0.6)) / 8;
      var endRib = new T.Mesh(endRibGeo, ribMat);
      endRib.position.set(-(L / 2 + 0.025), 0, rz);
      endRib.castShadow = true;
      box.add(endRib);
    }

    // Corner posts + top/bottom rails: slightly darker frame.
    var frameMat = new T.MeshStandardMaterial({ color: 0xb5a378, roughness: 0.5, metalness: 0.4 });
    function bar(sx, sy, sz, x, y, z) {
      var m = new T.Mesh(new T.BoxGeometry(sx, sy, sz), frameMat);
      m.position.set(x, y, z);
      m.castShadow = true;
      box.add(m);
    }
    var t = 0.14;
    [-1, 1].forEach(function (ix) {
      [-1, 1].forEach(function (iz) {
        bar(t, H + 0.02, t, ix * (L / 2), 0, iz * (W / 2));            // corner posts
      });
      [-1, 1].forEach(function (iy) {
        bar(t, t, W + 0.02, ix * (L / 2), iy * (H / 2), 0);            // end rails
      });
    });
    [-1, 1].forEach(function (iy) {
      [-1, 1].forEach(function (iz) {
        bar(L + 0.02, t, t, 0, iy * (H / 2), iz * (W / 2));            // long rails
      });
    });

    // Door end: lock bars + handles on the +X face.
    var barMat = new T.MeshStandardMaterial({ color: 0xa99a72, roughness: 0.35, metalness: 0.7 });
    [-0.7, -0.25, 0.25, 0.7].forEach(function (off) {
      var rod = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, H - 0.25, 12), barMat);
      rod.position.set(L / 2 + 0.06, 0, off);
      rod.castShadow = true;
      box.add(rod);
      var handle = new T.Mesh(new T.BoxGeometry(0.05, 0.3, 0.04), barMat);
      handle.position.set(L / 2 + 0.1, -0.4, off + 0.05);
      box.add(handle);
    });

    box.position.y = H / 2;
    box.rotation.y = -0.5;
    scene.add(box);

    // Soft contact shadow ground (invisible, shadow only).
    var ground = new T.Mesh(
      new T.PlaneGeometry(30, 30),
      new T.ShadowMaterial({ opacity: 0.18 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Insert behind the price note but above the photo.
    var img = frame.querySelector("img");
    if (img) img.style.opacity = "0";
    frame.insertBefore(canvas, frame.querySelector(".hero-note"));

    function resize() {
      var w = frame.clientWidth, h = frame.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    // Drag to spin; gentle auto-rotation otherwise.
    var vel = reduced ? 0 : 0.0035, dragging = false, lastX = 0;
    canvas.addEventListener("pointerdown", function (e) {
      dragging = true; lastX = e.clientX;
      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      vel = (e.clientX - lastX) * 0.004;
      box.rotation.y += vel;
      lastX = e.clientX;
    });
    canvas.addEventListener("pointerup", function (e) {
      dragging = false;
      canvas.style.cursor = "grab";
      canvas.releasePointerCapture(e.pointerId);
    });

    var idleVel = reduced ? 0 : 0.0035;
    function tick() {
      if (!dragging) {
        // ease back toward idle speed after a fling
        vel += (idleVel - vel) * 0.02;
        box.rotation.y += vel;
      }
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    }
    if (reduced) { renderer.render(scene, camera); } else { tick(); }

    // If the Kling video ever shows up later, it wins: remove the canvas.
    new MutationObserver(function () {
      if (frame.classList.contains("video-on")) {
        canvas.remove();
        if (img) img.style.opacity = "";
      }
    }).observe(frame, { attributes: true, attributeFilter: ["class"] });
  }
})();
