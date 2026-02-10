import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Performance monitoring and error handling
if (typeof window !== 'undefined') {
  // Enhanced error handling
  window.addEventListener('error', (event) => {
    console.error('Global Error:', event.error)

    // Handle specific 3D/WebGL errors
    if (event.error && event.error.message) {
      const message = event.error.message.toLowerCase()

      if (message.includes('webgl') || 
          message.includes('three') || 
          message.includes('context') ||
          message.includes('potsdamer') ||
          message.includes('hdr')) {
        
        console.error('3D/WebGL Error detected:', event.error)

        if (window.cloudspaceLoading) {
          window.cloudspaceLoading.showFallback()
          window.cloudspaceLoading.showError('3D graphics failed to load')
        }
      }
    }
  })

  // Handle unhandled promise rejections (common with asset loading)
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled Promise Rejection:', event.reason)

    // Check if it's related to 3D assets
    if (event.reason && event.reason.toString().toLowerCase().includes('potsdamer')) {
      console.error('HDR environment loading failed')
      
      if (window.cloudspaceLoading) {
        window.cloudspaceLoading.showError('3D environment failed to load')
      }
      
      // Prevent the error from being logged to console
      event.preventDefault()
    }
  })

  // Device capability detection
  const detectDeviceCapabilities = () => {
    const capabilities = {
      webgl: false,
      webgl2: false,
      memory: navigator.deviceMemory || 'unknown',
      cores: navigator.hardwareConcurrency || 'unknown',
      connection: navigator.connection?.effectiveType || 'unknown',
      mobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
      pixelRatio: window.devicePixelRatio || 1
    }

    // Test WebGL support
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl')
      const gl2 = canvas.getContext('webgl2')
      
      capabilities.webgl = !!(gl && gl.drawingBufferWidth)
      capabilities.webgl2 = !!(gl2 && gl2.drawingBufferWidth)

      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
        if (debugInfo) {
          capabilities.gpu = {
            vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
            renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          }
        }
      }
    } catch (e) {
      console.warn('WebGL capability check failed:', e)
    }

    console.log('Device Capabilities:', capabilities)
    window.deviceCapabilities = capabilities
    return capabilities
  }

  // Initialize capabilities check
  const capabilities = detectDeviceCapabilities()

  // Performance monitoring (only in development)
  if (process.env.NODE_ENV === 'development') {
    // Web Vitals monitoring (dynamic import to avoid bundle bloat)
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      const vitalsCallback = (metric) => {
        console.log(`${metric.name}: ${metric.value}${metric.unit || ''}`)
        
        // Log performance warnings
        if (metric.name === 'LCP' && metric.value > 2500) {
          console.warn('⚠️ Large Contentful Paint is slow:', metric.value + 'ms')
        }
        if (metric.name === 'FID' && metric.value > 100) {
          console.warn('⚠️ First Input Delay is high:', metric.value + 'ms')
        }
      }

      getCLS(vitalsCallback)
      getFID(vitalsCallback)
      getFCP(vitalsCallback)
      getLCP(vitalsCallback)
      getTTFB(vitalsCallback)
    }).catch(err => {
      console.warn('Web Vitals not available:', err)
    })

    // 3D Performance observer
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name.includes('three') || 
                entry.name.includes('webgl') || 
                entry.name.includes('.glb') ||
                entry.name.includes('.hdr')) {
              console.log(`3D Performance: ${entry.name} - ${Math.round(entry.duration)}ms`)
            }
          }
        })

        observer.observe({ entryTypes: ['measure', 'navigation', 'resource'] })
      } catch (e) {
        console.warn('Performance Observer not supported:', e)
      }
    }
  }

  // Analytics tracking (placeholder - replace with your analytics)
  const trackPageLoad = () => {
    try {
      // Example: Google Analytics 4
      if (typeof gtag !== 'undefined') {
        gtag('event', 'page_view', {
          page_title: 'Johnathan CloudSpace - Home',
          page_location: window.location.href
        })
      }

      // Example: Custom analytics
      if (typeof analytics !== 'undefined') {
        analytics.page('Home', {
          title: 'Johnathan CloudSpace - AWS Solutions Architect',
          webgl_supported: capabilities.webgl,
          performance_mode: capabilities.mobile ? 'mobile' : 'desktop'
        })
      }
    } catch (e) {
      console.warn('Analytics tracking failed:', e)
    }
  }

  // Track page load after a short delay
  setTimeout(trackPageLoad, 1000)
}

// Enhanced error logging for production debugging
const originalConsoleError = console.error
console.error = (...args) => {
  // Log to external service in production (example)
  if (process.env.NODE_ENV === 'production') {
    try {
      // Example: Send to error tracking service
      // errorTrackingService.log({
      //   error: args[0],
      //   timestamp: new Date().toISOString(),
      //   userAgent: navigator.userAgent,
      //   url: window.location.href
      // })
    } catch (e) {
      // Silently fail if error tracking is down
    }
  }
  
  // Still log to console
  originalConsoleError.apply(console, args)
}

// Render app with enhanced error handling
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)