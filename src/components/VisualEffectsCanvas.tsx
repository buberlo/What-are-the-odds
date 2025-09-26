import { useEffect, useRef } from "react";

type WebGPURendererCtor = typeof import(
  "three/src/renderers/webgpu/WebGPURenderer.js"
).default;

type RendererInstance =
  | InstanceType<WebGPURendererCtor>
  | import("three").WebGLRenderer
  | null;

const importVisualModules = async () => {
  const [{ default: THREE }, { default: WebGPURenderer }] = await Promise.all([
    import("three"),
    import("three/src/renderers/webgpu/WebGPURenderer.js"),
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

    const haloGeometry = new THREE.RingGeometry(1.8, 2.25, 96, 1);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0x9adfff,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.rotation.x = Math.PI / 2;
    cluster.add(halo);

    const pulseGeometry = new THREE.RingGeometry(1.95, 2.05, 128, 1);
    const pulseMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
    pulse.rotation.x = Math.PI / 2;
    cluster.add(pulse);

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

    const satelliteGeometry = new THREE.IcosahedronGeometry(0.22, 1);
    const satelliteMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xff8df2,
      emissive: 0xff66d0,
      emissiveIntensity: 0.8,
      metalness: 0.32,
      roughness: 0.36,
      transmission: 0.45,
      thickness: 1.1,
      sheen: 0.5,
    });
    const satelliteCount = 6;
    const satellites = new THREE.InstancedMesh(
      satelliteGeometry,
      satelliteMaterial,
      satelliteCount,
    );
    cluster.add(satellites);

    const satelliteData = Array.from({ length: satelliteCount }, () => ({
      radius: 2.5 + Math.random() * 0.9,
      speed: 0.24 + Math.random() * 0.38,
      phase: Math.random() * Math.PI * 2,
      verticalSwing: 0.28 + Math.random() * 0.38,
    }));

    const auroraGeometry = new THREE.PlaneGeometry(6.6, 4.3, 32, 12);
    const auroraMaterial = new THREE.MeshBasicMaterial({
      color: 0x5fb4ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const aurora = new THREE.Mesh(auroraGeometry, auroraMaterial);
    aurora.position.set(0, 1.9, -2.1);
    aurora.rotation.y = Math.PI / 16;
    cluster.add(aurora);

    const shimmerGeometry = new THREE.SphereGeometry(2.45, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const shimmerMaterial = new THREE.MeshBasicMaterial({
      color: 0x7bd9ff,
      transparent: true,
      opacity: 0.16,
      wireframe: true,
    });
    const shimmer = new THREE.Mesh(shimmerGeometry, shimmerMaterial);
    shimmer.rotation.x = Math.PI / 2.6;
    cluster.add(shimmer);

    const tempMatrix = new THREE.Matrix4();
    const tempQuaternion = new THREE.Quaternion();
    const tempPosition = new THREE.Vector3();
    const satelliteScale = new THREE.Vector3(1, 1, 1);
    const satelliteRotation = new THREE.Euler();

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

      const haloPulse = 1 + Math.sin(elapsed * 0.8) * 0.08;
      halo.scale.setScalar(haloPulse);
      haloMaterial.opacity = 0.24 + Math.abs(Math.sin(elapsed * 1.2)) * 0.22;

      const pulseWave = 1 + Math.sin(elapsed * 1.6) * 0.18;
      pulse.scale.setScalar(pulseWave);
      pulseMaterial.opacity = 0.2 + Math.abs(Math.sin(elapsed * 2.1)) * 0.35;

      shimmer.rotation.y += 0.0009;
      shimmer.scale.setScalar(1 + Math.sin(elapsed * 0.24) * 0.06);

      aurora.rotation.y = Math.sin(elapsed * 0.24) * 0.28;
      aurora.position.y = 1.9 + Math.sin(elapsed * 0.42) * 0.24;
      auroraMaterial.opacity = 0.1 + Math.abs(Math.sin(elapsed * 0.36)) * 0.18;

      satelliteData.forEach((orbit, index) => {
        const angle = elapsed * orbit.speed + orbit.phase;
        const radius = orbit.radius + Math.sin(elapsed * 0.18 + orbit.phase) * 0.12;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = Math.sin(angle * 1.6) * orbit.verticalSwing;

        tempPosition.set(x, y, z);
        satelliteRotation.set(angle * 0.6, angle, angle * 0.18);
        tempQuaternion.setFromEuler(satelliteRotation);
        tempMatrix.compose(tempPosition, tempQuaternion, satelliteScale);
        satellites.setMatrixAt(index, tempMatrix);
      });
      satellites.instanceMatrix.needsUpdate = true;

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
      haloGeometry.dispose();
      haloMaterial.dispose();
      pulseGeometry.dispose();
      pulseMaterial.dispose();
      satelliteGeometry.dispose();
      satelliteMaterial.dispose();
      satellites.dispose();
      auroraGeometry.dispose();
      auroraMaterial.dispose();
      shimmerGeometry.dispose();
      shimmerMaterial.dispose();
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
