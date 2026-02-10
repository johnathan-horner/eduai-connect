import React, { Suspense, useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import Navbar from "./Navbar";
import EnhancedCanvas from "./EnhancedCanvas";
import { OrbitControls, Sphere, MeshDistortMaterial } from "@react-three/drei";

const Section = styled.div`
  height: 100vh;
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  position: relative;

  @media (max-width: 768px) {
    scroll-snap-align: none;
    min-height: 100vh;
  }
`;

const Container = styled.div`
  height: 100%;
  scroll-snap-align: center;
  width: 1400px;
  display: flex;
  justify-content: space-between;

  @media (max-width: 1400px) {
    width: 100%;
    padding: 0 20px;
  }

  @media (max-width: 768px) {
    width: 100%;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    padding: 80px 20px 20px;
  }
`;

const Left = styled.div`
  flex: 2;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 20px;

  @media (max-width: 768px) {
    flex: none;
    align-items: center;
    text-align: center;
    order: 2;
    gap: 15px;
  }
`;

const Title = styled.h1`
  font-size: 74px;
  color: white;
  margin: 0;
  font-weight: 700;
  line-height: 1.1;

  @media (max-width: 1200px) {
    font-size: 60px;
  }

  @media (max-width: 768px) {
    font-size: 36px;
  }

  @media (max-width: 480px) {
    font-size: 28px;
  }
`;

const WhatWeDo = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;

  @media (max-width: 768px) {
    justify-content: center;
  }
`;

const Line = styled.img`
  height: 5px;
  width: 80px;

  @media (max-width: 768px) {
    width: 60px;
    height: 3px;
  }
`;

const Subtitle = styled.h2`
  color: #da4ea2;
  font-size: 24px;
  margin: 0;
  font-weight: 500;

  @media (max-width: 768px) {
    font-size: 20px;
  }

  @media (max-width: 480px) {
    font-size: 18px;
  }
`;

const Desc = styled.p`
  font-size: 20px;
  color: lightgray;
  line-height: 1.5;
  margin: 0;

  @media (max-width: 768px) {
    font-size: 16px;
    max-width: 400px;
  }

  @media (max-width: 480px) {
    font-size: 14px;
  }
`;

const Button = styled.button`
  background-color: #da4ea2;
  color: white;
  font-weight: 500;
  width: 120px;
  padding: 15px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.3s ease;
  min-height: 44px; /* Touch target for mobile */

  &:hover {
    background-color: #c7449a;
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }

  @media (max-width: 768px) {
    width: 140px;
    padding: 16px;
  }
`;

const Right = styled.div`
  flex: 3;
  position: relative;
  height: 100%;

  @media (max-width: 768px) {
    flex: none;
    height: 50vh;
    width: 100%;
    order: 1;
  }

  @media (max-width: 480px) {
    height: 40vh;
  }
`;

const Img = styled.img`
  width: 800px;
  height: 600px;
  object-fit: contain;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  margin: auto;
  animation: animate 2s infinite ease alternate;

  @media (max-width: 1200px) {
    width: 600px;
    height: 450px;
  }

  @media (max-width: 768px) {
    width: 300px;
    height: 225px;
  }

  @media (max-width: 480px) {
    width: 250px;
    height: 188px;
  }

  @keyframes animate {
    to {
      transform: translateY(20px);
    }
  }
`;

const CanvasContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;

  canvas {
    width: 100% !important;
    height: 100% !important;
  }

  @media (max-width: 768px) {
    /* Simplify 3D on mobile if needed */
    opacity: ${props => props.showSimplified ? 0.8 : 1};
  }
`;

const ErrorMessage = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  text-align: center;
  background: rgba(0, 0, 0, 0.7);
  padding: 20px;
  border-radius: 10px;
  display: ${props => props.show ? 'block' : 'none'};
`;

const Hero = ({ performanceMode = 'medium' }) => {
  const [isMobile, setIsMobile] = useState(false)
  const [canvasError, setCanvasError] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768
      setIsMobile(mobile)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)

    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleLearnMore = useCallback(() => {
    try {
      window.open('https://Techwayurself.com', '_blank', 'noopener,noreferrer')
    } catch (error) {
      console.error('Failed to open link:', error)
      // Fallback: try direct navigation
      window.location.href = 'https://Techwayurself.com'
    }
  }, [])

  const handleCanvasLoad = useCallback(() => {
    setIsLoaded(true)
    setCanvasError(false)
  }, [])

  const handleCanvasError = useCallback((error) => {
    console.error('Hero Canvas Error:', error)
    setCanvasError(true)
    setIsLoaded(false)
  }, [])

  // Enhanced Sphere component with error handling
  const EnhancedSphere = () => {
    try {
      return (
        <Sphere args={[1, 100, 200]} scale={isMobile ? 1.8 : 2.4}>
          <MeshDistortMaterial
            color="#262e85"
            attach="material"
            distort={performanceMode === 'low' ? 0.3 : 0.5}
            speed={performanceMode === 'low' ? 1 : 2}
          />
        </Sphere>
      )
    } catch (error) {
      console.error('Sphere creation failed:', error)
      return null
    }
  }

  return (
    <Section>
      <Navbar />
      <Container>
        <Left>
          <Title>Think. Create. Solve.</Title>
          <WhatWeDo>
            <Line 
              src="./img/line.png" 
              alt="Decorative line"
              onError={(e) => {
                console.warn('Line image failed to load')
                e.target.style.display = 'none'
              }}
            />
            <Subtitle>Embrace the Cloud.</Subtitle>
          </WhatWeDo>
          <Desc>
            Skyrocket your business to the clouds with AWS Architecture-based Solutions.
          </Desc>
          <Button onClick={handleLearnMore} aria-label="Learn more about AWS solutions">
            Learn More
          </Button>
        </Left>

        <Right>
          <CanvasContainer showSimplified={isMobile && performanceMode === 'low'}>
            {!canvasError ? (
              <EnhancedCanvas
                performanceMode={isMobile ? 'low' : performanceMode}
                onLoad={handleCanvasLoad}
                onError={handleCanvasError}
                style={{ background: 'transparent' }}
              >
                <Suspense fallback={null}>
                  {performanceMode !== 'low' && (
                    <OrbitControls 
                      enableZoom={false} 
                      enablePan={false}
                      autoRotate={performanceMode === 'high'}
                      autoRotateSpeed={0.5}
                    />
                  )}

                  <EnhancedSphere />
                </Suspense>
              </EnhancedCanvas>
            ) : (
              <ErrorMessage show={canvasError}>
                <h3>3D Scene Error</h3>
                <p>Displaying fallback design</p>
              </ErrorMessage>
            )}
          </CanvasContainer>

          <Img 
            src="./img/moon.png" 
            alt="Johnathan CloudSpace Logo"
            onError={(e) => {
              console.warn('Moon image failed to load')
              e.target.alt = 'Logo image failed to load'
              e.target.style.opacity = '0.5'
            }}
            onLoad={() => console.log('Moon image loaded successfully')}
          />
        </Right>
      </Container>
    </Section>
  );
};

export default Hero;