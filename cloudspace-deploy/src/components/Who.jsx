import React, { Suspense } from "react";
import styled from "styled-components";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Cube from "./Cube";

const Section = styled.div`
  height: 100vh;
  scroll-snap-align: center;
  display: flex;
  justify-content: center;
`;

const Container = styled.div`
  height: 100vh;
  scroll-snap-align: center;
  width: 1400px;
  display: flex;
  justify-content: space-between;
`;

const Left = styled.div`
  flex: 1;

  @media only screen and (max-width: 768px) {
    display: none;
  }
`;

const Title = styled.h1`
  font-size: 74px;

  @media only screen and (max-width: 768px) {
    font-size: 60px;
  }
`;

const Right = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 20px;

  @media only screen and (max-width: 768px) {
    align-items: center;
    text-align: center;
  }
`;

const WhatWeDo = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const Line = styled.img`
  height: 5px;
`;

const Subtitle = styled.h2`
  color: #262E85;
`;

const Desc = styled.p`
  font-size: 24px;
  color: lightgray;
`;

const ProfileImage = styled.img`
  width: 150px;
  height: 150px;
  border-radius: 50%;
  object-fit: cover;
  border: 4px solid #262e85;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  margin-bottom: 20px;

  @media only screen and (max-width: 768px) {
    width: 120px;
    height: 120px;
    margin-bottom: 15px;
  }
`;

const Button = styled.a`
  background-color: #262e85;
  color: white;
  font-weight: 500;
  width: 120px;
  padding: 10px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  text-decoration: none;
  text-align: center;
`;

const Who = () => {
  return (
    <Section>
      <Container>
        <Left>
          <Canvas camera={{ position: [5, 5, 5], fov: 25 }}>
            <Suspense fallback={null}>
              <ambientLight intensity={0.5} />
              <directionalLight position={[3, 2, 1]} />
              <Cube />
              <OrbitControls enableZoom={false} autoRotate />
            </Suspense>
          </Canvas>
        </Left>
        <Right>
          <ProfileImage
            src="./img/profile.jpg"
            alt="Johnathan Horner - Solutions Architect"
            onError={(e) => {
              console.warn('Profile image failed to load');
              e.target.style.display = 'none';
            }}
          />
          <Title>Think outside the box. </Title>
          <WhatWeDo>
            <Line src="./img/line.png" />
            <Subtitle style={{ color: "#262e85" }}>Who am I ?</Subtitle>
          </WhatWeDo>
          <Desc>
            An IT professional and Certified Solutions Architect, using AWS cloud-based technologies to improve business objectives, with a keen focus on end user values.
          </Desc>
          <Button href="https://www.techwayurself.com/blog">See my work</Button>
        </Right>
      </Container>
    </Section>
  );
};

export default Who;
