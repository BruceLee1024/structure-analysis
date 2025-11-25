import React, { useState, useMemo, useEffect } from 'react';
import ControlPanel from './components/ControlPanel';
import StructureVisualizer from './components/BeamVisualizer'; 
import GeometryEditor from './components/GeometryEditor';
import { SolverParams, StructureType, AnalysisResult, Load } from './types';
import { solveStructure } from './utils/solver';
import { generateGeometry } from './utils/geometryGenerator';

const App: React.FC = () => {
  // Initial Geometry Setup
  const initialGeom = generateGeometry(StructureType.PortalFrame, 10, 5, 2, 200, 50, 200, 2, 2, 2);
  
  const [params, setParams] = useState<SolverParams>({
    structureType: StructureType.PortalFrame,
    stiffnessType: 'Elastic',
    width: 10,
    height: 5,
    roofHeight: 2,
    numSpans: 3,
    numStories: 2,
    numBays: 2,
    elasticModulus: 200,
    crossSectionArea: 50,
    momentOfInertia: 200,
    nodes: initialGeom.nodes,
    elements: initialGeom.elements,
    loads: []
  });

  // 1. Effect: Regenerate geometry when parametric sliders change
  useEffect(() => {
      if (params.structureType === StructureType.Custom) return;
      
      const geom = generateGeometry(
          params.structureType, 
          params.width, 
          params.height, 
          params.roofHeight,
          params.elasticModulus,
          params.crossSectionArea,
          params.momentOfInertia,
          params.numSpans,
          params.numStories,
          params.numBays
      );
      
      setParams(prev => ({
          ...prev,
          nodes: geom.nodes,
          elements: geom.elements
      }));
  }, [
      params.structureType, 
      params.width, 
      params.height, 
      params.roofHeight, 
      params.numSpans,
      params.numStories,
      params.numBays,
      params.elasticModulus, 
      params.crossSectionArea, 
      params.momentOfInertia
  ]);

  // 2. Cleanup: Ensure loads attach to valid targets
  useEffect(() => {
      setParams(prev => {
           const validNodeIds = new Set(prev.nodes.map(n => n.id));
           const validElIds = new Set(prev.elements.map(e => e.id));
           
           const validLoads = prev.loads.filter(l => {
               if (l.nodeId !== undefined) return validNodeIds.has(l.nodeId);
               if (l.elementId !== undefined) return validElIds.has(l.elementId);
               return false;
           });

           if (validLoads.length !== prev.loads.length) {
               return { ...prev, loads: validLoads };
           }
           return prev;
      });
  }, [params.nodes, params.elements]);

  // 3. Analysis: Run the matrix solver
  const results: AnalysisResult = useMemo(() => {
      if (params.nodes.length < 2 || params.elements.length === 0) {
          return { elements: [], maxDeflection: 0, reactions: [] };
      }
      // Pass the stiffnessType (Elastic, AxiallyRigid, Rigid) to the solver
      return solveStructure(params.nodes, params.elements, params.loads, params.stiffnessType);
  }, [params.nodes, params.elements, params.loads, params.stiffnessType]);

  // AI功能已移除

  const handleAddLoad = (load: Load) => {
      setParams(prev => ({
          ...prev,
          loads: [...prev.loads, load]
      }));
  };

  const handleClearLoads = () => {
    setParams(prev => ({
        ...prev,
        loads: []
    }));
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-200 font-sans">
      {/* Left Sidebar: Global Controls */}
      <ControlPanel 
        params={params} 
        setParams={setParams}
        onClearLoads={handleClearLoads}
      />

      {/* Center: Viewport */}
      <main className="flex-1 flex flex-col h-full overflow-y-auto p-4 relative min-w-0 bg-slate-950">
        
        {/* Removed Header - Now in ControlPanel */}
        
        <div className="flex-1 min-h-0">
            <StructureVisualizer 
                params={params} 
                nodes={params.nodes} 
                elements={params.elements} 
                results={results} 
                loads={params.loads}
                onAddLoad={handleAddLoad}
            />
        </div>

      </main>

      {/* Right Sidebar: Geometry Editor */}
      <GeometryEditor 
        params={params}
        setParams={setParams}
      />
    </div>
  );
};

export default App;