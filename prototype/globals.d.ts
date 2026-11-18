import type createEngine from '../shared/engine.ts';
import type * as placement from '../shared/placement.ts';
import type { Catalog } from '../shared/model.ts';
import type * as THREE from 'three';
import type { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import type { RoomView, RoomOrbit, placeRoomTags } from './room3d.ts';

declare global {
  interface Window {
    THREE: typeof THREE & { LineSegmentsGeometry: typeof LineSegmentsGeometry; LineMaterial: typeof LineMaterial; LineSegments2: typeof LineSegments2 };
    createEngine: typeof createEngine;
    EZPlacement: typeof placement;
    EZData: Catalog;
    EZ: Pick<ReturnType<typeof createEngine>, 'state' | 'item' | 'held'>;
    EZRoom: typeof RoomView;
    EZRoomOrbit: typeof RoomOrbit;
    EZPlaceRoomTags: typeof placeRoomTags;
  }
}
