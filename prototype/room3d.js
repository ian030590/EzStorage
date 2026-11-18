(function () {
  'use strict';
  function boundedTransform(unit, values) {
    var rotation = values.rotation === undefined ? unit.rotation || 0 : values.rotation;
    var halfX = (Math.abs(Math.cos(rotation)) * unit.w + Math.abs(Math.sin(rotation)) * unit.d) / 2;
    var halfZ = (Math.abs(Math.sin(rotation)) * unit.w + Math.abs(Math.cos(rotation)) * unit.d) / 2;
    if (halfX > 5 || halfZ > 4) { throw new Error('儲存處旋轉後超過房間大小。'); }
    return { x: Math.max(-5 + halfX, Math.min(5 - halfX, values.x === undefined ? unit.x : values.x)), z: Math.max(-4 + halfZ, Math.min(4 - halfZ, values.z === undefined ? unit.z : values.z)), rotation: rotation };
  }
  function transformedUnits(units, code, values) {
    var parent = units.find(function (unit) { return unit.code === code; });
    if (!parent) { throw new Error('找不到這個儲存處。'); }
    var target = boundedTransform(parent, values);
    var turn = target.rotation - (parent.rotation || 0);
    function belongs(unit) { return unit.code === code || !!unit.parent && belongs(units.find(function (candidate) { return candidate.code === unit.parent; }) || { code: null }); }
    return units.filter(belongs).map(function (unit) {
      var dx = unit.x - parent.x;
      var dz = unit.z - parent.z;
      return { code: unit.code, x: target.x + dx * Math.cos(turn) + dz * Math.sin(turn), z: target.z - dx * Math.sin(turn) + dz * Math.cos(turn), rotation: (unit.rotation || 0) + turn };
    });
  }
  function placeRoomTags(points, width, height) {
    var placed = [];
    var minimum = 46;
    function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
    function free(x, y) { return placed.every(function (p) { return Math.abs(x - p.x) >= minimum || Math.abs(y - p.y) >= minimum; }); }
    points.forEach(function (point) {
      var x = clamp(point.x, 24, width - 24);
      var y = clamp(point.y, 26, height - 95);
      if (!free(x, y)) {
        var best = null;
        for (var candidateY = 26; candidateY <= height - 95; candidateY += minimum) {
          for (var candidateX = 24; candidateX <= width - 24; candidateX += minimum) {
            if (!free(candidateX, candidateY)) { continue; }
            var distance = Math.pow(candidateX - x, 2) + Math.pow(candidateY - y, 2);
            if (!best || distance < best.distance) { best = { x: candidateX, y: candidateY, distance: distance }; }
          }
        }
        if (best) { x = best.x; y = best.y; }
      }
      placed.push({ x: x, y: y });
    });
    return placed;
  }
  function RoomOrbit(canvas, changed, clicked) {
    var self = this;
    var pointers = new Map();
    var moved = false;
    var pinchDistance = 0;
    var listeners = [];
    this.azimuth = Math.atan2(11, 13);
    this.polar = Math.acos(10 / Math.sqrt(390));
    this.zoom = 1;
    function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
    function distance() {
      var pair = Array.from(pointers.values());
      return pair.length < 2 ? 0 : Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
    }
    function listen(name, callback, options) {
      canvas.addEventListener(name, callback, options);
      listeners.push({ name: name, callback: callback, options: options });
    }
    function zoomBy(factor) {
      self.zoom = clamp(self.zoom * factor, .7, 1.6);
      changed();
    }
    listen('pointerdown', function (event) {
      if (event.pointerType === 'mouse' && event.button !== 0) { return; }
      if (!pointers.size) { moved = false; }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      if (pointers.size > 1) { moved = true; pinchDistance = distance(); }
    });
    listen('pointermove', function (event) {
      var previous = pointers.get(event.pointerId);
      if (!previous) { return; }
      var dx = event.clientX - previous.x;
      var dy = event.clientY - previous.y;
      previous.x = event.clientX;
      previous.y = event.clientY;
      if (Math.hypot(previous.x - previous.startX, previous.y - previous.startY) > 5) { moved = true; }
      if (pointers.size > 1) {
        var nextDistance = distance();
        if (pinchDistance > 0 && nextDistance > 0) { zoomBy(nextDistance / pinchDistance); }
        pinchDistance = nextDistance;
      } else if (moved) {
        self.azimuth -= dx * .008;
        self.polar = clamp(self.polar - dy * .008, .18, 1.4);
        changed();
      }
    });
    function release(event, cancelled) {
      var previous = pointers.get(event.pointerId);
      if (!previous) { return; }
      if (Math.hypot(event.clientX - previous.startX, event.clientY - previous.startY) > 5) { moved = true; }
      pointers.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) { canvas.releasePointerCapture(event.pointerId); }
      if (cancelled) { moved = true; }
      if (!pointers.size && !moved) { clicked(event); }
      if (pointers.size < 2) { pinchDistance = 0; }
    }
    listen('pointerup', function (event) { release(event, false); });
    listen('pointercancel', function (event) { release(event, true); });
    listen('lostpointercapture', function (event) {
      if (pointers.has(event.pointerId)) { pointers.delete(event.pointerId); moved = true; pinchDistance = 0; }
    });
    listen('wheel', function (event) {
      event.preventDefault();
      var scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      zoomBy(Math.exp(-clamp(event.deltaY * scale, -600, 600) * .0015));
    }, { passive: false });
    this.dragging = function () { return pointers.size > 0; };
    this.destroy = function () {
      listeners.forEach(function (listener) { canvas.removeEventListener(listener.name, listener.callback, listener.options); });
      pointers.forEach(function (_, pointerId) { if (canvas.hasPointerCapture(pointerId)) { canvas.releasePointerCapture(pointerId); } });
      pointers.clear();
    };
  }
  function RoomView(host, roomId, onSelect, options) {
    options = options || {};
    var editing = !!options.editing;
    var saving = false;
    var drag = null;
    this.setEditing = function (value) { editing = !!value; };
    this.moveSelected = this.rotateSelected = function () {
      if (options.onError) { options.onError('3D 畫面無法使用，請從「編輯房間與物品」調整位置與角度。'); }
      return Promise.resolve(false);
    };
    var THREE = window.THREE;
    var units = window.EZData.units.filter(function (u) { return u.room === roomId; });
    var selected = null;
    var selectedLayer = null;
    var disposed = false;
    var frameId;
    var hovered = null;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    var tags = document.createElement('div');
    tags.className = 'unit-tags';
    var leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    leaders.classList.add('leader-lines');
    leaders.setAttribute('aria-hidden', 'true');
    host.append(leaders, tags);
    var buttons = {};
    var lines = {};
    units.forEach(function (u, index) {
      var button = document.createElement('button');
      button.type = 'button';
      var overdue = !!window.EZ && window.EZ.state.records.some(function (r) { var item = window.EZ.item(r.itemId); return item && item.unit === u.code && window.EZ.held(r) > 0 && r.end < window.EZ.state.today; });
      button.className = 'unit-tag' + (overdue ? ' overdue' : '');
      button.textContent = u.code;
      button.setAttribute('aria-label', (u.name || u.code) + ' ' + window.EZData.types[u.type] + (overdue ? '，有逾期未還' : ''));
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', function () { selectFromTag(u.code); });
      button.style.left = (20 + (index % 3) * 28) + '%';
      button.style.top = (22 + Math.floor(index / 3) * 25) + '%';
      tags.appendChild(button);
      buttons[u.code] = button;
      var line = document.createElementNS(leaders.namespaceURI, 'line');
      var dot = document.createElementNS(leaders.namespaceURI, 'circle');
      dot.setAttribute('r', '2.5');
      leaders.append(line, dot);
      lines[u.code] = { line: line, dot: dot };
    });
    function selectFromTag(code) {
      if (selected === code && selectedLayer !== null) { setSelection(code, null); }
      else { setSelection(selected === code ? null : code, null); }
      onSelect(selected, selectedLayer);
    }
    function markButtons() {
      units.forEach(function (u) { buttons[u.code].setAttribute('aria-pressed', String(u.code === selected)); });
    }
    if (!THREE) {
      var warning = document.createElement('p');
      warning.className = 'stage-error';
      warning.textContent = '3D 程式未載入。請重新整理，或使用標籤查看儲存處。';
      host.appendChild(warning);
      setSelection = function (code, layer) { selected = code; selectedLayer = layer; markButtons(); };
      this.select = setSelection;
      this.destroy = function () { disposed = true; };
      return;
    }
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch (error) {
      var errorText = document.createElement('p');
      errorText.className = 'stage-error';
      errorText.textContent = '這個瀏覽器無法啟用 3D，請使用標籤查看儲存處。';
      host.appendChild(errorText);
      setSelection = function (code, layer) { selected = code; selectedLayer = layer; markButtons(); };
      this.select = setSelection;
      this.destroy = function () { disposed = true; };
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0xEEF2F6, 0);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('role', 'group');
    renderer.domElement.setAttribute('aria-label', '儲存室立體圖。圓形標籤可選擇儲存處；佈置模式可拖曳，或聚焦立體圖後用方向鍵移動、R 鍵旋轉。');
    host.insertBefore(renderer.domElement, leaders);
    var scene = new THREE.Scene();
    var camera = new THREE.OrthographicCamera(-8, 8, 7, -7, .1, 100);
    var home = new THREE.Vector3(0, .7, 0);
    var target = home.clone();
    var desiredTarget = home.clone();
    var offset = new THREE.Vector3(11, 10, 13);
    var desiredZoom = 1;
    var focusZoom = 1;
    var raycaster = new THREE.Raycaster();
    var pointer = new THREE.Vector2();
    var models = {};
    var interactive = [];
    var allMaterials = [];
    var strokeSources = [];
    var lineMaterials = [];
    function material(color) {
      var m = new THREE.MeshBasicMaterial({ color: color, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      allMaterials.push(m);
      return m;
    }
    function block(parent, width, height, depth, x, y, z, owner, layer, color) {
      var colors = color ? [color, color, color, color, color, color] : [0xDCE4EE, 0xC7D2E0, 0xFFFFFF, 0xC7D2E0, 0xDCE4EE, 0xC7D2E0];
      var mats = colors.map(material);
      var geometry = new THREE.BoxGeometry(width, height, depth);
      var mesh = new THREE.Mesh(geometry, mats);
      mesh.position.set(x, y, z);
      mesh.userData = { code: owner, layer: layer || null, colors: colors };
      parent.add(mesh);
      if (owner) { interactive.push(mesh); }
      return mesh;
    }
    function stroke(object, coordinates, enabled, count, bucket) {
      strokeSources.push({ object: object, coordinates: coordinates, enabled: enabled, count: count || coordinates.length / 6, bucket: bucket || 0 });
    }
    function segment(list, start, end) { list.push(start[0], start[1], start[2], end[0], end[1], end[2]); }
    function rectangle(list, corners, skip) {
      for (var edge = 0; edge < 4; edge += 1) {
        if (edge !== skip) { segment(list, corners[edge], corners[(edge + 1) % 4]); }
      }
    }
    function frameEdges(width, height, back, front, topRim) {
      var corners = [[-width / 2, 0, back], [width / 2, 0, back], [width / 2, 0, front], [-width / 2, 0, front]];
      var top = corners.map(function (point) { return [point[0], height, point[2]]; });
      var list = [];
      rectangle(list, corners);
      if (topRim) { rectangle(list, top); }
      corners.forEach(function (point, index) { segment(list, point, top[index]); });
      return list;
    }
    function panelStroke(mesh, width, height, depth, axis, skip, enabled) {
      stroke(mesh, function () {
        var view = new THREE.Vector3().copy(camera.position).sub(target);
        view.transformDirection(new THREE.Matrix4().copy(mesh.matrixWorld).invert());
        var corners;
        if (axis === 'y') {
          var y = (view.y >= 0 ? 1 : -1) * height / 2;
          corners = [[-width / 2, y, -depth / 2], [width / 2, y, -depth / 2], [width / 2, y, depth / 2], [-width / 2, y, depth / 2]];
        } else {
          var z = (view.z >= 0 ? 1 : -1) * depth / 2;
          corners = [[-width / 2, -height / 2, z], [width / 2, -height / 2, z], [width / 2, height / 2, z], [-width / 2, height / 2, z]];
        }
        var list = [];
        rectangle(list, corners, typeof skip === 'function' ? skip() : skip);
        return list;
      }, enabled, 4);
    }
    function lineBatch(color, width, capacity) {
      var positions = new Float32Array(Math.max(1, capacity) * 6);
      var geometry;
      var lineMaterial;
      var object;
      var fat = !!(THREE.LineSegmentsGeometry && THREE.LineMaterial && THREE.LineSegments2);
      if (fat) {
        try {
          geometry = new THREE.LineSegmentsGeometry();
          geometry.setPositions(positions);
          geometry.instanceCount = 0;
          lineMaterial = new THREE.LineMaterial({ color: color, linewidth: width, alphaToCoverage: true, depthWrite: false });
          object = new THREE.LineSegments2(geometry, lineMaterial);
        } catch (error) {
          if (geometry) { geometry.dispose(); }
          if (lineMaterial) { lineMaterial.dispose(); }
          fat = false;
        }
      }
      if (!fat) {
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setDrawRange(0, 0);
        lineMaterial = new THREE.LineBasicMaterial({ color: color, depthWrite: false });
        object = new THREE.LineSegments(geometry, lineMaterial);
      } else {
        lineMaterials.push(lineMaterial);
      }
      allMaterials.push(lineMaterial);
      object.frustumCulled = false;
      object.renderOrder = 1;
      scene.add(object);
      return {
        update: function (coordinates) {
          positions.set(coordinates);
          if (fat) {
            geometry.attributes.instanceStart.data.needsUpdate = true;
            geometry.instanceCount = coordinates.length / 6;
          } else {
            geometry.attributes.position.needsUpdate = true;
            geometry.setDrawRange(0, coordinates.length / 3);
          }
        }
      };
    }
    function interior(mesh, faces) {
      mesh.userData.interiorFaces = faces;
      faces.forEach(function (face) { mesh.material[face].color.setHex(0x9FB0C6); });
      return mesh;
    }
    function shelfBand(mesh) {
      mesh.userData.shelfBand = true;
      return interior(mesh, [0, 1, 2, 3, 4, 5]);
    }
    function roomPlane(width, height, color, x, y, z, rotationX, rotationY) {
      var fill = material(color);
      fill.side = THREE.DoubleSide;
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), fill);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rotationX, rotationY, 0);
      scene.add(mesh);
    }
    roomPlane(10, 8, 0xF4F7FA, 0, -.03, 0, -Math.PI / 2, 0);
    roomPlane(10, 3.48, 0xD8E0EA, 0, 1.71, -4, 0, 0);
    roomPlane(8, 3.48, 0xE3E9F0, -5, 1.71, 0, 0, Math.PI / 2);
    var roomEdges = [];
    rectangle(roomEdges, [[-5, -.03, -4], [5, -.03, -4], [5, -.03, 4], [-5, -.03, 4]]);
    segment(roomEdges, [-5, 3.45, 4], [-5, 3.45, -4]);
    segment(roomEdges, [-5, 3.45, -4], [5, 3.45, -4]);
    [[-5, -4], [-5, 4], [5, -4]].forEach(function (corner) { segment(roomEdges, [corner[0], -.03, corner[1]], [corner[0], 3.45, corner[1]]); });
    stroke(scene, roomEdges);
    var gridVertices = [];
    for (var x = -4; x < 5; x += 1) { gridVertices.push(x, -.022, -4, x, -.022, 4); }
    for (var z = -3; z < 4; z += 1) { gridVertices.push(-5, -.022, z, 5, -.022, z); }
    stroke(scene, gridVertices, null, 0, 1);
    units.forEach(function (u) {
      var group = new THREE.Group();
      group.position.set(u.x, u.y || 0, u.z);
      group.rotation.y = u.rotation;
      scene.add(group);
      var model = { unit: u, group: group, doors: [], drawers: [], lid: null, meshes: [], open: 0 };
      models[u.code] = model;
      stroke(group, function () {
        var box = u.type === 'box';
        var closed = box && model.open <= .02;
        return frameEdges(u.w + .07, u.h + (box && !closed ? 0 : .035), -u.d / 2, u.d / 2, !closed);
      }, null, 12);
      function part(w, h, d, px, py, pz, layer) {
        var mesh = block(group, w, h, d, px, py, pz, u.code, layer);
        model.meshes.push(mesh);
        return mesh;
      }
      var t = .07;
      interior(part(t, u.h, u.d, -u.w / 2, u.h / 2, 0), [0]);
      interior(part(t, u.h, u.d, u.w / 2, u.h / 2, 0), [1]);
      interior(part(u.w, u.h, t, 0, u.h / 2, -u.d / 2), [4]);
      var floor = part(u.w, t, u.d, 0, t / 2, 0, u.layers ? 1 : null);
      if (u.layers) { shelfBand(floor); } else { interior(floor, [2]); }
      if (u.type === 'box') {
        interior(part(u.w, u.h, t, 0, u.h / 2, u.d / 2), [5]);
        var hinge = new THREE.Group();
        hinge.position.set(0, u.h, -u.d / 2);
        group.add(hinge);
        var lid = block(hinge, u.w + .08, t, u.d + .06, 0, 0, u.d / 2, u.code);
        panelStroke(lid, u.w + .08, t, u.d + .06, 'y', function () { return model.open > .02 ? 0 : -1; });
        model.meshes.push(lid);
        model.lid = hinge;
      } else {
        interior(part(u.w + .06, t, u.d, 0, u.h, 0), [3]);
        var step = (u.h - t) / u.layers;
        for (var layer = 1; layer <= u.layers; layer += 1) {
          if (layer > 1) { shelfBand(part(u.w, t, u.d, 0, (layer - 1) * step + t, 0, layer)); }
          if (layer > 1 && u.type !== 'drawer') {
            var shelfY = (layer - 1) * step + t;
            stroke(group, [-((u.w + t) / 2), shelfY, u.d / 2, (u.w + t) / 2, shelfY, u.d / 2]);
          }
          if (u.type === 'drawer') {
            var drawer = new THREE.Group();
            drawer.position.y = (layer - 1) * step + t;
            group.add(drawer);
            var front = interior(block(drawer, u.w - .12, step - .08, t, 0, (step - .08) / 2, u.d / 2 + .02, u.code, layer), [5]);
            front.userData.drawerFront = true;
            var bottom = interior(block(drawer, u.w - .16, t, u.d - .1, 0, .02, 0, u.code, layer), [2]);
            var left = interior(block(drawer, t, step - .13, u.d - .1, -(u.w - .18) / 2, (step - .13) / 2, 0, u.code, layer), [0]);
            var right = interior(block(drawer, t, step - .13, u.d - .1, (u.w - .18) / 2, (step - .13) / 2, 0, u.code, layer), [1]);
            var back = interior(block(drawer, u.w - .16, step - .13, t, 0, (step - .13) / 2, -(u.d - .1) / 2, u.code, layer), [4]);
            var handle = block(drawer, .38, .035, .04, 0, step / 2, u.d / 2 + .08, u.code, layer, 0x14213D);
            handle.userData.handle = true;
            model.meshes.push(front, bottom, left, right, back);
            model.drawers.push({ group: drawer, layer: layer });
            (function (tray, last) {
              var half = (u.w - .12) / 2;
              var frontZ = u.d / 2 + .02 + t / 2;
              var backZ = -(u.d - .1) / 2;
              var frontY = step - .08;
              var rimY = step - .13;
              stroke(tray, [-half, frontY, frontZ, half, frontY, frontZ], function () { return !last || model.open > .02; });
              var rim = [];
              [-half, half].forEach(function (edgeX) {
                segment(rim, [edgeX, 0, frontZ], [edgeX, frontY, frontZ]);
                segment(rim, [edgeX, rimY, frontZ], [edgeX, rimY, backZ]);
              });
              segment(rim, [-half, rimY, backZ], [half, rimY, backZ]);
              stroke(tray, rim, function () { return model.open > .02; });
            }(drawer, layer === u.layers));
          }
          var hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, color: 0xFFFFFF, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
          allMaterials.push(hitMaterial);
          var hit = new THREE.Mesh(new THREE.BoxGeometry(u.w - .18, step - .12, u.d - .06), hitMaterial);
          hit.position.set(0, (layer - .5) * step + .04, 0);
          hit.userData = { code: u.code, layer: layer, hit: true };
          group.add(hit);
          interactive.push(hit);
        }
        if (u.type === 'cabinet') {
          [-1, 1].forEach(function (side) {
            var doorHinge = new THREE.Group();
            doorHinge.position.set(side * u.w / 2, u.h / 2, u.d / 2 + .05);
            group.add(doorHinge);
            var door = block(doorHinge, u.w / 2 - .04, u.h - .12, t, -side * u.w / 4, 0, 0, u.code);
            panelStroke(door, u.w / 2 - .04, u.h - .12, t, 'z', side < 0 ? 3 : 1, function () { return model.open > .02; });
            model.meshes.push(door);
            var handle = block(doorHinge, .035, .24, .045, -side * (u.w / 2 - .17), 0, .06, u.code, null, 0x14213D);
            handle.userData.handle = true;
            model.doors.push({ group: doorHinge, side: side });
          });
          stroke(group, [0, .06, u.d / 2 + .05 + t / 2, 0, u.h - .06, u.d / 2 + .05 + t / 2], function () { return model.open <= .02; });
        }
      }
    });
    var capacity = strokeSources.reduce(function (sum, source) { return sum + source.count; }, 0);
    var inkLines = lineBatch(0x14213D, 1.4, capacity);
    var gridLines = lineBatch(0xC9D3DF, .7, capacity);
    var startPoint = new THREE.Vector3();
    var endPoint = new THREE.Vector3();
    function updateStrokes() {
      var unique = new Map();
      function key(point) { return [point.x, point.y, point.z].map(function (value) { return Math.round(value * 100000); }).join(','); }
      strokeSources.forEach(function (source) {
        if (source.enabled && !source.enabled()) { return; }
        var coordinates = typeof source.coordinates === 'function' ? source.coordinates() : source.coordinates;
        for (var index = 0; index < coordinates.length; index += 6) {
          startPoint.set(coordinates[index], coordinates[index + 1], coordinates[index + 2]).applyMatrix4(source.object.matrixWorld);
          endPoint.set(coordinates[index + 3], coordinates[index + 4], coordinates[index + 5]).applyMatrix4(source.object.matrixWorld);
          var a = key(startPoint);
          var b = key(endPoint);
          if (a === b) { continue; }
          var edge = a < b ? a + '|' + b : b + '|' + a;
          var previous = unique.get(edge);
          if (!previous || source.bucket < previous.bucket) { unique.set(edge, { bucket: source.bucket, coordinates: [startPoint.x, startPoint.y, startPoint.z, endPoint.x, endPoint.y, endPoint.z] }); }
        }
      });
      var ink = [];
      var grid = [];
      unique.forEach(function (edge) { Array.prototype.push.apply(edge.bucket ? grid : ink, edge.coordinates); });
      inkLines.update(ink);
      gridLines.update(grid);
    }
    function recolor() {
      Object.keys(models).forEach(function (code) {
        var model = models[code];
        model.meshes.forEach(function (mesh) {
          var isSelected = code === selected;
          var isLayer = isSelected && selectedLayer !== null && mesh.userData.layer === selectedLayer && (mesh.userData.shelfBand || mesh.userData.drawerFront);
          mesh.material.forEach(function (m, index) {
            var inside = mesh.userData.interiorFaces && mesh.userData.interiorFaces.indexOf(index) >= 0;
            m.color.setHex(isLayer ? 0xD9A910 : inside ? 0x9FB0C6 : isSelected ? 0xF2C230 : code === hovered ? 0xE3E9F0 : mesh.userData.colors[index]);
          });
        });
      });
    }
    function setSelection(code, layer, initial) {
      selected = code;
      selectedLayer = layer === undefined ? null : layer;
      markButtons();
      recolor();
      desiredTarget.copy(home);
      focusZoom = 1;
      if (code && !initial && models[code]) {
        var u = models[code].unit;
        desiredTarget.lerp(new THREE.Vector3(u.x, (u.y || 0) + u.h / 2, u.z), .18);
        focusZoom = 1.08;
      }
      desiredZoom = Math.min(1.6, orbit.zoom * focusZoom);
      if (reduced.matches) { target.copy(desiredTarget); camera.zoom = desiredZoom; }
    }
    var renderedWidth = 0;
    var renderedHeight = 0;
    function resize() {
      var width = host.clientWidth;
      var height = host.clientHeight;
      if (!width || !height) { return; }
      if (width !== renderedWidth || height !== renderedHeight) {
        renderer.setSize(width, height, false);
        renderedWidth = width;
        renderedHeight = height;
      }
      var aspect = width / height;
      var azimuth = orbit ? orbit.azimuth : Math.atan2(offset.x, offset.z);
      var roomWidth = 10 * Math.abs(Math.cos(azimuth)) + 8 * Math.abs(Math.sin(azimuth));
      var viewHeight = window.innerWidth < 900 ? roomWidth * 1.06 / aspect : Math.max(10.8, 14.6 / aspect);
      camera.left = -viewHeight * aspect / 2;
      camera.right = viewHeight * aspect / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      lineMaterials.forEach(function (lineMaterial) { lineMaterial.resolution.set(width, height); });
      leaders.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    }
    var observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    function hitTest(event) {
      var bounds = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(interactive, false).find(function (hit) { return !hit.object.userData.hit || hit.object.userData.code === selected; });
    }
    var floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    var editListeners = [];
    function editListen(name, handler) {
      renderer.domElement.addEventListener(name, handler, true);
      editListeners.push({ name: name, handler: handler });
    }
    function report(message) { if (options.onError) { options.onError(message); } }
    function floorPoint(event) {
      var bounds = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.ray.intersectPlane(floorPlane, new THREE.Vector3());
    }
    function snapshot() { return units.map(function (u) { return { code: u.code, parent: u.parent, x: u.x, z: u.z, rotation: u.rotation || 0, w: u.w, d: u.d }; }); }
    function applyTransforms(changes) {
      changes.forEach(function (change) {
        var model = models[change.code];
        model.unit.x = change.x;
        model.unit.z = change.z;
        model.unit.rotation = change.rotation;
        model.group.position.x = change.x;
        model.group.position.z = change.z;
        model.group.rotation.y = change.rotation;
      });
    }
    async function persist(code, before) {
      var u = models[code].unit;
      saving = true;
      renderer.domElement.setAttribute('aria-busy', 'true');
      try {
        if (!options.onMove) { throw new Error('此頁面尚未提供佈置儲存功能。'); }
        await options.onMove(code, { x: u.x, z: u.z, rotation: u.rotation });
        return true;
      } catch (error) {
        if (!disposed) { applyTransforms(before); report('位置未儲存，已還原：' + error.message); }
        return false;
      } finally {
        saving = false;
        renderer.domElement.removeAttribute('aria-busy');
      }
    }
    function canMove(code) {
      if (!editing || saving || !code || !models[code]) { return false; }
      if (models[code].unit.parent) { report('這個收納箱放在儲存處內，請移動它所屬的儲存處。'); return false; }
      return true;
    }
    async function moveSelection(values) {
      if (!canMove(selected) || drag) { return false; }
      var code = selected;
      var before = snapshot();
      try { applyTransforms(transformedUnits(before, code, values)); }
      catch (error) { report(error.message); return false; }
      return persist(code, before);
    }
    this.moveSelected = function (dx, dz) {
      var u = models[selected] && models[selected].unit;
      return u ? moveSelection({ x: u.x + dx, z: u.z + dz }) : Promise.resolve(false);
    };
    this.rotateSelected = function (radians) {
      var u = models[selected] && models[selected].unit;
      return u ? moveSelection({ rotation: u.rotation + radians }) : Promise.resolve(false);
    };
    this.setEditing = function (value) {
      if (drag) {
        applyTransforms(drag.before);
        if (renderer.domElement.hasPointerCapture(drag.pointerId)) { renderer.domElement.releasePointerCapture(drag.pointerId); }
        drag = null;
      }
      editing = !!value;
      host.classList.toggle('arranging', editing);
    };
    function consume(event) { event.preventDefault(); event.stopImmediatePropagation(); }
    editListen('pointerdown', function (event) {
      if (!editing || event.pointerType === 'mouse' && event.button !== 0) { return; }
      if (drag || saving) { consume(event); return; }
      var hit = hitTest(event);
      if (!hit) { return; }
      consume(event);
      var code = hit.object.userData.code;
      setSelection(code, null, true);
      onSelect(code, null);
      renderer.domElement.focus({ preventScroll: true });
      if (!canMove(code)) { return; }
      var point = floorPoint(event);
      if (!point) { return; }
      var u = models[code].unit;
      drag = { pointerId: event.pointerId, code: code, before: snapshot(), x: event.clientX, y: event.clientY, dx: u.x - point.x, dz: u.z - point.z, moved: false };
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
    });
    editListen('pointermove', function (event) {
      if (!drag || drag.pointerId !== event.pointerId) { return; }
      consume(event);
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) { drag.moved = true; }
      if (!drag.moved) { return; }
      var point = floorPoint(event);
      if (point) { applyTransforms(transformedUnits(drag.before, drag.code, { x: point.x + drag.dx, z: point.z + drag.dz })); }
    });
    function endDrag(event, cancelled) {
      if (!drag || drag.pointerId !== event.pointerId) { return; }
      consume(event);
      var finished = drag;
      drag = null;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) { renderer.domElement.releasePointerCapture(event.pointerId); }
      renderer.domElement.style.cursor = 'grab';
      if (cancelled || !finished.moved) { applyTransforms(finished.before); }
      else { persist(finished.code, finished.before); }
    }
    editListen('pointerup', function (event) { endDrag(event, false); });
    editListen('pointercancel', function (event) { endDrag(event, true); });
    editListen('lostpointercapture', function (event) { endDrag(event, true); });
    editListen('keydown', function (event) {
      if (!editing || !selected || event.ctrlKey || event.metaKey || event.altKey) { return; }
      if (event.key === 'Escape' && drag) {
        consume(event);
        var cancelled = drag;
        drag = null;
        applyTransforms(cancelled.before);
        if (renderer.domElement.hasPointerCapture(cancelled.pointerId)) { renderer.domElement.releasePointerCapture(cancelled.pointerId); }
        return;
      }
      var step = event.shiftKey ? .5 : .1;
      var moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[event.key]) { consume(event); this.moveSelected(moves[event.key][0], moves[event.key][1]); }
      else if (event.key.toLowerCase() === 'r') { consume(event); this.rotateSelected(Math.PI / 2); }
    }.bind(this));
    renderer.domElement.addEventListener('pointermove', function (event) {
      if (orbit.dragging()) { renderer.domElement.style.cursor = 'grabbing'; return; }
      var hit = hitTest(event);
      var code = hit ? hit.object.userData.code : null;
      renderer.domElement.style.cursor = code ? editing ? 'grab' : 'pointer' : 'default';
      if (code !== hovered) { hovered = code; recolor(); }
    });
    renderer.domElement.addEventListener('pointerleave', function () { hovered = null; recolor(); });
    function selectAtPointer(event) {
      var hit = hitTest(event);
      if (!hit) {
        setSelection(selectedLayer !== null ? selected : null, null);
      } else {
        var info = hit.object.userData;
        setSelection(info.code, info.code === selected && info.layer ? (selectedLayer === info.layer ? null : info.layer) : null);
      }
      onSelect(selected, selectedLayer);
    }
    var orbit = new RoomOrbit(renderer.domElement, function () {
      var radius = Math.sqrt(390);
      offset.set(radius * Math.sin(orbit.polar) * Math.sin(orbit.azimuth), radius * Math.cos(orbit.polar), radius * Math.sin(orbit.polar) * Math.cos(orbit.azimuth));
      desiredZoom = Math.min(1.6, orbit.zoom * focusZoom);
      if (window.innerWidth < 900) { resize(); }
      if (reduced.matches) { camera.zoom = desiredZoom; }
    }, selectAtPointer);
    function frame() {
      if (disposed) { return; }
      var speed = reduced.matches ? 1 : .12;
      target.lerp(desiredTarget, speed);
      camera.position.copy(target).add(offset);
      camera.lookAt(target);
      camera.zoom += (desiredZoom - camera.zoom) * speed;
      camera.updateProjectionMatrix();
      units.forEach(function (u) {
        var model = models[u.code];
        model.open += ((selected === u.code ? 1 : 0) - model.open) * speed;
        model.doors.forEach(function (door) { door.group.rotation.y = door.side * model.open * Math.PI * 105 / 180; });
        model.drawers.forEach(function (drawer) { drawer.group.position.z = model.open * u.d * (selectedLayer === drawer.layer ? .9 : .68); });
        if (model.lid) { model.lid.rotation.x = -model.open * Math.PI * .6; }
      });
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      updateStrokes();
      var width = host.clientWidth;
      var height = host.clientHeight;
      var narrow = window.innerWidth < 900;
      var phoneOffsets = { A1: [30, -50], B1: [-35, -60], A2: [40, -70], B2: [-40, -15], A3: [50, -22], C1: [-35, 50] };
      var anchors = units.map(function (u) {
        var anchor = new THREE.Vector3(0, u.h + .03, 0);
        models[u.code].group.localToWorld(anchor);
        anchor.project(camera);
        var px = (anchor.x + 1) * width / 2;
        var py = (1 - anchor.y) * height / 2;
        var shift = narrow && phoneOffsets[u.code] ? phoneOffsets[u.code] : [u.parent ? 48 : u.type === 'box' ? 30 : 24, u.parent ? 5 : -44];
        return { px: px, py: py, x: px + shift[0], y: py + shift[1] };
      });
      var positions = narrow ? placeRoomTags(anchors, width, height) : anchors.map(function (anchor) { return { x: Math.max(24, Math.min(width - 24, anchor.x)), y: Math.max(26, Math.min(height - 95, anchor.y)) }; });
      units.forEach(function (u, index) {
        var bx = positions[index].x;
        var by = positions[index].y;
        buttons[u.code].style.left = bx + 'px';
        buttons[u.code].style.top = by + 'px';
        var leader = lines[u.code];
        leader.line.setAttribute('x1', anchors[index].px);
        leader.line.setAttribute('y1', anchors[index].py);
        leader.line.setAttribute('x2', bx);
        leader.line.setAttribute('y2', by);
        leader.dot.setAttribute('cx', anchors[index].px);
        leader.dot.setAttribute('cy', anchors[index].py);
      });
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(frame);
    }
    frame();
    this.select = setSelection;
    this.destroy = function () {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      orbit.destroy();
      editListeners.forEach(function (listener) { renderer.domElement.removeEventListener(listener.name, listener.handler, true); });
      scene.traverse(function (object) { if (object.geometry) { object.geometry.dispose(); } });
      allMaterials.forEach(function (m) { m.dispose(); });
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { boundedTransform: boundedTransform, transformedUnits: transformedUnits, placeRoomTags: placeRoomTags }; }
  if (typeof window !== 'undefined') {
    window.EZRoom = RoomView;
    window.EZRoomOrbit = RoomOrbit;
    window.EZPlaceRoomTags = placeRoomTags;
  }
}());
