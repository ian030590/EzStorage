const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const THREE = require('three');

class Element {
  constructor() {
    this.children = []; this.listeners = []; this.attributes = {}; this.style = {};
    this.clientWidth = 900; this.clientHeight = 700; this.captures = new Set();
    this.classList = { add() {}, toggle() {} };
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  insertBefore(child) { this.append(child); }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(name, callback, options) { this.listeners.push({ name, callback, capture: options === true }); }
  removeEventListener(name, callback) { this.listeners = this.listeners.filter((entry) => entry.name !== name || entry.callback !== callback); }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 700 }; }
  focus() {}
  fire(name, values = {}) {
    const event = { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0, ...values,
      preventDefault() {}, stopImmediatePropagation() { this.stopped = true; } };
    for (const capture of [true, false]) {
      for (const entry of [...this.listeners]) {
        if (entry.name === name && entry.capture === capture && !event.stopped) { entry.callback(event); }
      }
    }
  }
}

function room() {
  const host = new Element();
  let renderer, tick;
  class Renderer {
    constructor() { this.domElement = new Element(); renderer = this; }
    setPixelRatio() {} setClearColor() {} setSize() {} dispose() {} forceContextLoss() {}
    render(scene, camera) { this.scene = scene; this.camera = camera; }
  }
  const units = [
    { code: 'A', room: '1', type: 'shelf', layers: 3, x: 0, z: 0, w: 2, h: 2, d: 1, rotation: 0 },
    { code: 'B', room: '1', type: 'box', layers: 0, parent: 'A', x: .2, z: 0, y: 1.4, w: .6, h: .4, d: .5, rotation: 0 }
  ];
  const calls = [], errors = [];
  let reject = false;
  const window = { THREE: { ...THREE, WebGLRenderer: Renderer }, EZData: { units, types: { shelf: '層架', box: '箱子' } },
    innerWidth: 1200, devicePixelRatio: 1, matchMedia: () => ({ matches: true }),
    requestAnimationFrame: (callback) => { tick = callback; return 1; }, cancelAnimationFrame() {} };
  const context = vm.createContext({ window,
    document: { createElement: () => new Element(), createElementNS: () => new Element() },
    ResizeObserver: class { observe() {} disconnect() {} } });
  vm.runInContext(fs.readFileSync(require.resolve('../prototype/room3d.js'), 'utf8'), context);
  const view = new window.EZRoom(host, '1', () => {}, { editing: true,
    onMove: async (code, values) => { calls.push({ code, ...values }); if (reject) { throw new Error('offline'); } },
    onError: (message) => errors.push(message) });
  view.select('A', null, true);
  tick();
  return { view, units, calls, errors, canvas: renderer.domElement, renderer, tick: () => tick(), reject: () => { reject = true; } };
}

test('pointer drag saves once; cancellation restores positions; failed saves restore parent and box', async () => {
  const r = room();
  const point = new THREE.Vector3(0, .6, .5).project(r.renderer.camera);
  const x = (point.x + 1) * 450, y = (1 - point.y) * 350;
  r.canvas.fire('pointerdown', { clientX: x, clientY: y });
  for (let i = 1; i <= 8; i++) { r.canvas.fire('pointermove', { clientX: x + i * 8, clientY: y + i * 3 }); }
  assert.equal(r.calls.length, 0);
  r.canvas.fire('pointerup', { clientX: x + 64, clientY: y + 24 });
  await new Promise(setImmediate);
  assert.equal(r.calls.length, 1);
  assert.notEqual(r.units[0].x, 0);
  assert.ok(Math.abs(r.units[1].x - r.units[0].x - .2) < 1e-10);
  const before = JSON.stringify(r.units);
  r.reject();
  r.canvas.fire('keydown', { key: 'ArrowDown' });
  await new Promise(setImmediate);
  assert.equal(JSON.stringify(r.units), before);
  assert.match(r.errors[0], /已還原/);
  r.tick();
  const movedPoint = new THREE.Vector3(r.units[0].x, .6, r.units[0].z + .5).project(r.renderer.camera);
  const mx = (movedPoint.x + 1) * 450, my = (1 - movedPoint.y) * 350;
  r.canvas.fire('pointerdown', { clientX: mx, clientY: my });
  r.canvas.fire('pointermove', { clientX: mx + 60, clientY: my + 20 });
  r.canvas.fire('pointercancel', { clientX: mx + 60, clientY: my + 20 });
  assert.equal(JSON.stringify(r.units), before);
  assert.equal(r.calls.length, 2);
  r.view.destroy();
});

test('keyboard rotation follows parent, and direct nested box moves explain the restriction', async () => {
  const r = room();
  r.canvas.fire('keydown', { key: 'r' });
  await new Promise(setImmediate);
  assert.equal(r.calls.length, 1);
  assert.equal(r.units[0].rotation, Math.PI / 2);
  assert.ok(Math.abs(r.units[1].z + .2) < 1e-10);
  r.view.select('B', null, true);
  assert.equal(await r.view.moveSelected(.5, 0), false);
  assert.match(r.errors[0], /所屬的儲存處/);
  r.view.setEditing(false);
  assert.equal(await r.view.moveSelected(.5, 0), false);
  r.view.destroy();
});
