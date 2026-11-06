// kv-live.js が window に置く API のうち、入口の絵（kv.ts）で使う所の型。
export type KvOptions = {
  stream: string;
  cell: number;
  fps?: number;
  layout?: 'tate' | 'yoko';
  tapGyro?: boolean;
  time?: number;
  playing?: boolean;
};

export type KvLive = {
  set(next: Partial<KvOptions>): void;
  destroy(): void;
};

declare global {
  interface Window {
    YomimasuKv: {
      // WebGL2 がないときは null を返す
      mount(element: HTMLElement, options: KvOptions): KvLive | null;
      still(element: HTMLElement, options: KvOptions): HTMLCanvasElement;
      LOOP: number;
      READ_T: number;
    };
  }
}
