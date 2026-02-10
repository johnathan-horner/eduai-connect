import { Suspense, lazy, useEffect, useState, useCallback } from 'react'
import styled from 'styled-components'
import { ErrorBoundary } from 'react-error-boundary'

// Lazy load components for better performance
const Hero = lazy(() => import('./components/Hero'))
const Who = lazy(() => import('./components/Who'))
const Works = lazy(() => import('./components/Works'))
const Contact = lazy(() => import('./components/Contact'))

const Container = styled.div`
  height: 100vh;
  scroll-snap-type: y mandatory;
  scroll-behavior: smooth;
  overflow-y: auto;
  scrollbar-width: none;
  color: white;
  background: url("./img/bg.jpg");
  
  &::-webkit-scrollbar {
    display: none;
  }

  /* Mobile optimizations */
  @media (max-width: 768px) {
    scroll-snap-type: none;
    overflow-x: hidden;
  }
`

const LoadingFallback = styled.div`
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 18px;
  text-align: center;

  @media (max-width: 768px) {
    font-size: 16px;
    padding: 20px;
  }
`

const ErrorFallback = ({ error, resetErrorBoundary }) => (
  <LoadingFallback>
    <div>
      <h1>Johnathan CloudSpace</h1>
      <h2 style={{color: '#da4ea2', margin: '20px 0'}}>Something went wrong with the 3D experience</h2>
      <p style={{marginBottom: '20px', opacity: 0.9}}>{error.message}</p>
      <button
        onClick={resetErrorBoundary}
        style={{
          background: 'white',
          color: '#667eea',
          border: 'none',
          padding: '15px 25px',
          borderRadius: '5px',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: '500',
          minHeight: '44px',
          transition: 'all 0.3s ease'
        }}
        onMouseOver={(e) => e.target.style.background = '#f0f0f0'}
        onMouseOut={(e) => e.target.style.background = 'white'}
      >
        Try Again
      </button>
    </div>
  </LoadingFallback>
)

function App() {
  const [webglSupported, setWebglSupported] = useState(true)
  const [performanceMode, setPerformanceMode] = useState('high')
  const [isLoaded, setIsLoaded] = useState(false)

  // Check WebGL support and device performance
  useEffect(() => {
    // Check WebGL support
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (!gl || !gl.drawingBufferWidth) {
        setWebglSupported(false)
        if (window.cloudspaceLoading) {
          window.cloudspaceLoading.showFallback()
          window.cloudspaceLoading.showError('WebGL not supported in your browser')
        }
        return
      }
    } catch (e) {
      console.warn('WebGL check failed:', e)
      setWebglSupported(false)
      if (window.cloudspaceLoading) {
        window.cloudspaceLoading.showFallback()
      }
      return
    }

    // Detect performance capabilities
    const userAgent = navigator.userAgent.toLowerCase()
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent)
    const hasLimitedRAM = navigator.deviceMemory && navigator.deviceMemory < 4
    const isSlowConnection = navigator.connection && navigator.connection.effectiveType === 'slow-2g'

    if (isMobile || hasLimitedRAM || isSlowConnection) {
      setPerformanceMode('low')
    } else if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) {
      setPerformanceMode('medium')
    }

    console.log('Performance mode set to:', performanceMode)

    // Hide loading screen after components mount
    const hideLoadingTimer = setTimeout(() => {
      if (window.cloudspaceLoading && isLoaded) {
        window.cloudspaceLoading.hide()
      }
    }, 1000)

    return () => clearTimeout(hideLoadingTimer)
  }, [isLoaded, performanceMode])

  const handleError = useCallback((error, errorInfo) => {
    console.error('App Error:', error, errorInfo)

    // Show fallback background
    if (window.cloudspaceLoading) {
      window.cloudspaceLoading.showFallback()
      window.cloudspaceLoading.showError('3D scene failed to load. Displaying fallback version.')
    }
  }, [])

  const resetError = useCallback(() => {
    // Clear error state and retry
    setIsLoaded(false)
    window.location.reload()
  }, [])

  const handleComponentLoad = useCallback(() => {
    setIsLoaded(true)
  }, [])

  if (!webglSupported) {
    return (
      <Container>
        <LoadingFallback>
          <div>
            <h1>Johnathan CloudSpace</h1>
            <h2 style={{color: '#da4ea2', margin: '20px 0'}}>AWS Solutions Architect Professional</h2>
            <p style={{marginBottom: '20px'}}>WebGL is not supported in your browser.</p>
            <p style={{opacity: 0.9}}>Please use a modern browser for the full 3D experience.</p>
            <button
              onClick={() => window.open('https://resume.johnathancloudspace.com', '_blank')}
              style={{
                background: '#da4ea2',
                color: 'white',
                border: 'none',
                padding: '15px 25px',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '16px',
                marginTop: '20px',
                minHeight: '44px'
              }}
            >
              View Resume Instead
            </button>
          </div>
        </LoadingFallback>
      </Container>
    )
  }

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={handleError}
      onReset={resetError}
    >
      <Container>
        <Suspense fallback={<LoadingFallback>Loading Hero Section...</LoadingFallback>}>
          <Hero 
            performanceMode={performanceMode} 
            onLoad={handleComponentLoad}
          />
        </Suspense>

        <Suspense fallback={<LoadingFallback>Loading About Section...</LoadingFallback>}>
          <Who 
            performanceMode={performanceMode}
            onLoad={handleComponentLoad}
          />
        </Suspense>

        <Suspense fallback={<LoadingFallback>Loading Portfolio...</LoadingFallback>}>
          <Works 
            performanceMode={performanceMode}
            onLoad={handleComponentLoad}
          />
        </Suspense>

        <Suspense fallback={<LoadingFallback>Loading Contact...</LoadingFallback>}>
          <Contact 
            performanceMode={performanceMode}
            onLoad={handleComponentLoad}
          />
        </Suspense>
      </Container>
    </ErrorBoundary>
  )
}

export default App