import React from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Annotation,
  ZoomableGroup
} from "react-simple-maps";

const Map = () => {
  return (
    <ComposableMap
      projection="geoAzimuthalEqualArea"
      projectionConfig={{
        rotate: [74.0, -40.7, 0],
        center: [0, 0],
        scale: 1600
      }}
      style={{width:"100%", height:"100%"}}
    >
      <ZoomableGroup>
        <Geographies
          geography="/features.json"
          fill="#262e85"
          stroke="#FFFFFF"
          strokeWidth={0.5}
        >
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography key={geo.rsmKey} geography={geo} />
            ))
          }
        </Geographies>
        <Annotation
          subject={[-74.0060, 40.7128]}
          dx={-90}
          dy={-30}
          connectorProps={{
            stroke: "white",
            strokeWidth: 2,
            strokeLinecap: "round"
          }}
        >
          <text x="-8" textAnchor="end" alignmentBaseline="middle" fill="white">
            {"NYC"}
          </text>
        </Annotation>
        <Annotation
          subject={[38.89767, -97.13029]}
          dx={-90}
          dy={-30}
          connectorProps={{
            stroke: "white",
            strokeWidth: 2,
            strokeLinecap: "round"
          }}
        >
          <text x="-8" textAnchor="end" alignmentBaseline="middle" fill="white">
            {"America"}
          </text>
        </Annotation>
      </ZoomableGroup>
    </ComposableMap>
  );
};

export default Map;
