declare module "three/src/renderers/webgpu/WebGPURenderer.js" {
  import { Color, WebGLRendererParameters } from "three";

  export default class WebGPURenderer {
    constructor(parameters?: WebGLRendererParameters & { canvas?: HTMLCanvasElement });
    readonly domElement: HTMLCanvasElement;
    init(): Promise<void>;
    setPixelRatio(ratio: number): void;
    setSize(width: number, height: number): void;
    setClearColor(color: Color | string | number, alpha?: number): void;
    render(scene: import("three").Scene, camera: import("three").Camera): void;
    setAnimationLoop(callback: ((time: number) => void) | null): void;
    dispose(): void;
  }
}

declare module "three/examples/jsm/renderers/webgpu/WebGPURenderer.js" {
  import { Color, WebGLRendererParameters } from "three";

  export default class WebGPURenderer {
    constructor(parameters?: WebGLRendererParameters & { canvas?: HTMLCanvasElement });
    readonly domElement: HTMLCanvasElement;
    init(): Promise<void>;
    setPixelRatio(ratio: number): void;
    setSize(width: number, height: number): void;
    setClearColor(color: Color | string | number, alpha?: number): void;
    render(scene: import("three").Scene, camera: import("three").Camera): void;
    setAnimationLoop(callback: ((time: number) => void) | null): void;
    dispose(): void;
  }
}
