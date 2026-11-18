import * as THREE from 'three';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import createEngine from '../shared/engine.ts';
import * as placement from '../shared/placement.ts';

window.THREE = { ...THREE, LineSegmentsGeometry, LineMaterial, LineSegments2 };
window.createEngine = createEngine;
window.EZPlacement = placement;
await import('./room3d.ts');
await import('./app.ts');
