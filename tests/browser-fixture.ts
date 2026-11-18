import { buildSync } from 'esbuild';
import path from 'node:path';
import createEngine from '../shared/engine.ts';
import * as placement from '../shared/placement.ts';

const root = path.resolve(import.meta.dirname, '..');
export function browserScript(file: string) {
  return buildSync({
    entryPoints: [path.join(root, 'prototype', file)],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'EzStorageTest',
    platform: 'browser',
  }).outputFiles[0].text;
}

interface BrowserFixture {
  createEngine: typeof createEngine;
  EZPlacement: typeof placement;
  eval(code: string): unknown;
}
export function startFrontend(window: BrowserFixture) {
  window.createEngine = createEngine;
  window.EZPlacement = placement;
  return window.eval(browserScript('app.ts') + '\nEzStorageTest.default');
}

type FixtureRoom = {
  select?: (code: string | null, layer: number | null) => void;
  destroy?: () => void;
  setEditing?: (value: boolean) => void;
  rotateSelected?: (value: number) => Promise<boolean>;
};
type OnSelect = NonNullable<FixtureRoom['select']>;
type FixtureElement = HTMLInputElement & HTMLFormElement & HTMLImageElement & HTMLDetailsElement & {
  elements: Record<string, HTMLInputElement>;
};
type FixtureDocument = Omit<Document, 'getElementById' | 'querySelector' | 'querySelectorAll'> & {
  getElementById(id: string): FixtureElement;
  querySelector(selector: string): FixtureElement;
  querySelectorAll(selector: string): NodeListOf<FixtureElement>;
};
export type TestFetchOptions = { body?: string; method?: string };
export type FixtureWindow = BrowserFixture & Omit<Window, 'document' | 'fetch' | 'EZRoom'> &
  Pick<typeof globalThis, 'HTMLElement' | 'HTMLDialogElement' | 'Event' | 'MouseEvent' | 'KeyboardEvent'> & {
    document: FixtureDocument;
    fetch(path: string, options?: TestFetchOptions): Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;
    EZRoom(this: FixtureRoom, host: HTMLElement, id: string, onSelect: OnSelect, options?: unknown): void;
    selectUnit: OnSelect;
    editing: boolean;
  };
