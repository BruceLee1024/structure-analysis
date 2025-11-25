import React, { useState, useMemo, useEffect } from 'react';
import ControlPanel from './components/ControlPanel';
import StructureVisualizer from './components/BeamVisualizer'; 
import GeometryEditor from './components/GeometryEditor';
import { SolverParams, StructureType, AnalysisResult, Load } from './types';
import { solveStructure } from './utils/solver';
import { analyzeStructure } from './services/geminiService';
import { generateGeometry } from './utils/geometryGenerator';
import ReactMarkdown from 'react-markdown';

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

  // 4. AI Integration
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  const handleGeminiAnalysis = async () => {
    setIsAnalyzing(true);
    
    const aiParams = {
        type: params.structureType,
        maxMoment: results.elements.reduce((max, el) => Math.max(max, el.maxMoment), 0),
        maxShear: results.elements.reduce((max, el) => Math.max(max, el.maxShear), 0),
        maxDeflection: results.maxDeflection
    };
    
    const result = await analyzeStructure(aiParams, results);
    setAiAnalysis(result);
    setIsAnalyzing(false);
  };

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
        onAnalyze={handleGeminiAnalysis} 
        isAnalyzing={isAnalyzing}
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

        {aiAnalysis && (
            <div className="mt-4 bg-slate-900 rounded-xl border border-slate-700 p-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2 relative z-10">
                    <span className="text-xl">✨</span> AI 结构点评
                </h3>
                <div className="prose prose-invert prose-sm max-w-none relative z-10">
                    <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                </div>
            </div>
        )}
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