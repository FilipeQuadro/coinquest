import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, type ThreeElements } from '@react-three/fiber'

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

type GroupInstanceFromRef<T> = T extends { current: infer Instance }
  ? Instance
  : T extends (instance: infer Instance) => void
    ? NonNullable<Instance>
    : never

type GroupInstance = GroupInstanceFromRef<NonNullable<ThreeElements['group']['ref']>>

function getPrefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.(reducedMotionQuery).matches === true
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getPrefersReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia?.(reducedMotionQuery)
    if (!mediaQuery) return
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches)
    updatePreference()
    mediaQuery.addEventListener?.('change', updatePreference)
    return () => mediaQuery.removeEventListener?.('change', updatePreference)
  }, [])

  return prefersReducedMotion
}

function CameraRig({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  const elapsedTime = useRef(0)

  useFrame(({ camera }, delta) => {
    if (!prefersReducedMotion) elapsedTime.current += delta
    const drift = prefersReducedMotion ? 0 : Math.sin(elapsedTime.current * 0.2) * 0.14
    const targetX = 5.7 + drift
    const targetZ = 8 + drift * 0.45
    const smoothing = 1 - Math.exp(-delta * 1.4)

    camera.position.x += (targetX - camera.position.x) * smoothing
    camera.position.z += (targetZ - camera.position.z) * smoothing
    camera.lookAt(0, 0.86, -0.08)
  })

  return null
}

function Character({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  const characterRef = useRef<GroupInstance | null>(null)
  const elapsedTime = useRef(0)

  useFrame((_state, delta) => {
    if (prefersReducedMotion || !characterRef.current) return
    elapsedTime.current += delta
    characterRef.current.position.y = 0.18 + Math.sin(elapsedTime.current * 1.8) * 0.035
    characterRef.current.rotation.y = Math.sin(elapsedTime.current * 0.55) * 0.045
  })

  return (
    <group
      ref={characterRef}
      position={[-1.05, 0.17, 0.3]}
    >
      <mesh castShadow position={[0, 0.48, 0]}>
        <capsuleGeometry args={[0.23, 0.42, 4, 8]} />
        <meshStandardMaterial color="#31585b" roughness={0.78} />
      </mesh>
      <mesh castShadow position={[0, 1.01, 0.015]}>
        <sphereGeometry args={[0.215, 16, 12]} />
        <meshStandardMaterial color="#d9b89a" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[-0.155, 0.18, 0.025]} rotation={[0, 0, 0.08]}>
        <capsuleGeometry args={[0.085, 0.25, 3, 7]} />
        <meshStandardMaterial color="#25363a" roughness={0.86} />
      </mesh>
      <mesh castShadow position={[0.155, 0.18, 0.025]} rotation={[0, 0, -0.08]}>
        <capsuleGeometry args={[0.085, 0.25, 3, 7]} />
        <meshStandardMaterial color="#25363a" roughness={0.86} />
      </mesh>
      <mesh castShadow position={[-0.3, 0.55, 0.015]} rotation={[0, 0, -0.68]}>
        <capsuleGeometry args={[0.075, 0.3, 3, 7]} />
        <meshStandardMaterial color="#416b68" roughness={0.78} />
      </mesh>
      <mesh castShadow position={[0.3, 0.55, 0.015]} rotation={[0, 0, 0.68]}>
        <capsuleGeometry args={[0.075, 0.3, 3, 7]} />
        <meshStandardMaterial color="#416b68" roughness={0.78} />
      </mesh>
      <mesh castShadow position={[0, 0.03, -0.17]}>
        <boxGeometry args={[0.3, 0.38, 0.2]} />
        <meshStandardMaterial color="#725f43" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.47, 0.218]}>
        <boxGeometry args={[0.085, 0.25, 0.022]} />
        <meshStandardMaterial color="#83b8a5" roughness={0.55} />
      </mesh>
      <mesh position={[0.205, 1.01, 0.015]}>
        <sphereGeometry args={[0.055, 10, 8]} />
        <meshStandardMaterial color="#55d6d1" emissive="#197d7d" emissiveIntensity={0.45} />
      </mesh>
      <mesh position={[-0.17, 0.93, 0.04]}>
        <boxGeometry args={[0.1, 0.055, 0.12]} />
        <meshStandardMaterial color="#344447" roughness={0.8} />
      </mesh>
    </group>
  )
}

function Vault() {
  return (
    <group position={[1.25, 0.15, -0.48]}>
      <mesh castShadow receiveShadow position={[0, 0.13, 0]}>
        <cylinderGeometry args={[0.62, 0.72, 0.26, 24]} />
        <meshStandardMaterial color="#66543c" roughness={0.72} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.68, 0]}>
        <cylinderGeometry args={[0.48, 0.53, 0.82, 24]} />
        <meshStandardMaterial color="#43595a" metalness={0.28} roughness={0.52} />
      </mesh>
      <mesh castShadow position={[0, 0.68, 0.485]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.34, 0.34, 0.045, 24]} />
        <meshStandardMaterial color="#273c40" metalness={0.4} roughness={0.48} />
      </mesh>
      <mesh position={[0, 0.68, 0.515]}>
        <torusGeometry args={[0.27, 0.035, 8, 32]} />
        <meshStandardMaterial color="#c79b52" metalness={0.48} roughness={0.38} />
      </mesh>
      <mesh position={[0, 0.68, 0.535]}>
        <cylinderGeometry args={[0.055, 0.055, 0.035, 12]} />
        <meshStandardMaterial color="#f0ce78" emissive="#9b6d2f" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.29, 0.68, 0.49]}>
        <boxGeometry args={[0.08, 0.32, 0.09]} />
        <meshStandardMaterial color="#bf9858" metalness={0.35} roughness={0.46} />
      </mesh>
      <mesh position={[-0.32, 0.85, 0.37]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshStandardMaterial color="#56d8d7" emissive="#168b8e" emissiveIntensity={0.7} />
      </mesh>
    </group>
  )
}

function CentralBeacon() {
  return (
    <group position={[0.05, 0.15, 0.72]}>
      <mesh receiveShadow position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.43, 0.5, 0.18, 20]} />
        <meshStandardMaterial color="#46514a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.32, 0.035, 6, 28]} />
        <meshStandardMaterial color="#d39a51" metalness={0.32} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.48, 0]} rotation={[0, Math.PI / 4, 0]}>
        <octahedronGeometry args={[0.19, 0]} />
        <meshStandardMaterial color="#ffc96e" emissive="#c86c35" emissiveIntensity={1.15} roughness={0.35} />
      </mesh>
      <pointLight position={[0, 0.55, 0]} intensity={13} distance={4.2} color="#f3ad60" />
    </group>
  )
}

function LocalBaseScene({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  return (
    <>
      <color attach="background" args={['#101820']} />
      <fog attach="fog" args={['#101820', 12, 24]} />
      <ambientLight intensity={0.72} color="#c7d8d5" />
      <directionalLight
        castShadow
        position={[-3, 7, 4]}
        intensity={2}
        color="#ffe0a3"
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
      />
      <pointLight position={[1.35, 1.65, -0.3]} intensity={18} distance={4.5} color="#53d8df" />

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.17, 0]}>
        <planeGeometry args={[18, 18]} />
        <meshStandardMaterial color="#111b20" roughness={1} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, -0.02, 0]}>
        <cylinderGeometry args={[3.25, 3.5, 0.3, 40]} />
        <meshStandardMaterial color="#243236" roughness={0.84} />
      </mesh>
      <mesh receiveShadow position={[0, 0.14, 0]}>
        <cylinderGeometry args={[3.08, 3.08, 0.04, 40]} />
        <meshStandardMaterial color="#344746" roughness={0.88} />
      </mesh>

      <mesh receiveShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
        <torusGeometry args={[2.83, 0.035, 6, 48]} />
        <meshStandardMaterial color="#56bdb4" emissive="#1c6969" emissiveIntensity={0.24} roughness={0.54} />
      </mesh>
      <mesh receiveShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
        <torusGeometry args={[2.68, 0.018, 5, 48]} />
        <meshStandardMaterial color="#d2a65d" metalness={0.28} roughness={0.5} />
      </mesh>

      <group>
        <mesh castShadow receiveShadow position={[0, 1.12, -2.52]}>
          <boxGeometry args={[5.25, 2.35, 0.2]} />
          <meshStandardMaterial color="#29383a" roughness={0.88} />
        </mesh>
        <mesh castShadow receiveShadow position={[-2.56, 0.89, -0.95]}>
          <boxGeometry args={[0.18, 1.9, 2.95]} />
          <meshStandardMaterial color="#243436" roughness={0.9} />
        </mesh>
        <mesh position={[0, 2.2, -2.38]}>
          <boxGeometry args={[4.8, 0.075, 0.15]} />
          <meshStandardMaterial color="#4b6260" roughness={0.72} />
        </mesh>
        <mesh position={[-1.4, 1.31, -2.39]}>
          <boxGeometry args={[1.3, 0.82, 0.1]} />
          <meshStandardMaterial color="#142327" metalness={0.18} roughness={0.7} />
        </mesh>
        <mesh position={[-1.77, 1.36, -2.32]}>
          <boxGeometry args={[0.08, 0.48, 0.035]} />
          <meshStandardMaterial color="#57d3d1" emissive="#177b7b" emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[-1.55, 1.2, -2.32]}>
          <boxGeometry args={[0.12, 0.055, 0.035]} />
          <meshStandardMaterial color="#edc56e" emissive="#8f662e" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[-1.22, 1.41, -2.32]}>
          <boxGeometry args={[0.36, 0.045, 0.035]} />
          <meshStandardMaterial color="#72978b" roughness={0.7} />
        </mesh>
        <mesh position={[-1.22, 1.27, -2.32]}>
          <boxGeometry args={[0.24, 0.045, 0.035]} />
          <meshStandardMaterial color="#72978b" roughness={0.7} />
        </mesh>
        <mesh receiveShadow castShadow position={[-1.4, 0.56, -2.05]}>
          <boxGeometry args={[1.55, 0.12, 0.58]} />
          <meshStandardMaterial color="#66553f" roughness={0.78} />
        </mesh>
        <mesh position={[-1.4, 0.63, -1.74]}>
          <boxGeometry args={[1.42, 0.025, 0.025]} />
          <meshStandardMaterial color="#d0a762" metalness={0.24} roughness={0.5} />
        </mesh>
        <mesh position={[2.15, 0.84, -2.37]}>
          <boxGeometry args={[0.5, 0.78, 0.12]} />
          <meshStandardMaterial color="#344747" roughness={0.84} />
        </mesh>
        <mesh position={[2.15, 1.08, -2.29]}>
          <boxGeometry args={[0.24, 0.06, 0.035]} />
          <meshStandardMaterial color="#edbd67" emissive="#a66b30" emissiveIntensity={0.38} />
        </mesh>
      </group>

      <mesh receiveShadow position={[-2.05, 0.42, 0.68]}>
        <cylinderGeometry args={[0.2, 0.25, 0.5, 12]} />
        <meshStandardMaterial color="#735c42" roughness={0.88} />
      </mesh>
      <mesh castShadow position={[-2.05, 0.86, 0.68]}>
        <coneGeometry args={[0.24, 0.68, 6]} />
        <meshStandardMaterial color="#5c8c70" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[-2.05, 1.12, 0.68]}>
        <coneGeometry args={[0.18, 0.48, 6]} />
        <meshStandardMaterial color="#7eaa75" roughness={0.88} />
      </mesh>

      <CentralBeacon />
      <Vault />
      <Character prefersReducedMotion={prefersReducedMotion} />
      <CameraRig prefersReducedMotion={prefersReducedMotion} />
    </>
  )
}

export default function ThreeWorldPrototype() {
  const prefersReducedMotion = usePrefersReducedMotion()

  return (
    <section className="three-world-prototype" data-testid="three-world-prototype" aria-label="Prototipo decorativo em 3D">
      <p className="three-world-description">
        Cena demonstrativa local, sem dados financeiros. Uma base compacta com personagem e cofre decorativos.
      </p>
      <div className="three-world-canvas" role="group" aria-label="Diorama decorativo com personagem, base e cofre">
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [5.7, 4.8, 8], fov: 38 }}
          shadows="percentage"
          gl={{ antialias: true, powerPreference: 'low-power' }}
          fallback={<p className="three-world-fallback" role="status" data-testid="three-world-fallback">Renderizacao 3D indisponivel neste navegador.</p>}
        >
          <LocalBaseScene prefersReducedMotion={prefersReducedMotion} />
        </Canvas>
      </div>
      <p className="three-world-motion-note" aria-live="polite">
        {prefersReducedMotion ? 'Movimento reduzido conforme a preferencia do dispositivo.' : 'Diorama experimental, sem interacao financeira.'}
      </p>
    </section>
  )
}