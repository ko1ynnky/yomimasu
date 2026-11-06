// kv-live.js が window に置く API のうち、入口の絵（kv.ts）で使う所の型。
export type KvOptions = {
  stream: string;
  cell: number;
  fps?: number;
  layout?: 'tate' | 'yoko';
  tapGyro?: boolean;
  time?: number;
  playing?: boolean;
  // 升目1つを、縦横いくつの画素で写すか。既定は 3
  ss?: number;
};

// 描いた升目の字。行、列、字、濃さ、札の升目か
export type Glyph = [row: number, col: number, char: string, alpha: number, card?: number];
export type Painted = { list: Glyph[]; cell: number; ink: { color: string; card: string; font: string } };

export type KvLive = {
  set(next: Partial<KvOptions>): void;
  hold(): void;
  release(): void;
  destroy(): void;
};

declare global {
  interface Window {
    YomimasuKv: {
      // WebGL2 がないときは null を返す
      mount(element: HTMLElement, options: KvOptions): KvLive | null;
      still(element: HTMLElement, options: KvOptions): HTMLCanvasElement;
      glyphsOf(canvas: HTMLCanvasElement): Painted | undefined;
      LOOP: number;
      READ_T: number;
    };
  }
}
