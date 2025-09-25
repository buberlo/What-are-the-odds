import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ExperienceStage } from "../types";

interface StageMeta {
  id: ExperienceStage;
  label: string;
  title: string;
  description: string;
}

interface GameExperience3DProps {
  stages: StageMeta[];
  stageOrder: ExperienceStage[];
  activeStage: ExperienceStage;
  stageCompletion: Record<ExperienceStage, boolean>;
  canAdvance: boolean;
  onSelectStage: (stage: ExperienceStage) => void;
  onAdvance: () => void;
}

type RendererInstance = {
  setPixelRatio: (ratio: number) => void;
  setSize: (width: number, height: number) => void;
  setClearColor: (color: number | string, alpha?: number) => void;
  render: (scene: THREE.Scene, camera: THREE.Camera) => void;
  setAnimationLoop?: (callback: THREE.XRFrameRequestCallback | null) => void;
  dispose?: () => void;
  domElement: HTMLCanvasElement;
};

type StageMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> & {
  userData: {
    id: ExperienceStage;
    label: string;
    index: number;
    status: StageStatus;
    labelSprite?: THREE.Sprite;
  };
};

type StageStatus = "locked" | "available" | "active" | "complete";

const statusColor = (status: StageStatus) => {
  switch (status) {
    case "active":
      return { base: new THREE.Color(0xff3f86), emissive: new THREE.Color(0xff77cc) };
    case "complete":
      return { base: new THREE.Color(0x42f5c5), emissive: new THREE.Color(0x32d4a5) };
    case "available":
      return { base: new THREE.Color(0x58a6ff), emissive: new THREE.Color(0x4cc8ff) };
    case "locked":
    default:
      return { base: new THREE.Color(0x1c2140), emissive: new THREE.Color(0x101428) };
  }
};

const createLabelSprite = (label: string, status: StageStatus) => {
  const canvas = document.createElement("canvas");
  const width = 320;
  const height = 128;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.Sprite();
  }

  context.clearRect(0, 0, width, height);
  context.font = "600 46px 'Space Grotesk', 'Inter', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";

  const gradient = context.createLinearGradient(0, 0, width, height);
  if (status === "active") {
    gradient.addColorStop(0, "rgba(255, 63, 134, 0.85)");
    gradient.addColorStop(1, "rgba(92, 21, 102, 0.8)");
  } else if (status === "complete") {
    gradient.addColorStop(0, "rgba(66, 245, 197, 0.78)");
    gradient.addColorStop(1, "rgba(21, 120, 102, 0.7)");
  } else if (status === "available") {
    gradient.addColorStop(0, "rgba(88, 166, 255, 0.82)");
    gradient.addColorStop(1, "rgba(31, 99, 198, 0.68)");
  } else {
    gradient.addColorStop(0, "rgba(40, 48, 74, 0.7)");
    gradient.addColorStop(1, "rgba(21, 26, 46, 0.7)");
  }

  context.fillStyle = gradient;
  const radius = 44;
  const rectWidth = width * 0.86;
  const rectX = (width - rectWidth) / 2;
  const rectY = height / 2 - 42;
  const rectHeight = 84;

  context.beginPath();
  context.moveTo(rectX + radius, rectY);
  context.lineTo(rectX + rectWidth - radius, rectY);
  context.quadraticCurveTo(rectX + rectWidth, rectY, rectX + rectWidth, rectY + radius);
  context.lineTo(rectX + rectWidth, rectY + rectHeight - radius);
  context.quadraticCurveTo(
    rectX + rectWidth,
    rectY + rectHeight,
    rectX + rectWidth - radius,
    rectY + rectHeight,
  );
  context.lineTo(rectX + radius, rectY + rectHeight);
  context.quadraticCurveTo(rectX, rectY + rectHeight, rectX, rectY + rectHeight - radius);
  context.lineTo(rectX, rectY + radius);
  context.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
  context.closePath();
  context.fill();

  context.fillStyle = "rgba(11, 15, 28, 0.9)";
  context.fillText(label, width / 2, height / 2 + 6);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.1, 1.25, 1);
  return sprite;
};

const updateLabelSprite = (sprite: THREE.Sprite | undefined, label: string, status: StageStatus) => {
  if (!sprite) return;
  const canvas = (sprite.material as THREE.SpriteMaterial).map?.image as HTMLCanvasElement | undefined;
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  context.font = "600 46px 'Space Grotesk', 'Inter', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";

  const gradient = context.createLinearGradient(0, 0, width, height);
  if (status === "active") {
    gradient.addColorStop(0, "rgba(255, 63, 134, 0.85)");
    gradient.addColorStop(1, "rgba(92, 21, 102, 0.8)");
  } else if (status === "complete") {
    gradient.addColorStop(0, "rgba(66, 245, 197, 0.78)");
    gradient.addColorStop(1, "rgba(21, 120, 102, 0.7)");
  } else if (status === "available") {
    gradient.addColorStop(0, "rgba(88, 166, 255, 0.82)");
    gradient.addColorStop(1, "rgba(31, 99, 198, 0.68)");
  } else {
    gradient.addColorStop(0, "rgba(40, 48, 74, 0.7)");
    gradient.addColorStop(1, "rgba(21, 26, 46, 0.7)");
  }

  context.fillStyle = gradient;
  const radius = 44;
  const rectWidth = width * 0.86;
  const rectX = (width - rectWidth) / 2;
  const rectY = height / 2 - 42;
  const rectHeight = 84;

  context.beginPath();
  context.moveTo(rectX + radius, rectY);
  context.lineTo(rectX + rectWidth - radius, rectY);
  context.quadraticCurveTo(rectX + rectWidth, rectY, rectX + rectWidth, rectY + radius);
  context.lineTo(rectX + rectWidth, rectY + rectHeight - radius);
  context.quadraticCurveTo(
    rectX + rectWidth,
    rectY + rectHeight,
    rectX + rectWidth - radius,
    rectY + rectHeight,
  );
  context.lineTo(rectX + radius, rectY + rectHeight);
  context.quadraticCurveTo(rectX, rectY + rectHeight, rectX, rectY + rectHeight - radius);
  context.lineTo(rectX, rectY + radius);
  context.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
  context.closePath();
  context.fill();

  context.fillStyle = "rgba(11, 15, 28, 0.9)";
  context.fillText(label, width / 2, height / 2 + 6);

  const map = (sprite.material as THREE.SpriteMaterial).map;
  if (map) {
    map.needsUpdate = true;
  }
};

const GameExperience3D = ({
  stages,
  stageOrder,
  activeStage,
  stageCompletion,
  canAdvance,
  onSelectStage,
  onAdvance,
}: GameExperience3DProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<RendererInstance | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const stageMeshesRef = useRef<StageMesh[]>([]);
  const advanceNodeRef = useRef<THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial> | null>(null);
  const pointerRef = useRef(new THREE.Vector2());
  const raycasterRef = useRef(new THREE.Raycaster());
  const [initialized, setInitialized] = useState(false);

  const statusMap = useMemo(() => {
    const map = new Map<ExperienceStage, StageStatus>();
    stageOrder.forEach((stageId, index) => {
      if (stageId === activeStage) {
        map.set(stageId, "active");
        return;
      }
      const isComplete = stageCompletion[stageId];
      if (isComplete) {
        map.set(stageId, "complete");
        return;
      }
      if (index > 0) {
        const previousId = stageOrder[index - 1];
        if (!stageCompletion[previousId]) {
          map.set(stageId, "locked");
          return;
        }
      }
      map.set(stageId, "available");
    });
    return map;
  }, [stageOrder, stageCompletion, activeStage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!container || !canvas) return;

    let isMounted = true;
    let animationFrame: number | null = null;

    const setupRenderer = async () => {
      try {
        const { default: WebGPURenderer } = await import(
          "three/examples/jsm/renderers/webgpu/WebGPURenderer.js"
        );
        if (!isMounted) return;
        const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true });
        await renderer.init();
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setClearColor(0x050b19, 0.9);
        rendererRef.current = renderer as unknown as RendererInstance;
      } catch (error) {
        if (!isMounted) return;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setClearColor(0x050b19, 0.9);
        rendererRef.current = renderer;
      }

      if (!isMounted) return;

      const scene = new THREE.Scene();
      scene.background = null;
      const camera = new THREE.PerspectiveCamera(
        54,
        container.clientWidth / container.clientHeight,
        0.1,
        100,
      );
      camera.position.set(0, 2.4, 10.5);
      camera.lookAt(0, 0.8, 0);

      const ambient = new THREE.AmbientLight(0x88aaff, 0.8);
      scene.add(ambient);
      const keyLight = new THREE.PointLight(0xff66aa, 18, 20, 2);
      keyLight.position.set(-6, 6, 8);
      scene.add(keyLight);
      const fillLight = new THREE.PointLight(0x5ecbff, 14, 20, 2);
      fillLight.position.set(6, -3, 8);
      scene.add(fillLight);

      const floorGeometry = new THREE.CircleGeometry(8, 64);
      const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x0b1332,
        emissive: 0x16204a,
        emissiveIntensity: 0.6,
        metalness: 0.4,
        roughness: 0.6,
      });
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.75;
      scene.add(floor);

      const advanceGeometry = new THREE.TorusGeometry(1.3, 0.18, 64, 160);
      const advanceMaterial = new THREE.MeshStandardMaterial({
        color: 0x2f4fff,
        emissive: 0x1a2aff,
        emissiveIntensity: 1.4,
        metalness: 0.6,
        roughness: 0.35,
      });
      const advanceNode = new THREE.Mesh(advanceGeometry, advanceMaterial);
      advanceNode.rotation.x = Math.PI / 2;
      advanceNode.position.set(0, -0.4, 0);
      advanceNodeRef.current = advanceNode;
      scene.add(advanceNode);

      const advanceCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 32, 32),
        new THREE.MeshStandardMaterial({
          color: 0x7b9cff,
          emissive: 0x2840ff,
          emissiveIntensity: 1.2,
          metalness: 0.8,
          roughness: 0.22,
        }),
      );
      advanceCore.position.set(0, -0.05, 0);
      scene.add(advanceCore);

      const stageGroup = new THREE.Group();
      scene.add(stageGroup);

      const auraGeometry = new THREE.RingGeometry(1.6, 2.8, 80, 1);
      const auraMaterial = new THREE.MeshBasicMaterial({
        color: 0x558aff,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });

      stageMeshesRef.current = stages.map((stage, index) => {
        const geometry = new THREE.IcosahedronGeometry(0.9, 2);
        const material = new THREE.MeshStandardMaterial({
          color: 0x243060,
          emissive: 0x101428,
          emissiveIntensity: 0.9,
          metalness: 0.8,
          roughness: 0.35,
          transparent: true,
          opacity: 0.95,
        });
        const mesh = new THREE.Mesh(geometry, material) as StageMesh;
        const radius = 6.8;
        const angle = (index / stages.length) * Math.PI * 2;
        mesh.position.set(Math.cos(angle) * radius, Math.sin(angle * 0.6) * 1.2 + 0.8, Math.sin(angle) * radius);
        mesh.userData = {
          id: stage.id,
          label: stage.label,
          index,
          status: "locked",
        };
        mesh.castShadow = false;
        mesh.receiveShadow = false;

        const aura = new THREE.Mesh(auraGeometry, auraMaterial.clone());
        aura.position.copy(mesh.position);
        aura.rotation.x = -Math.PI / 2;
        aura.scale.setScalar(0.62);
        stageGroup.add(aura);

        const sprite = createLabelSprite(stage.label, "locked");
        sprite.position.copy(mesh.position.clone().setY(mesh.position.y + 1.7));
        scene.add(sprite);
        mesh.userData.labelSprite = sprite;

        stageGroup.add(mesh);
        return mesh;
      });

      sceneRef.current = scene;
      cameraRef.current = camera;

      const animate = (time: number) => {
        stageMeshesRef.current.forEach((mesh, index) => {
          const t = time * 0.00035 + index;
          mesh.rotation.x += 0.0025;
          mesh.rotation.y += 0.003;
          mesh.position.y = Math.sin(t) * 0.65 + 0.8;
          const sprite = mesh.userData.labelSprite;
          if (sprite) {
            sprite.position.x = mesh.position.x;
            sprite.position.z = mesh.position.z;
            sprite.position.y = mesh.position.y + 1.8;
            sprite.lookAt(camera.position.x, sprite.position.y, camera.position.z);
          }
        });

        if (advanceNodeRef.current) {
          advanceNodeRef.current.rotation.z += 0.005;
          advanceNodeRef.current.scale.setScalar(canAdvance ? 1.1 : 0.95);
          const material = advanceNodeRef.current.material;
          material.emissiveIntensity = canAdvance ? 2.3 : 0.8;
          material.color.set(canAdvance ? 0x7ad1ff : 0x1f2a66);
          material.emissive.set(canAdvance ? 0x4c8cff : 0x0d1540);
        }

        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (renderer && scene && camera) {
          renderer.render(scene, camera);
        }

        animationFrame = requestAnimationFrame(animate);
      };

      animationFrame = requestAnimationFrame(animate);
      setInitialized(true);
    };

    setupRenderer();

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      rendererRef.current.setSize(clientWidth, clientHeight);
      cameraRef.current.aspect = clientWidth / clientHeight;
      cameraRef.current.updateProjectionMatrix();
    };

    window.addEventListener("resize", handleResize);

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      if (!sceneRef.current || !cameraRef.current) return;
      const raycaster = raycasterRef.current;
      raycaster.setFromCamera(pointerRef.current, cameraRef.current);
      const intersects = raycaster.intersectObjects(stageMeshesRef.current, false) as THREE.Intersection<StageMesh>[];
      const hovered = intersects[0]?.object ?? null;

      stageMeshesRef.current.forEach((mesh) => {
        const isHovered = hovered?.userData.id === mesh.userData.id;
        const targetScale = isHovered || mesh.userData.id === activeStage ? 1.4 : 1;
        mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.12);
      });

      if (advanceNodeRef.current) {
        const intersectsAdvance = raycaster.intersectObject(advanceNodeRef.current, false);
        if (intersectsAdvance.length > 0 && canAdvance) {
          advanceNodeRef.current.scale.lerp(new THREE.Vector3(1.35, 1.35, 1.35), 0.2);
        }
      }
    };

    const handlePointerLeave = () => {
      stageMeshesRef.current.forEach((mesh) => {
        const targetScale = mesh.userData.id === activeStage ? 1.4 : 1;
        mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 1);
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!sceneRef.current || !cameraRef.current) return;
      const rect = container.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = raycasterRef.current;
      raycaster.setFromCamera(pointerRef.current, cameraRef.current);
      const intersectStage = raycaster.intersectObjects(stageMeshesRef.current, false) as THREE.Intersection<StageMesh>[];
      const stage = intersectStage[0]?.object;
      if (stage) {
        const status = statusMap.get(stage.userData.id) ?? "locked";
        if (status !== "locked") {
          onSelectStage(stage.userData.id);
        }
        return;
      }
      if (advanceNodeRef.current) {
        const intersectsAdvance = raycaster.intersectObject(advanceNodeRef.current, false);
        if (intersectsAdvance.length > 0 && canAdvance) {
          onAdvance();
        }
      }
    };

    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", handlePointerLeave);
    container.addEventListener("pointerup", handlePointerUp);

    return () => {
      isMounted = false;
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
      container.removeEventListener("pointerup", handlePointerUp);
      stageMeshesRef.current.forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
        if (mesh.userData.labelSprite) {
          sceneRef.current?.remove(mesh.userData.labelSprite);
          mesh.userData.labelSprite.material.dispose();
        }
      });
      stageMeshesRef.current = [];
      if (advanceNodeRef.current) {
        advanceNodeRef.current.geometry.dispose();
        advanceNodeRef.current.material.dispose();
        advanceNodeRef.current = null;
      }
      if (rendererRef.current) {
        rendererRef.current.dispose?.();
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, [stages, statusMap, canAdvance, onSelectStage, onAdvance, activeStage]);

  useEffect(() => {
    if (!initialized) return;
    stageMeshesRef.current.forEach((mesh) => {
      const status = statusMap.get(mesh.userData.id) ?? "locked";
      mesh.userData.status = status;
      const { base, emissive } = statusColor(status);
      mesh.material.color.copy(base);
      mesh.material.emissive.copy(emissive);
      mesh.material.emissiveIntensity = status === "active" ? 1.8 : status === "complete" ? 1.4 : 0.8;
      const sprite = mesh.userData.labelSprite;
      if (sprite) {
        updateLabelSprite(sprite, mesh.userData.label, status);
      }
      const targetScale = mesh.userData.id === activeStage ? 1.4 : status === "locked" ? 0.86 : 1;
      mesh.scale.setScalar(targetScale);
    });
  }, [statusMap, initialized, activeStage]);

  return (
    <div className="game-scene" ref={containerRef}>
      <canvas ref={canvasRef} className="game-scene__canvas" />
      <div className="game-scene__overlay">
        <div className="game-scene__hint">Drag the holodeck nodes or click the luminous ring to advance.</div>
      </div>
    </div>
  );
};

export default GameExperience3D;
