declare module 'jsdom' {
  export class JSDOM {
    constructor(html: string, options: { url: string; runScripts: 'outside-only' });
    window: import('./browser-fixture.ts').FixtureWindow;
  }
}
