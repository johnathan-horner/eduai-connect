import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  
  build: {
    target: 'esnext',
    sourcemap: false,
    
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate Three.js into its own chunk
          'three-vendor': ['three'],
          'three-react': ['@react-three/fiber', '@react-three/drei'],
          'react-vendor': ['react', 'react-dom'],
          'utils': ['styled-components', 'react-error-boundary']
        },
        
        // Optimize chunk naming for better caching
        chunkFileNames: (chunkInfo) => {
          if (chunkInfo.name.includes('three')) {
            return 'assets/3d/[name]-[hash].js'
          }
          return 'assets/[name]-[hash].js'
        },
        
        // Optimize asset naming
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.')
          const ext = info[info.length - 1]
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/images/[name]-[hash][extname]`
          }
          if (/woff2?|eot|ttf|otf/i.test(ext)) {
            return `assets/fonts/[name]-[hash][extname]`
          }
          return `assets/[name]-[hash][extname]`
        }
      }
    },

    // Optimization options
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info'],
        passes: 2
      },
      mangle: {
        safari10: true
      }
    },

    // Chunk size warnings
    chunkSizeWarningLimit: 800,
    
    // Asset optimization
    assetsInlineLimit: 4096, // 4KB limit for inlining
  },

  server: {
    host: true,
    port: 5173,
    hmr: {
      overlay: false // Disable error overlay in development
    }
  },

  preview: {
    host: true,
    port: 4173,
  },

  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      'styled-components',
      'react-error-boundary'
    ],
    exclude: [
      // Exclude unused Three.js modules
      'three/examples/jsm/loaders/FBXLoader',
      'three/examples/jsm/loaders/OBJLoader'
    ]
  },

  define: {
    // Environment variables
    __DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
    __THREE_DEVTOOLS__: JSON.stringify(process.env.NODE_ENV === 'development')
  },

  // CSS preprocessing
  css: {
    devSourcemap: false,
    preprocessorOptions: {
      scss: {
        additionalData: `$injectedColor: orange;`
      }
    }
  }
})