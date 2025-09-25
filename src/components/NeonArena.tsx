import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";

const ORB_COUNT = 120;

const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

type Orb = {
  radius: number;
  baseAngle: number;
  speed: number;
  yPhase: number;
  hue: number;
};

export const NeonArena = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [webgpuSupported, setWebgpuSupported] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) {
      return;
    }

    const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;
    if (!hasWebGPU) {
      setWebgpuSupported(false);
      return;
    }

    let renderer: WebGPURenderer | null = null;
    const resizeObservers: ResizeObserver[] = [];
    let resizeCleanup: (() => void) | null = null;
    let isMounted = true;

    const init = async () => {
      renderer = new WebGPURenderer({
        canvas,
        antialias: true,
        alpha: true,
      });

      await renderer.init();

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x060016);
      scene.fog = new THREE.FogExp2(0x060016, 0.055);

      const camera = new THREE.PerspectiveCamera(
        60,
        container.clientWidth / container.clientHeight,
        0.1,
        80,
      );
      camera.position.set(0, 1.6, 7.5);

      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.4;
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(container.clientWidth, container.clientHeight, false);

      const ambient = new THREE.HemisphereLight(0x50139d, 0x050511, 0.8);
      const fill = new THREE.PointLight(0xff5ce1, 16, 22, 2);
      fill.position.set(2.4, 4.2, 3.5);
      const cyan = new THREE.PointLight(0x4be3ff, 12, 18, 1.6);
      cyan.position.set(-4, 2.5, -2);
      const back = new THREE.DirectionalLight(0x9073ff, 1.2);
      back.position.set(-2.2, 3.5, -5.5);
      scene.add(ambient, fill, cyan, back);

      const platformGeometry = new THREE.CylinderGeometry(6.5, 6.5, 0.6, 64, 1, true);
      const platformMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x170321),
        emissive: new THREE.Color(0x12011d),
        emissiveIntensity: 1.6,
        metalness: 0.5,
        roughness: 0.2,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      });
      const platform = new THREE.Mesh(platformGeometry, platformMaterial);
      platform.receiveShadow = true;
      platform.rotation.x = Math.PI / 2;
      scene.add(platform);

      const ringGroup = new THREE.Group();
      for (let i = 0; i < 4; i += 1) {
        const radius = 2.4 + i * 0.75;
        const ringGeometry = new THREE.TorusGeometry(radius, 0.045 + i * 0.01, 24, 220);
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(0.83 + i * 0.03, 0.82, 0.62 - i * 0.08),
          transparent: true,
          opacity: 0.55 - i * 0.1,
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        ringGroup.add(ring);
      }
      scene.add(ringGroup);

      const orbGeometry = new THREE.IcosahedronGeometry(0.28, 2);
      const orbMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xff3fdc),
        emissive: new THREE.Color(0xff3fdc),
        emissiveIntensity: 3.6,
        metalness: 0.85,
        roughness: 0.18,
      });
      const instanced = new THREE.InstancedMesh(orbGeometry, orbMaterial, ORB_COUNT);
      instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instanced.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ORB_COUNT * 3), 3);
      scene.add(instanced);

      const orbs: Orb[] = Array.from({ length: ORB_COUNT }, (_, index) => ({
        radius: randomInRange(1.8, 4.6) + Math.sin(index * 1.2) * 0.4,
        baseAngle: Math.random() * Math.PI * 2,
        speed: randomInRange(0.18, 0.62),
        yPhase: Math.random() * Math.PI * 2,
        hue: 0.78 + (index / ORB_COUNT) * 0.12,
      }));

      const dummy = new THREE.Object3D();
      const tempColor = new THREE.Color();

      const animate = (time: number) => {
        const t = time * 0.0006;
        const wave = Math.sin(t * 1.3) * 0.5 + 0.5;
        ringGroup.rotation.z = t * 0.22;
        ringGroup.rotation.y = Math.sin(t * 0.7) * 0.18;
        platform.scale.setScalar(1 + wave * 0.08);

        for (let i = 0; i < ORB_COUNT; i += 1) {
          const orb = orbs[i];
          const angle = orb.baseAngle + t * orb.speed * (i % 2 === 0 ? 1 : -1);
          const radius = orb.radius + Math.sin(t * 0.9 + orb.yPhase) * 0.4;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          const y = Math.sin(t * 2.4 + orb.yPhase * 2) * 0.85 + 0.6;
          dummy.position.set(x, y, z);
          const pulsate = 0.7 + Math.sin(t * 3.2 + orb.yPhase) * 0.28;
          dummy.scale.setScalar(pulsate);
          dummy.rotation.set(Math.sin(angle) * 0.4, Math.cos(angle) * 0.6, Math.sin(t + orb.yPhase) * 0.5);
          dummy.updateMatrix();
          instanced.setMatrixAt(i, dummy.matrix);

          const hue = (orb.hue + Math.sin(t * 0.25 + orb.yPhase) * 0.03) % 1;
          tempColor.setHSL(hue, 0.88, 0.62 + Math.sin(t * 1.8 + orb.yPhase) * 0.08);
          instanced.setColorAt(i, tempColor);
        }

        instanced.instanceMatrix.needsUpdate = true;
        if (instanced.instanceColor) {
          instanced.instanceColor.needsUpdate = true;
        }

        renderer?.render(scene, camera);
      };

      renderer.setAnimationLoop(animate);

      const handleResize = () => {
        if (!renderer) return;
        const { clientWidth, clientHeight } = container;
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(clientWidth, clientHeight, false);
      };

      if (typeof ResizeObserver !== "undefined") {
        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(container);
        resizeObservers.push(resizeObserver);
      } else {
        window.addEventListener("resize", handleResize);
        resizeCleanup = () => window.removeEventListener("resize", handleResize);
      }
    };

    init().catch(() => {
      if (renderer) {
        renderer.dispose();
      }
      if (isMounted) {
        setWebgpuSupported(false);
      }
    });

    return () => {
      isMounted = false;
      resizeObservers.forEach((observer) => observer.disconnect());
      if (resizeCleanup) {
        resizeCleanup();
      }
      if (renderer) {
        renderer.setAnimationLoop(null);
        renderer.dispose();
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="neon-arena" aria-hidden>
      {webgpuSupported ? (
        <canvas ref={canvasRef} className="neon-arena__canvas" />
      ) : (
        <div className="neon-arena__fallback" />
      )}
    </div>
  );
};

export default NeonArena;
