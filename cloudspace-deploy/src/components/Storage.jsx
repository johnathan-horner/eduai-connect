import React, { Suspense } from "react";
import { OrbitControls, Stage } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Wd_green_1tb_hard_disk_hdd from "./Wd_green_1tb_hard_disk_hdd";
import styled from "styled-components";

const Desc = styled.div`
  width: 200px;
  height: 85px;
  padding: 25px;
  background-color: white;
  border-radius: 15px;
  position: absolute;
  bottom: 200px;
  right: 100px;

  @media only screen and (max-width: 768px) {
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    margin: auto;
  }
`;

const Storage = () => {
  return (
    <>
      <Canvas>
        <Suspense fallback={null}>
          <Stage environment="city" intensity={0.6}>
          <Wd_green_1tb_hard_disk_hdd scale={[0.5, 0.5, 0.5]} />
          </Stage>
          <OrbitControls enableZoom={false} autoRotate={false} />
        </Suspense>
      </Canvas>
      <Desc>
      Securely store, retrieve, and scale your business data with ease using AWS S3, the industry-
      leading object storage service trusted by millions of customers worldwide.
      </Desc>
    </>
  );
};

export default Storage;
