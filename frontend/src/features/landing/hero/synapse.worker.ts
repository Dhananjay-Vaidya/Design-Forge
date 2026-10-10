/**
 * Web Worker host for the hero node network. three.js is imported only here, so it is bundled into the
 * worker's own chunk and never parsed on the main thread. Messages in: init, resize, pointer, theme,
 * run, dispose. Messages out: "ready" or "error" (the page then shows the static hero instead).
 */

import { type CoreTheme, createSynapseCore, type SynapseCore } from "./synapseCore";

export type ToWorker =
  | {
      type: "init";
      canvas: OffscreenCanvas;
      width: number;
      height: number;
      pixelRatio: number;
      theme: CoreTheme;
      running: boolean;
    }
  | { type: "resize"; width: number; height: number; pixelRatio: number }
  | { type: "pointer"; x: number | null; y: number | null }
  | { type: "theme"; theme: CoreTheme }
  | { type: "run"; on: boolean }
  | { type: "dispose" };

export type FromWorker = { type: "ready" } | { type: "error" };

// The project compiles with the DOM lib; describe the small part of the worker scope used here.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
  postMessage(message: FromWorker): void;
  close(): void;
};

let core: SynapseCore | null = null;

scope.onmessage = ({ data }) => {
  switch (data.type) {
    case "init":
      try {
        core = createSynapseCore(data.canvas);
        core.theme(data.theme);
        core.resize(data.width, data.height, data.pixelRatio);
        core.run(data.running);
        scope.postMessage({ type: "ready" });
      } catch {
        scope.postMessage({ type: "error" }); // no WebGL in this browser/worker: stay static
      }
      break;
    case "resize":
      core?.resize(data.width, data.height, data.pixelRatio);
      break;
    case "pointer":
      core?.pointer(data.x, data.y);
      break;
    case "theme":
      core?.theme(data.theme);
      break;
    case "run":
      core?.run(data.on);
      break;
    case "dispose":
      core?.dispose();
      core = null;
      scope.close();
      break;
  }
};
