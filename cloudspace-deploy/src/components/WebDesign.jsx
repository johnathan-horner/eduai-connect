import { OrbitControls, Stage } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import React from "react";
import Mac from './Mac';
import styled from "styled-components";

const Desc = styled.div`
  width: 200px;
  height: 95px;
  padding: 25px;
  background-color: white;
  border-radius: 15px;
  position: absolute;
  top: 100px;
  right: 100px;

  @media only screen and (max-width: 768px) {
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    margin: auto;
  }
`;

const WebDesign = () => {
  return ( 
    <>
      <Canvas>
        <Stage environment="city" intensity={0.6}> 
          <Mac scale={[0.5, 0.5, 0.5]} />
        </Stage>
        <OrbitControls enableZoom={false}/>
      </Canvas>
      <Desc>
        Experience seamless scalability with AWS, where you can effortlessly build and deploy web applications 
        using an array of services such as AWS Elastic Beanstalk, AWS Lambda, and Amazon EC2.
      </Desc>
    </>
  )
}

export default WebDesign;
