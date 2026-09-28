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
    const drift = prefersReducedMotion ? 0 : Math.sin(elapsedTime.current * 0.22) * 0.22
    const targetX = 5.2 + drift
    const targetZ = 7.4 - drift
    const smoothing = 1 - Math.exp(-delta * 1.4)

    camera.position.x += (targetX - camera.position.x) * smoothing
    camera.position.z += (targetZ - camera.position.z) * smoothing
    camera.lookAt(0, 0.65, 0)
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
      position={[-0.9, 0.18, 0.35]}
    >
      <mesh castShadow position={[0, 0.36, 0]}>
        <capsuleGeometry args={[0.19, 0.34, 4, 8]} />
        <meshStandardMaterial color="#416c70" roughness={0.76} />
      </mesh>
      <mesh castShadow position={[0, 0.79, 0]}>
        <sphereGeometry args={[0.2, 16, 12]} />
        <meshStandardMaterial color="#d9b89a" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[-0.13, 0.02, 0.04]}>
        <capsuleGeometry args={[0.07, 0.16, 3, 6]} />
        <meshStandardMaterial color="#24343a" roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0.13, 0.02, 0.04]}>
        <capsuleGeometry args={[0.07, 0.16, 3, 6]} />
        <meshStandardMaterial color="#24343a" roughness={0.85} />
      </mesh>
    </group>
  )
}

function LocalBaseScene({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  return (
    <>
      <color attach="background" args={['#101820']} />
      <ambientLight intensity={0.8} color="#c7d8d5" />
      <directionalLight
        castShadow
        position={[-3, 6, 4]}
        intensity={2.1}
        color="#ffe0a3"
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
      />
      <pointLight position={[1.5, 1.7, 0.2]} intensity={24} distance={5} color="#53d8df" />
      <pointLight position={[-1.5, 1.1, -1]} intensity={12} distance={4} color="#f2a65a" />

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.16, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#111b20" roughness={1} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, -0.02, 0]}>
        <cylinderGeometry args={[3.25, 3.5, 0.28, 48]} />
        <meshStandardMaterial color="#26363a" roughness={0.82} />
      </mesh>
      <mesh receiveShadow position={[0, 0.13, 0]}>
        <cylinderGeometry args={[2.95, 2.95, 0.035, 48]} />
        <meshStandardMaterial color="#344b4b" roughness={0.88} />
      </mesh>

      <group position={[1.15, 0.15, -0.15]}>
        <mesh castShadow receiveShadow position={[0, 0.13, 0]}>
          <cylinderGeometry args={[0.55, 0.64, 0.26, 24]} />
          <meshStandardMaterial color="#826443" roughness={0.65} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0.67, 0]}>
          <cylinderGeometry args={[0.43, 0.48, 0.82, 24]} />
          <meshStandardMaterial color="#526363" metalness={0.32} roughness={0.48} />
        </mesh>
        <mesh position={[0, 0.7, 0.437]}>
          <boxGeometry args={[0.24, 0.08, 0.035]} />
          <meshStandardMaterial color="#f2c76c" emissive="#bd8c36" emissiveIntensity={0.55} />
        </mesh>
        <mesh position={[0, 0.33, 0.45]}>
          <boxGeometry args={[0.12, 0.12, 0.04]} />
          <meshStandardMaterial color="#50d9d9" emissive="#147c86" emissiveIntensity={0.8} />
        </mesh>
      </group>

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
          camera={{ position: [5.2, 4.2, 7.4], fov: 36 }}
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