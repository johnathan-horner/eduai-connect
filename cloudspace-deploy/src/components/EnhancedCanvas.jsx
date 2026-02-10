import { Suspense, useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls, PresentationControls, ContactShadows } from '@react-three/drei'
import { ErrorBoundary } from 'react-error-boundary'

// HDR environments that actually work (Three.js built-ins)
const WORKING_HDR_ENVIRONMENTS = [
  'city',
  'apartment', 
  'studio',
  'dawn',
  'warehouse'
]

// Error boundary for 3D components
const ThreeErrorBoundary = ({ children, onError }) => (
  <ErrorBoundary
    fallback={<EmptyScene />}
    onError={onError}
    onReset={() => window.location.reload()}
  >
    {children}
  </ErrorBoundary>
)

// Empty scene for fallback
const EmptyScene = () => (
  <mesh visible={false}>
    <boxGeometry args={[0.1, 0.1, 0.1]} />
    <meshBasicMaterial transparent opacity={0} />
  </mesh>
)

// Enhanced Environment with multiple fallbacks
const SafeEnvironment = ({ performanceMode, onError, onSuccess }) => {
  const [envIndex, setEnvIndex] = useState(0)
  const [retryCount, setRetryCount] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const maxRetries = WORKING_HDR_ENVIRONMENTS.length

  const handleError = useCallback((error) => {
    console.warn(`Environment '${WORKING_HDR_ENVIRONMENTS[envIndex]}' failed:`, error)

    if (retryCount < maxRetries - 1) {
      const nextIndex = (envIndex + 1) % WORKING_HDR_ENVIRONMENTS.length
      setEnvIndex(nextIndex)
      setRetryCount(prev => prev + 1)
      console.log(`Switching to environment: ${WORKING_HDR_ENVIRONMENTS[nextIndex]}`)
    } else {
      console.error('All environment presets failed, using fallback')
      onError?.(error)
    }
  }, [envIndex, retryCount, maxRetries, onError])

  const handleSuccess = useCallback(() => {
    if (!loaded) {
      setLoaded(true)
      console.log(`Environment '${WORKING_HDR_ENVIRONMENTS[envIndex]}' loaded successfully`)
      onSuccess?.()
    }
  }, [loaded, envIndex, onSuccess])

  // Performance-based environment settings
  const environmentProps = useMemo(() => {
    const configs = {
      low: { 
        resolution: 256, 
        background: false,
        intensity: 0.8
      },
      medium: { 
        resolution: 512, 
        background: true,
        intensity: 1.0
      },
      high: { 
        resolution: 1024, 
        background: true,
        intensity: 1.2
      }
    }
    return configs[performanceMode] || configs.medium
  }, [performanceMode])

  try {
    return (
      <Environment
        preset={WORKING_HDR_ENVIRONMENTS[envIndex]}
        {...environmentProps}
        onLoad={handleSuccess}
        onError={handleError}
      />
    )
  } catch (error) {
    handleError(error)
    return null
  }
}

// Enhanced lighting setup with performance optimization
const SceneLighting = ({ performanceMode }) => {
  const lightIntensity = performanceMode === 'low' ? 0.6 : 1.0

  return (
    <>
      <ambientLight intensity={0.4 * lightIntensity} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={0.8 * lightIntensity}
        castShadow={performanceMode === 'high'}
        shadow-mapSize-width={performanceMode === 'high' ? 2048 : 1024}
        shadow-mapSize-height={performanceMode === 'high' ? 2048 : 1024}
      />
      <pointLight position={[-10, -10, -10]} intensity={0.2 * lightIntensity} />
      <hemisphereLight
        skyColor={'#ffffff'}
        groundColor={'#444444'}
        intensity={0.5 * lightIntensity}
      />
    </>
  )
}

// Main Enhanced Canvas component
const EnhancedCanvas = ({ 
  children, 
  performanceMode = 'medium', 
  className, 
  onLoad,
  onError,
  ...props 
}) => {
  const canvasRef = useRef()
  const [error, setError] = useState(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [contextLost, setContextLost] = useState(false)

  // Performance settings based on device capabilities
  const canvasSettings = useMemo(() => {
    const configs = {
      low: {
        antialias: false,
        powerPreference: 'low-power',
        stencil: false,
        depth: true,
        alpha: false,
        pixelRatio: Math.min(window.devicePixelRatio, 1)
      },
      medium: {
        antialias: true,
        powerPreference: 'default',
        stencil: true,
        depth: true,
        alpha: false,
        pixelRatio: Math.min(window.devicePixelRatio, 1.5)
      },
      high: {
        antialias: true,
        powerPreference: 'high-performance',
        stencil: true,
        depth: true,
        alpha: false,
        pixelRatio: Math.min(window.devicePixelRatio, 2)
      }
    }
    return configs[performanceMode] || configs.medium
  }, [performanceMode])

  // Enhanced error handling for WebGL context loss
  useEffect(() => {
    const canvas = canvasRef.current?.querySelector('canvas')

    if (canvas) {
      const handleContextLost = (event) => {
        event.preventDefault()
        setContextLost(true)
        console.warn('WebGL context lost, attempting to restore...')

        if (window.cloudspaceLoading) {
          window.cloudspaceLoading.showError('3D context lost, retrying...')
        }

        // Attempt to restore context after a delay
        setTimeout(() => {
          try {
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
            if (gl && gl.isContextLost()) {
              console.log('Attempting context restore...')
              // The context restoration is automatic in WebGL
            }
          } catch (e) {
            console.error('Context restore failed:', e)
            onError?.(e)
          }
        }, 2000)
      }

      const handleContextRestored = () => {
        console.log('WebGL context restored successfully')
        setContextLost(false)
        setError(null)
        
        if (window.cloudspaceLoading) {
          window.cloudspaceLoading.showError('3D context restored!')
        }
      }

      canvas.addEventListener('webglcontextlost', handleContextLost, false)
      canvas.addEventListener('webglcontextrestored', handleContextRestored, false)

      return () => {
        canvas.removeEventListener('webglcontextlost', handleContextLost)
        canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      }
    }
  }, [onError])

  const handleCanvasError = useCallback((error) => {
    console.error('Canvas Error:', error)
    setError(error)
    onError?.(error)

    if (window.cloudspaceLoading) {
      window.cloudspaceLoading.showFallback()
      window.cloudspaceLoading.showError('3D rendering failed. Using fallback design.')
    }
  }, [onError])

  const handleCanvasCreated = useCallback(({ gl, scene, camera }) => {
    try {
      // WebGL optimizations
      gl.setPixelRatio(canvasSettings.pixelRatio)
      
      // Performance optimizations
      if (performanceMode === 'low') {
        gl.shadowMap.enabled = false
        gl.antialias = false
      } else {
        gl.shadowMap.enabled = true
        gl.shadowMap.type = performanceMode === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
      }

      console.log('Canvas created successfully with performance mode:', performanceMode)
      setIsLoaded(true)
      onLoad?.()

      // Hide loading screen
      setTimeout(() => {
        if (window.cloudspaceLoading && !error && !contextLost) {
          window.cloudspaceLoading.hide()
        }
      }, 500)

    } catch (e) {
      console.error('Canvas creation failed:', e)
      handleCanvasError(e)
    }
  }, [canvasSettings.pixelRatio, performanceMode, onLoad, error, contextLost, handleCanvasError])

  const handleEnvironmentLoad = useCallback(() => {
    console.log('Environment loaded successfully')
  }, [])

  const handleEnvironmentError = useCallback((error) => {
    console.warn('Environment loading failed, but canvas will continue with basic lighting')
    // Don't fail the entire canvas, just continue without environment
  }, [])

  if (error && !contextLost) {
    return null // Let fallback background show
  }

  return (
    <Canvas
      ref={canvasRef}
      className={className}
      gl={canvasSettings}
      camera={{
        position: [0, 0, 6],
        fov: performanceMode === 'low' ? 55 : 45
      }}
      onCreated={handleCanvasCreated}
      onError={handleCanvasError}
      {...props}
    >
      <ThreeErrorBoundary onError={handleCanvasError}>
        <Suspense fallback={null}>
          <SafeEnvironment
            performanceMode={performanceMode}
            onError={handleEnvironmentError}
            onSuccess={handleEnvironmentLoad}
          />
        </Suspense>

        <SceneLighting performanceMode={performanceMode} />

        {/* Contact shadows only for medium/high performance */}
        {performanceMode !== 'low' && (
          <Suspense fallback={null}>
            <ContactShadows
              resolution={performanceMode === 'high' ? 1024 : 512}
              position={[0, -1.4, 0]}
              opacity={0.3}
              scale={8}
              blur={2}
              far={4}
            />
          </Suspense>
        )}

        {/* Children components */}
        <Suspense fallback={null}>
          {children}
        </Suspense>

        {/* Performance-appropriate controls */}
        {performanceMode === 'high' && (
          <PresentationControls
            global
            config={{ mass: 2, tension: 400 }}
            snap={{ mass: 4, tension: 1200 }}
            rotation={[0, 0.3, 0]}
            polar={[-Math.PI / 3, Math.PI / 3]}
            azimuth={[-1, 0.75]}
          />
        )}
      </ThreeErrorBoundary>
    </Canvas>
  )
}

export default EnhancedCanvas