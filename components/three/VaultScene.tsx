"use client";
// The landing page's 3D scene is the logo, alive, and it tells the product's story rather than decorating it:
// three satin-gold arcs (the council's keys) close a C around a glowing core (the pot, the group's Sputnik DAO).
// The bot is a steel bead on a tilted outer orbit. Every few seconds it sends a proposal that stops at the arcs and
// never reaches the core; two arcs light up (a majority of three), the core flares, and a payment leaves through the
// opening of the C. Same geometry as the logo: ring radius 16, tube 5.4, 80° opening, 36° gaps (lib/brand.ts).
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { APPROVERS, PERIOD, beatAt } from "@/lib/heroStory.ts";

const R = 1.25; // ring radius in world units (16 in logo units)
const U = R / 16; // one logo unit
const TUBE = 2.7 * U; // half of the 5.4 stroke
const OPEN = 80;
const GAP = 36;
const SPAN = (360 - OPEN - 2 * GAP) / 3;
const CORE = { x: 1.5 * U, r: 5.6 * U };
const BOT_RING = 2.35;
const deg = (d: number) => (d * Math.PI) / 180;

const C = {
  gold: new THREE.Color("#cf820a"),
  glow: new THREE.Color("#ff9a1a"),
  core: new THREE.Color("#ff9f0a"),
  coreHot: new THREE.Color("#fff3d1"),
  steel: new THREE.Color("#9aa4b2"),
};

/** 0..1 progress of x inside [a, b], clamped. */
const span = (x: number, a: number, b: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const ease = (t: number) => t * t * (3 - 2 * t);

/** A circular arc in the XY plane, for TubeGeometry. Angles in radians, counter-clockwise from +x. */
class Arc extends THREE.Curve<THREE.Vector3> {
  constructor(
    private r: number,
    private a0: number,
    private a1: number,
  ) {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = this.a0 + (this.a1 - this.a0) * t;
    return target.set(this.r * Math.cos(a), this.r * Math.sin(a), 0);
  }
}

/** Soft round glow for sprites (additive), drawn once. */
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,200,110,1)");
  r.addColorStop(0.25, "rgba(255,150,30,0.55)");
  r.addColorStop(0.6, "rgba(255,120,0,0.12)");
  r.addColorStop(1, "rgba(255,120,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Studio reflections for the metal, generated once from three's RoomEnvironment. */
function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.62;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Story({ still, particles, onBeat }: { still: boolean; particles: number; onBeat?: (beat: number) => void }) {
  const beat = useRef(-1);
  const root = useRef<THREE.Group>(null);
  const botOrbit = useRef<THREE.Group>(null);
  const bead = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Sprite>(null);
  const coreLight = useRef<THREE.PointLight>(null);
  const proposal = useRef<THREE.Sprite>(null);
  const stopRing = useRef<THREE.Mesh>(null);
  const payment = useRef<THREE.Sprite>(null);
  const dust = useRef<THREE.Points>(null);

  const glow = useMemo(() => glowTexture(), []);
  // One material per arc, shared by its tube and both round ends, so an approval lights the whole arc.
  const arcMats = useMemo(
    () =>
      [0, 1, 2].map(
        () => new THREE.MeshPhysicalMaterial({ color: C.gold, metalness: 1, roughness: 0.24, clearcoat: 0.8, clearcoatRoughness: 0.12, emissive: C.glow, emissiveIntensity: 0 }),
      ),
    [],
  );
  // Three arcs with round caps, positioned exactly like the logo (svg angles are clockwise, so negate them).
  const arcs = useMemo(
    () =>
      [0, 1, 2].map((i) => {
        const a0 = -deg(OPEN / 2 + i * (SPAN + GAP));
        const a1 = a0 - deg(SPAN);
        const tube = new THREE.TubeGeometry(new Arc(R, a0, a1), 96, TUBE, 32, false);
        const cap = new THREE.SphereGeometry(TUBE, 32, 16);
        return { tube, cap, ends: [new THREE.Vector3(R * Math.cos(a0), R * Math.sin(a0), 0), new THREE.Vector3(R * Math.cos(a1), R * Math.sin(a1), 0)] };
      }),
    [],
  );
  const orbitLine = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0, 0, BOT_RING, BOT_RING).getPoints(160).map((p) => new THREE.Vector3(p.x, p.y, 0)));
    const l = new THREE.LineLoop(g, new THREE.LineDashedMaterial({ color: "#8a7350", dashSize: 0.06, gapSize: 0.08, transparent: true, opacity: 0.45 }));
    l.computeLineDistances();
    return l;
  }, []);
  const dustGeo = useMemo(() => {
    const pos = new Float32Array(particles * 3);
    for (let i = 0; i < particles; i++) {
      const r = 4 + Math.random() * 9;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      pos.set([r * Math.sin(p) * Math.cos(t), r * Math.cos(p) * 0.7, r * Math.sin(p) * Math.sin(t) - 3], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [particles]);

  // Free GPU memory for objects created outside JSX.
  useEffect(
    () => () => {
      for (const a of arcs) {
        a.tube.dispose();
        a.cap.dispose();
      }
      for (const m of arcMats) m.dispose();
      orbitLine.geometry.dispose();
      (orbitLine.material as THREE.Material).dispose();
      dustGeo.dispose();
      glow.dispose();
    },
    [arcs, arcMats, orbitLine, dustGeo, glow],
  );

  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), m: new THREE.Matrix4() }), []);

  useFrame((state, delta) => {
    // A still frame (reduced motion) shows the approved moment: two lit arcs and a bright core.
    const t = still ? 2.8 : state.clock.elapsedTime;
    const phase = t % PERIOD;
    const b = beatAt(phase);
    if (b !== beat.current) {
      beat.current = b;
      onBeat?.(b);
    }

    // The mark floats and leans toward the pointer a little, like a held object.
    if (root.current) {
      const px = still ? 0 : state.pointer.x;
      const py = still ? 0 : state.pointer.y;
      root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, -0.1 - py * 0.14, 0.05);
      root.current.rotation.y = THREE.MathUtils.lerp(root.current.rotation.y, 0.16 + px * 0.22, 0.05);
      root.current.position.y = still ? 0 : Math.sin(t * 0.9) * 0.05;
    }

    // The bot circles slowly on its own tilted orbit, outside the ring.
    const beadAngle = still ? 0.9 : 0.9 + t * 0.16;
    if (bead.current) bead.current.position.set(BOT_RING * Math.cos(beadAngle), BOT_RING * Math.sin(beadAngle), 0);
    if (dust.current && !still) dust.current.rotation.y += delta * 0.008;

    // 0.2-1.4 s: the proposal flies from the bot toward the core and stops outside the arcs. It cannot reach the pot.
    if (proposal.current && bead.current && botOrbit.current && stopRing.current) {
      botOrbit.current.updateMatrixWorld();
      root.current?.updateMatrixWorld();
      tmp.a.copy(bead.current.position).applyMatrix4(botOrbit.current.matrix); // bead in root space
      tmp.b.copy(tmp.a).setZ(0).normalize().multiplyScalar(R + TUBE + 0.22); // stop point just outside the ring
      const fly = ease(span(phase, 0.2, 1.4));
      proposal.current.visible = phase > 0.2 && phase < 1.9;
      proposal.current.position.lerpVectors(tmp.a, tmp.b, fly);
      const pm = proposal.current.material as THREE.SpriteMaterial;
      pm.opacity = 0.9 * (1 - ease(span(phase, 1.4, 1.9)));
      // a small ring flashes where it stops
      const hit = span(phase, 1.3, 1.9);
      stopRing.current.visible = hit > 0 && hit < 1;
      stopRing.current.position.copy(tmp.b);
      stopRing.current.scale.setScalar(0.4 + hit * 1.2);
      (stopRing.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - hit);
    }

    // 1.4-2.9 s: two arcs light up, one approval each. 4.6-6.2 s: everything fades back.
    const fade = 1 - ease(span(phase, 4.6, 6.2));
    arcMats.forEach((m, i) => {
      const order = (APPROVERS as readonly number[]).indexOf(i);
      const lit = order < 0 ? 0 : ease(span(phase, 1.4 + order * 0.75, 1.85 + order * 0.75)) * fade;
      m.emissiveIntensity = lit * 0.95;
    });

    // 2.9-3.4 s: majority reached, the core flares. 3.3-4.4 s: the payment leaves through the opening of the C.
    const flash = ease(span(phase, 2.9, 3.3)) * (1 - ease(span(phase, 3.6, 5.0)));
    if (core.current) {
      const m = core.current.material as THREE.MeshPhysicalMaterial;
      m.emissiveIntensity = 0.28 + flash * 1.4;
      m.color.copy(C.core).lerp(C.coreHot, flash * 0.5);
      core.current.scale.setScalar(1 + flash * 0.12 + (still ? 0 : Math.sin(t * 2) * 0.015));
    }
    if (coreLight.current) coreLight.current.intensity = 2.6 + flash * 8;
    if (halo.current) {
      halo.current.scale.setScalar(2.3 + flash * 1.6 + (still ? 0 : Math.sin(t * 1.3) * 0.08));
      (halo.current.material as THREE.SpriteMaterial).opacity = 0.55 + flash * 0.35;
    }
    if (payment.current) {
      const pay = ease(span(phase, 3.3, 4.4));
      payment.current.visible = phase > 3.3 && phase < 4.6;
      payment.current.position.set(CORE.x + pay * 2.6, pay * 0.15, 0.1);
      payment.current.scale.setScalar(0.42 * (1 - pay * 0.4));
      (payment.current.material as THREE.SpriteMaterial).opacity = 1 - ease(span(phase, 4.1, 4.6));
    }
  });

  return (
    <group ref={root}>
      <Environment />
      <ambientLight intensity={0.08} />
      <directionalLight position={[-3, 4, 5]} intensity={2.4} color="#fff4e0" />
      <directionalLight position={[4, -2, -3]} intensity={1.6} color="#ffa726" />
      <pointLight ref={coreLight} position={[CORE.x, 0, 0.45]} color="#ffb84d" intensity={2.6} distance={5} />

      {/* The council: three satin-gold arcs with round ends. */}
      {arcs.map((a, i) => (
        <group key={i}>
          <mesh geometry={a.tube} material={arcMats[i]} />
          {a.ends.map((p, k) => (
            <mesh key={k} geometry={a.cap} material={arcMats[i]} position={p} />
          ))}
        </group>
      ))}

      {/* The pot: a glossy amber orb with a soft halo. */}
      <mesh ref={core} position={[CORE.x, 0, 0.05]}>
        <sphereGeometry args={[CORE.r, 48, 32]} />
        <meshPhysicalMaterial color={C.core} emissive="#ff7a00" emissiveIntensity={0.28} roughness={0.22} clearcoat={1} clearcoatRoughness={0.06} />
      </mesh>
      <sprite ref={halo} position={[CORE.x, 0, -0.2]} scale={2.3}>
        <spriteMaterial map={glow} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>

      {/* The bot: a steel bead on a tilted orbit. Its proposal stops at the ring. */}
      <group ref={botOrbit} rotation={[1.08, -0.3, 0.2]}>
        <primitive object={orbitLine} />
        <mesh ref={bead}>
          <sphereGeometry args={[0.1, 32, 16]} />
          <meshPhysicalMaterial color={C.steel} metalness={1} roughness={0.18} clearcoat={1} />
        </mesh>
      </group>
      <sprite ref={proposal} visible={false} scale={0.32}>
        <spriteMaterial map={glow} color="#e7e5e4" transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <mesh ref={stopRing} visible={false}>
        <ringGeometry args={[0.1, 0.13, 40]} />
        <meshBasicMaterial color="#d6d3d1" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <sprite ref={payment} visible={false} scale={0.42}>
        <spriteMaterial map={glow} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>

      <points ref={dust} geometry={dustGeo}>
        <pointsMaterial map={glow} color="#f3d39a" size={0.07} sizeAttenuation transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </points>
    </group>
  );
}

export default function VaultScene({ onBeat }: { onBeat?: (beat: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [still, setStill] = useState(false);
  const [small, setSmall] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => setStill(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    setSmall(window.innerWidth < 640);
    // Stop rendering when the hero is off screen or the tab is hidden.
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting && !document.hidden), { threshold: 0.05 });
    if (host.current) io.observe(host.current);
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mq.removeEventListener("change", onMq);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div ref={host} className="absolute inset-0" aria-hidden>
      <Canvas
        dpr={[1, 1.75]}
        frameloop={still ? "demand" : visible ? "always" : "never"}
        camera={{ position: [0, 0.1, small ? 7.6 : 6.9], fov: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.88 }}
      >
        <Story still={still} particles={small ? 380 : 900} onBeat={onBeat} />
      </Canvas>
    </div>
  );
}
