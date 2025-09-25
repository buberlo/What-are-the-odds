import { useEffect, useRef } from "react";

type WebGPURendererCtor = typeof import(
  "three/examples/jsm/renderers/webgpu/WebGPURenderer.js"
).default;

type RendererInstance =
  | InstanceType<WebGPURendererCtor>
  | import("three").WebGLRenderer
  | null;

const importVisualModules = async () => {
  const [{ default: THREE }, { default: WebGPURenderer }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/renderers/webgpu/WebGPURenderer.js"),
  ]);
  return { THREE, WebGPURenderer };
};

const setupVisualScene = async (container: HTMLDivElement) => {
  let renderer: RendererInstance = null;
  let disposed = false;

  try {
    const { THREE, WebGPURenderer } = await importVisualModules();
    if (!container.isConnected) {
      return () => {};
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x101a3a, 0.075);

    const camera = new THREE.PerspectiveCamera(
      52,
      (container.clientWidth || window.innerWidth) /
        (container.clientHeight || window.innerHeight),
      0.1,
      100,
    );
    camera.position.set(0, 1.2, 5.2);

    const ambientLight = new THREE.AmbientLight(0x8aa4ff, 0.65);
    scene.add(ambientLight);

    const keyLight = new THREE.PointLight(0x6d88ff, 4.2, 26, 2);
    keyLight.position.set(3.5, 4.5, 4.5);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xff66d0, 2.6, 24, 2);
    rimLight.position.set(-4.5, -1.2, -4.2);
    scene.add(rimLight);

    const cluster = new THREE.Group();
    scene.add(cluster);

    const coreGeometry = new THREE.IcosahedronGeometry(1.35, 2);
    const coreMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x4d8dff,
      emissive: 0x1f4fff,
      emissiveIntensity: 1.35,
      metalness: 0.25,
      roughness: 0.22,
      transmission: 0.72,
      thickness: 2.1,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    cluster.add(core);

    const shellGeometry = new THREE.IcosahedronGeometry(1.75, 1);
    const shellMaterial = new THREE.MeshBasicMaterial({
      color: 0x6bdcff,
      wireframe: true,
      transparent: true,
      opacity: 0.28,
    });
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    cluster.add(shell);

    const ribbonCurve = new THREE.CatmullRomCurve3(
      Array.from({ length: 34 }, (_, index) => {
        const angle = (index / 34) * Math.PI * 2;
        const radius = 2.35 + Math.sin(angle * 2.6) * 0.3;
        const y = Math.sin(angle * 1.8) * 0.42;
        return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      }),
      true,
      "centripetal",
    );
    const ribbonGeometry = new THREE.TubeGeometry(ribbonCurve, 320, 0.045, 16, true);
    const ribbonMaterial = new THREE.MeshBasicMaterial({
      color: 0xff61d6,
      transparent: true,
      opacity: 0.48,
    });
    const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
    ribbon.rotation.x = Math.PI / 2.2;
    cluster.add(ribbon);

    const sparkleGeometry = new THREE.BufferGeometry();
    const sparkleCount = 1800;
    const sparklePositions = new Float32Array(sparkleCount * 3);

    for (let index = 0; index < sparkleCount; index += 1) {
      const radius = 3.4 + Math.random() * 5.4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = Math.sin(phi) * Math.cos(theta) * radius;
      const y = Math.sin(phi) * Math.sin(theta) * radius * 0.65;
      const z = Math.cos(phi) * radius;
      sparklePositions.set([x, y, z], index * 3);
    }

    sparkleGeometry.setAttribute("position", new THREE.BufferAttribute(sparklePositions, 3));

    const sparkleMaterial = new THREE.PointsMaterial({
      color: 0x8bc9ff,
      size: 0.08,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    const sparkles = new THREE.Points(sparkleGeometry, sparkleMaterial);
    cluster.add(sparkles);

    try {
      const webgpuRenderer = new WebGPURenderer({ antialias: true, alpha: true });
      webgpuRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      webgpuRenderer.toneMappingExposure = 1.1;
      renderer = webgpuRenderer;
      await webgpuRenderer.init();
    } catch (error) {
      console.warn("[VisualEffectsCanvas] Falling back to WebGLRenderer", error);
      const webglRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      webglRenderer.toneMappingExposure = 1.1;
      renderer = webglRenderer;
    }

    if (!renderer) {
      return () => {};
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
      false,
    );
    renderer.domElement.classList.add("visual-effects__canvas");
    container.appendChild(renderer.domElement);

    const resize = () => {
      if (!renderer || disposed) return;
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const animate = (timestamp: number) => {
      if (!renderer || disposed) return;
      const elapsed = timestamp * 0.001;

      core.rotation.x += 0.0018;
      core.rotation.y += 0.0022;

      shell.rotation.x -= 0.0009;
      shell.rotation.y += 0.0016;

      ribbon.rotation.z += 0.0019;
      ribbon.rotation.y = Math.sin(elapsed * 0.2) * 0.3;

      sparkles.rotation.y += 0.0006;
      sparkles.rotation.x = Math.sin(elapsed * 0.16) * 0.22;

      keyLight.position.x = Math.cos(elapsed * 0.42) * 4.4;
      keyLight.position.z = Math.sin(elapsed * 0.42) * 4.4;
      keyLight.position.y = 3.2 + Math.sin(elapsed * 0.35) * 0.8;

      rimLight.position.y = Math.sin(elapsed * 0.28) * 2 - 1.4;
      rimLight.position.x = -4.2 + Math.cos(elapsed * 0.31) * 1.4;

      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(animate);
    window.addEventListener("resize", resize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      if (renderer) {
        renderer.setAnimationLoop(null);
        renderer.dispose();
        if (renderer.domElement.parentElement) {
          renderer.domElement.parentElement.removeChild(renderer.domElement);
        }
      }

      coreGeometry.dispose();
      coreMaterial.dispose();
      shellGeometry.dispose();
      shellMaterial.dispose();
      ribbonGeometry.dispose();
      ribbonMaterial.dispose();
      sparkleGeometry.dispose();
      sparkleMaterial.dispose();
    };
  } catch (error) {
    console.warn("[VisualEffectsCanvas] Unable to initialise visuals", error);
  }

  return () => {
    disposed = true;
    if (renderer) {
      renderer.setAnimationLoop(null);
      renderer.dispose();
    }
  };
};

const VisualEffectsCanvas = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    setupVisualScene(container)
      .then((dispose) => {
        if (cancelled) {
          dispose();
        } else {
          cleanup = dispose;
        }
      })
      .catch((error) => {
        console.warn("[VisualEffectsCanvas] Failed to set up scene", error);
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return <div ref={containerRef} className="visual-effects" aria-hidden="true" />;
};

export default VisualEffectsCanvas;
