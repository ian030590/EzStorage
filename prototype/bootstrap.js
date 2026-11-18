import * as THREE from 'three';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';

window.THREE = { ...THREE, LineSegmentsGeometry, LineMaterial, LineSegments2 };
await import('/shared/engine.js');
await import('/shared/placement.js');
await import('/room3d.js');
await import('/app.js');
