import { useRef, useState, useEffect, useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Text, RenderTexture, PerspectiveCamera, Float } from '@react-three/drei'
import { TextureLoader } from 'three'
import * as THREE from 'three'

const Cube = ({ position = [0, 0, 0], performanceMode = 'medium' }) => {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  const [clicked, setClicked] = useState(false)
  const [error, setError] = useState(null)
  const [logoTexture, setLogoTexture] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  const maxRetries = 3

  // Load logo texture with error handling and retries
  useEffect(() => {
    const loadTexture = (attempt = 1) => {
      const loader = new TextureLoader()

      loader.load(
        '/img/Techwlogo.jpg',
        (texture) => {
          // Success callback
          console.log('Logo texture loaded successfully')
          setLogoTexture(texture)
          setError(null)
        },
        (progress) => {
          // Progress callback
          console.log('Texture loading progress:', (progress.loaded / progress.total * 100) + '%')
        },
        (err) => {
          // Error callback
          console.warn(`Texture loading failed (attempt ${attempt}):`, err)
          
          if (attempt < maxRetries) {
            setTimeout(() => {
              setRetryCount(attempt)
              loadTexture(attempt + 1)
            }, 1000 * attempt) // Progressive delay
          } else {
            console.error('All texture loading attempts failed')
            setError('Failed to load logo texture')
            
            if (window.cloudspaceLoading) {
              window.cloudspaceLoading.showError('Logo texture failed to load')
            }
          }
        }
      )
    }

    loadTexture()
  }, [maxRetries])

  // Optimized animation with error handling
  useFrame((state) => {
    if (meshRef.current && !error) {
      try {
        // Smooth rotation animation
        const time = state.clock.elapsedTime
        
        if (performanceMode !== 'low') {
          meshRef.current.rotation.x = Math.sin(time * 0.3) * 0.2
          meshRef.current.rotation.y += 0.005
        } else {
          // Simplified animation for low performance mode
          meshRef.current.rotation.y += 0.002
        }

        // Hover effect
        const targetScale = hovered ? 1.1 : (clicked ? 1.05 : 1)
        meshRef.current.scale.lerp({ x: targetScale, y: targetScale, z: targetScale }, 0.1)

      } catch (err) {
        console.warn('Animation error:', err)
        setError('Animation failed')
      }
    }
  })

  // Handle click with error handling
  const handleClick = useCallback(() => {
    setClicked(true)
    
    try {
      // Add click feedback
      if (meshRef.current) {
        meshRef.current.scale.setScalar(1.2)
      }

      // Open link
      window.open('https://Techwayurself.com', '_blank', 'noopener,noreferrer')
      
      setTimeout(() => setClicked(false), 300)
    } catch (err) {
      console.error('Click handler failed:', err)
      if (window.cloudspaceLoading) {
        window.cloudspaceLoading.showError('Link failed to open')
      }
    }
  }, [])

  // Optimized materials with performance modes
  const materials = useMemo(() => {
    const baseProps = {
      roughness: performanceMode === 'low' ? 0.5 : 0.1,
      metalness: performanceMode === 'low' ? 0.3 : 0.9,
    }

    if (error || !logoTexture) {
      return {
        fallback: new THREE.MeshStandardMaterial({
          color: '#667eea',
          ...baseProps
        })
      }
    }

    return {
      main: new THREE.MeshStandardMaterial({
        ...baseProps,
        envMapIntensity: performanceMode === 'high' ? 1.5 : 1
      })
    }
  }, [error, logoTexture, performanceMode])

  // Error boundary fallback cube
  if (error) {
    return (
      <Float
        speed={performanceMode === 'low' ? 1 : 2}
        rotationIntensity={0.3}
        floatIntensity={0.3}
        position={position}
      >
        <mesh
          ref={meshRef}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
          onClick={handleClick}
          material={materials.fallback}
        >
          <boxGeometry args={[2, 2, 2]} />
        </mesh>
      </Float>
    )
  }

  // Main cube with enhanced features
  return (
    <Float
      speed={performanceMode === 'low' ? 1 : 2}
      rotationIntensity={performanceMode === 'low' ? 0.3 : 0.6}
      floatIntensity={performanceMode === 'low' ? 0.3 : 0.6}
      position={position}
    >
      <mesh
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={handleClick}
        material={materials.main}
      >
        <boxGeometry args={[2.5, 2.5, 2.5]} />

        {logoTexture && (
          <meshStandardMaterial>
            <RenderTexture attach="map" anisotropy={performanceMode === 'high' ? 16 : 8}>
              <PerspectiveCamera
                makeDefault
                manual
                aspect={1}
                position={[0, 0, 5]}
              />

              <color attach="background" args={['white']} />

              {/* Logo texture */}
              <mesh>
                <planeGeometry args={[3, 2]} />
                <meshBasicMaterial 
                  map={logoTexture}
                  transparent={true}
                />
              </mesh>

              {/* Text overlay - only on higher performance modes */}
              {performanceMode !== 'low' && (
                <Text
                  position={[0, -1.2, 0]}
                  fontSize={0.25}
                  color="#333"
                  anchorX="center"
                  anchorY="middle"
                  maxWidth={3}
                  lineHeight={1}
                >
                  TechWayUrself
                </Text>
              )}
            </RenderTexture>
          </meshStandardMaterial>
        )}
      </mesh>
    </Float>
  )
}

export default Cube