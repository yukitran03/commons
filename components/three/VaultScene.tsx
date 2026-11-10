"use client";
// The landing page's 3D scene, and it tells the product's story rather than decorating it:
// a glass vault (the group's Sputnik DAO) with an amber core (the pot), member keys orbiting it, each wired to the
// vault, and the bot on an outer orbit whose dashed line never reaches the vault. Every few seconds the bot sends a
// proposal, three of five keys light up green (a majority), and the vault pays one member.
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const MEMBERS = 5;
const RING = 1.95;
const BOT_RING = 2.85;
const PERIOD = 7.5; // seconds per proposal cycle
const APPROVERS = [0, 2, 3]; // a majority of five
const PAYEE = 2;

const C = {
  amber: new THREE.Color("#f59e0b"),
  green: new THREE.Color("#34d399"),
  idle: new THREE.Color("#475569"),
  bot: new THREE.Color("#94a3b8"),
  glass: new THREE.Color("#1e293b"),
};

/** 0..1 progress of x inside [a, b], clamped. */
const span = (x: number, a: number, b: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const ease = (t: number) => t * t * (3 - 2 * t);

function memberPos(i: number, out = new THREE.Vector3()) {
  const a = (i / MEMBERS) * Math.PI * 2;
  return out.set(Math.cos(a) * RING, Math.sin(a * 2) * 0.25, Math.sin(a) * RING);
}

function Story({ still, particles }: { still: boolean; particles: number }) {
  const root = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Group>(null);
  const bot = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const coreLight = useRef<THREE.PointLight>(null);
  const proposal = useRef<THREE.Mesh>(null);
  const payment = useRef<THREE.Mesh>(null);
  const dust = useRef<THREE.Points>(null);
  const keys = useRef<(THREE.Mesh | null)[]>([]);

  // Lines from each key to the vault, and the bot's dashed line that stops short of it.
  const wires = useMemo(
    () =>
      Array.from({ length: MEMBERS }, (_, i) => {
        const g = new THREE.BufferGeometry().setFromPoints([memberPos(i), memberPos(i).multiplyScalar(0.36)]);
        return new THREE.Line(g, new THREE.LineBasicMaterial({ color: C.idle, transparent: true, opacity: 0.35 }));
      }),
    [],
  );
  const botWire = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(BOT_RING, 0, 0), new THREE.Vector3(RING + 0.45, 0, 0)]);
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: C.bot, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.6 }));
    l.computeLineDistances();
    return l;
  }, []);
  const vaultEdges = useMemo(
    () => new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.85, 0)), new THREE.LineBasicMaterial({ color: C.amber, transparent: true, opacity: 0.55 })),
    [],
  );
  const dustGeo = useMemo(() => {
    const pos = new Float32Array(particles * 3);
    for (let i = 0; i < particles; i++) {
      const r = 6 + Math.random() * 9;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      pos.set([r * Math.sin(p) * Math.cos(t), r * Math.cos(p) * 0.6, r * Math.sin(p) * Math.sin(t)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [particles]);

  // Free GPU memory for objects created outside JSX.
  useEffect(
    () => () => {
      for (const w of [...wires, botWire, vaultEdges]) {
        w.geometry.dispose();
        (w.material as THREE.Material).dispose();
      }
      dustGeo.dispose();
    },
    [wires, botWire, vaultEdges, dustGeo],
  );

  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Color() }), []);

  useFrame((state, delta) => {
    // A still frame (reduced motion) shows the approved moment: three green keys and a lit core.
    const t = still ? PERIOD * 0.5 : state.clock.elapsedTime;
    const phase = t % PERIOD;
    if (!still && ring.current) ring.current.rotation.y += delta * 0.12;
    if (!still && bot.current) bot.current.rotation.y -= delta * 0.05;
    if (!still && dust.current) dust.current.rotation.y += delta * 0.01;

    // Camera follows the pointer a little.
    if (root.current) {
      root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, still ? 0.12 : 0.12 - state.pointer.y * 0.12, 0.05);
      root.current.rotation.z = THREE.MathUtils.lerp(root.current.rotation.z, still ? 0 : state.pointer.x * 0.06, 0.05);
    }

    // 0.0-1.4 s: the bot's proposal travels inward and stops at the ring of keys.
    const prop = ease(span(phase, 0.2, 1.4));
    if (proposal.current && bot.current) {
      const visible = phase > 0.2 && phase < 1.9;
      proposal.current.visible = visible;
      tmp.a.set(BOT_RING, 0, 0).applyEuler(bot.current.rotation);
      tmp.b.set(RING + 0.45, 0, 0).applyEuler(bot.current.rotation);
      proposal.current.position.lerpVectors(tmp.a, tmp.b, prop);
    }

    // 1.4-3.6 s: three keys approve one after another. 4.4-6.6 s: everything fades back.
    const fade = 1 - ease(span(phase, 5.2, 6.6));
    for (let i = 0; i < MEMBERS; i++) {
      const order = APPROVERS.indexOf(i);
      const lit = order < 0 ? 0 : ease(span(phase, 1.4 + order * 0.7, 1.9 + order * 0.7)) * fade;
      const key = keys.current[i];
      if (key) {
        const m = key.material as THREE.MeshStandardMaterial;
        m.color.copy(C.amber).lerp(C.green, lit);
        m.emissive.copy(C.amber).multiplyScalar(0.35 * (1 - lit)).add(tmp.c.copy(C.green).multiplyScalar(lit * 0.7));
        key.rotation.y += still ? 0 : delta * 0.8;
      }
      const w = wires[i].material as THREE.LineBasicMaterial;
      w.color.copy(C.idle).lerp(C.green, lit);
      w.opacity = 0.3 + lit * 0.6;
    }

    // 3.6-4.6 s: majority reached, the vault's core flashes and pays one member.
    const flash = ease(span(phase, 3.5, 3.9)) * (1 - ease(span(phase, 4.2, 5.4)));
    if (core.current) {
      const m = core.current.material as THREE.MeshBasicMaterial;
      m.color.copy(C.amber).lerp(tmp.c.set("#fff7e6"), flash * 0.7);
      core.current.scale.setScalar(1 + flash * 0.35 + (still ? 0 : Math.sin(t * 2) * 0.03));
    }
    if (coreLight.current) coreLight.current.intensity = 6 + flash * 30;
    if (halo.current) {
      halo.current.scale.setScalar(1 + flash * 0.9 + (still ? 0 : Math.sin(t * 1.3) * 0.06));
      (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.16 + flash * 0.3;
    }
    if (payment.current && ring.current) {
      const pay = ease(span(phase, 3.9, 4.7));
      payment.current.visible = phase > 3.9 && phase < 4.9;
      memberPos(PAYEE, tmp.a).applyEuler(ring.current.rotation);
      payment.current.position.set(0, 0, 0).lerp(tmp.a, pay);
    }
  });

  return (
    <group ref={root}>
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 5]} intensity={1.4} />
      <pointLight ref={coreLight} position={[0, 0, 0]} color={C.amber} intensity={6} distance={8} />

      {/* The vault: glass shell, amber edges, glowing core. */}
      <mesh>
        <icosahedronGeometry args={[0.85, 0]} />
        <meshPhysicalMaterial color={C.glass} roughness={0.15} metalness={0.3} clearcoat={1} transparent opacity={0.55} />
      </mesh>
      <primitive object={vaultEdges} />
      <mesh ref={core}>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshBasicMaterial color={C.amber} />
      </mesh>
      <mesh ref={halo}>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshBasicMaterial color={C.amber} transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Member keys on the inner ring, each wired to the vault. */}
      <group ref={ring}>
        {Array.from({ length: MEMBERS }, (_, i) => (
          <group key={i}>
            <primitive object={wires[i]} />
            <mesh ref={(m) => void (keys.current[i] = m)} position={memberPos(i)}>
              <octahedronGeometry args={[0.19, 0]} />
              <meshStandardMaterial color={C.amber} roughness={0.35} metalness={0.4} />
            </mesh>
          </group>
        ))}
      </group>

      {/* The bot: outer orbit, dashed line that stops before the vault. It can propose, not pay. */}
      <group ref={bot} rotation={[0, 0.9, 0]}>
        <primitive object={botWire} />
        <mesh position={[BOT_RING, 0, 0]}>
          <boxGeometry args={[0.26, 0.26, 0.26]} />
          <meshStandardMaterial color={C.bot} roughness={0.6} metalness={0.2} />
        </mesh>
      </group>

      <mesh ref={proposal} visible={false}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color="#e2e8f0" />
      </mesh>
      <mesh ref={payment} visible={false}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshBasicMaterial color={C.amber} />
      </mesh>

      <points ref={dust} geometry={dustGeo}>
        <pointsMaterial color="#cbd5e1" size={0.03} sizeAttenuation transparent opacity={0.55} depthWrite={false} />
      </points>
    </group>
  );
}

export default function VaultScene() {
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
        camera={{ position: [0, 2.3, small ? 6.7 : 6.3], fov: 50 }}
        onCreated={({ camera }) => camera.lookAt(0, -0.15, 0)}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <Story still={still} particles={small ? 450 : 1100} />
      </Canvas>
    </div>
  );
}
