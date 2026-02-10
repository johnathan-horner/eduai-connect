import React, { Suspense } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Atom from "./Atom";
import styled from "styled-components";

const Desc = styled.div`
  width: 235px;
  height: 80px;
  padding: 25px;
  background-color: white;
  border-radius: 15px;
  position: absolute;
  top: 200px;
  right: 100px;

  @media only screen and (max-width: 768px) {
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    margin: auto;
  }
`;

const Development = () => {
  return (
    <>
      <Canvas camera={{ position: [0, 0, 10] }}>
        <Suspense fallback={null}>
          <Atom/>
          <OrbitControls enableZoom={false} autoRotate />
        </Suspense>
      </Canvas>
      <Desc>
       With development I strive for a high level of aesthetic and functional quality.
       Using AWS Amply to create high-quality front-end services,
       Along with AWS Lambda to create scalable and cost-effective backend services.
      </Desc>
    </>
  );
};

export default Development;
