import React, { Suspense } from "react";
import { OrbitControls, Stage } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Statistic_charts_with_arrow from "./Statistic_charts_with_arrow";
import styled from "styled-components";

const Desc = styled.div`
  width: 235px;
  height: 90px;
  padding: 35px;
  background-color: white;
  border-radius: 15px;
  position: absolute;
  top: 0px;
  right: 100px;

  @media only screen and (max-width: 768px) {
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    margin: auto;
  }
`;

const Analytics  = () => {
  return (
    <>
      <Canvas camera={{ position: [0, 0, 10] }}>
        <Stage environment="city" intensity={0.6}>
          <Suspense fallback={null}>
            <Statistic_charts_with_arrow scale={[0.5, 0.5, 0.5]} />
            <OrbitControls enableZoom={false} autoRotate />
          </Suspense>
        </Stage>
      </Canvas>
      <Desc>
      Use monitoring and cost management services such as AWS CloudWatch and AWS Cost Explorer to monitor and track my AWS resources and costs.
       This helps me to create high-quality products that are successful in the market.
      </Desc>
    </>
  );
};

export default Analytics;
