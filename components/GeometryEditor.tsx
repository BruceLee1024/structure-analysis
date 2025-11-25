

import React from 'react';
import { SolverParams, StructureType, Node, Element } from '../types';
import { autoConnectNodes } from '../utils/geometryGenerator';

interface GeometryEditorProps {
  params: SolverParams;
  setParams: React.Dispatch<React.SetStateAction<SolverParams>>;
}

const GeometryEditor: React.FC<GeometryEditorProps> = ({ params, setParams }) => {

  const handleChange = (key: keyof SolverParams, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  // Geometry Editing Handlers
  const switchToCustom = () => {
      if (params.structureType !== StructureType.Custom) {
          handleChange('structureType', StructureType.Custom);
      }
  };

  const handleAutoConnect = () => {
      switchToCustom();
      const res = autoConnectNodes(params.nodes, params.elements, params.loads);
      setParams(prev => ({
          ...prev,
          nodes: res.nodes,
          elements: res.elements,
          loads: res.loads
      }));
  };

  const updateNode = (id: number, field: keyof Node, value: any) => {
      switchToCustom();
      setParams(prev => ({
          ...prev,
          nodes: prev.nodes.map(n => {
              if (n.id !== id) return n;
              return { ...n, [field]: value };
          })
      }));
  };

  const getNodeSupportType = (r: [boolean, boolean, boolean]) => {
      if (r[0] && r[1] && r[2]) return 'Fixed';
      if (r[0] && r[1] && !r[2]) return 'Pinned';
      if (!r[0] && r[1] && !r[2]) return 'RollerY';
      if (r[0] && !r[1] && !r[2]) return 'RollerX';
      if (!r[0] && !r[1] && !r[2]) return 'Free';
      return 'Custom';
  };

  const setNodeSupport = (id: number, type: string) => {
      switchToCustom();
      let r: [boolean, boolean, boolean] = [false, false, false];
      switch (type) {
          case 'Fixed': r = [true, true, true]; break;
          case 'Pinned': r = [true, true, false]; break;
          case 'RollerY': r = [false, true, false]; break;
          case 'RollerX': r = [true, false, false]; break;
          case 'Free': r = [false, false, false]; break;
          default: return; // Keep as is if custom or unknown
      }
      setParams(prev => ({
          ...prev,
          nodes: prev.nodes.map(n => n.id === id ? { ...n, restraints: r } : n)
      }));
  };

  const addNode = () => {
      switchToCustom();
      setParams(prev => {
          const maxId = prev.nodes.reduce((m, n) => Math.max(m, n.id), 0);
          return {
              ...prev,
              nodes: [...prev.nodes, { id: maxId + 1, x: 0, y: 0, restraints: [false, false, false] }]
          };
      });
  };

  const removeNode = (id: number) => {
      switchToCustom();
      setParams(prev => ({
          ...prev,
          nodes: prev.nodes.filter(n => n.id !== id),
          elements: prev.elements.filter(e => e.startNode !== id && e.endNode !== id), // Remove connected elements
          loads: prev.loads.filter(l => l.nodeId !== id && 
             // Also remove loads on elements that are being removed
             (!l.elementId || !prev.elements.some(e => e.id === l.elementId && (e.startNode === id || e.endNode === id)))
          )
      }));
  };

  const updateElement = (id: number, field: keyof Element, value: any) => {
      switchToCustom();
      setParams(prev => ({
          ...prev,
          elements: prev.elements.map(e => e.id === id ? { ...e, [field]: value } : e)
      }));
  };

  const addElement = () => {
      if (params.nodes.length < 2) return;
      switchToCustom();
      setParams(prev => {
          const maxId = prev.elements.reduce((m, e) => Math.max(m, e.id), 0);
          // Try to find two valid nodes to connect
          const n1 = prev.nodes[0].id;
          const n2 = prev.nodes[1] ? prev.nodes[1].id : prev.nodes[0].id;
          
          return {
              ...prev,
              elements: [...prev.elements, { 
                  id: maxId + 1, 
                  startNode: n1, 
                  endNode: n2, 
                  E: prev.elasticModulus, 
                  A: prev.crossSectionArea, 
                  I: prev.momentOfInertia,
                  releaseStart: false,
                  releaseEnd: false
                }]
          };
      });
  };

  const removeElement = (id: number) => {
      switchToCustom();
      setParams(prev => ({
          ...prev,
          elements: prev.elements.filter(e => e.id !== id),
          loads: prev.loads.filter(l => l.elementId !== id)
      }));
  };

  return (
    <div className="w-80 bg-slate-900 p-6 flex flex-col gap-6 overflow-y-auto border-l border-slate-800 h-full scrollbar-thin scrollbar-thumb-slate-700 flex-shrink-0">
        <div>
            <h2 className="text-sm font-bold text-violet-400 uppercase tracking-wider mb-1">几何建模</h2>
            <p className="text-xs text-slate-400">节点与单元编辑器</p>
        </div>

        {/* Nodes List */}
        <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex justify-between items-center mb-2">
            <h4 className="text-xs text-slate-300 font-semibold">节点 (Nodes)</h4>
            <button onClick={addNode} className="text-[10px] bg-violet-600 px-2 py-1 rounded hover:bg-violet-500 text-white transition-colors">+ 添加节点</button>
            </div>
            <div className="space-y-2 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700 flex-1 bg-slate-950/30 p-2 rounded-lg border border-slate-800/50">
                {params.nodes.length === 0 && <div className="text-xs text-slate-600 text-center py-4">暂无节点</div>}
                {params.nodes.map(n => (
                    <div key={n.id} className="bg-slate-800 p-2 rounded text-xs grid grid-cols-[20px_1fr_1fr_auto] gap-2 items-center group">
                        <span className="text-slate-500 font-mono font-bold">{n.id}</span>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1">
                                <span className="text-[9px] text-slate-500 w-3">X</span>
                                <input type="number" value={n.x} onChange={(e) => updateNode(n.id, 'x', Number(e.target.value))} className="bg-slate-900 w-full p-1 rounded border border-slate-700 text-center text-white focus:border-violet-500 outline-none" step="0.1"/>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-[9px] text-slate-500 w-3">Y</span>
                                <input type="number" value={n.y} onChange={(e) => updateNode(n.id, 'y', Number(e.target.value))} className="bg-slate-900 w-full p-1 rounded border border-slate-700 text-center text-white focus:border-violet-500 outline-none" step="0.1"/>
                            </div>
                        </div>
                        
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-slate-500 text-center">约束类型</label>
                            <select 
                                value={getNodeSupportType(n.restraints)} 
                                onChange={(e) => setNodeSupport(n.id, e.target.value)}
                                className="bg-slate-900 w-full p-1 rounded border border-slate-700 text-white text-[10px] focus:border-violet-500 outline-none appearance-none cursor-pointer hover:bg-slate-800 text-center"
                            >
                                <option value="Fixed">Fixed (固定)</option>
                                <option value="Pinned">Pinned (铰接)</option>
                                <option value="RollerY">Roller-Y (滚轴)</option>
                                <option value="RollerX">Roller-X (侧滚)</option>
                                <option value="Free">Free (自由)</option>
                                <option value="Custom" disabled>Custom (自定义)</option>
                            </select>
                        </div>

                        <button onClick={() => removeNode(n.id)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">×</button>
                    </div>
                ))}
            </div>
        </div>

        {/* Elements List */}
        <div className="flex-1 min-h-0 flex flex-col border-t border-slate-800 pt-4">
            <div className="flex justify-between items-center mb-2">
            <h4 className="text-xs text-slate-300 font-semibold">单元 (Elements)</h4>
            <div className="flex gap-2">
                <button 
                    onClick={handleAutoConnect} 
                    title="自动连接/打断：修复T型连接处力无法传递的问题"
                    className="text-[10px] bg-emerald-600 px-2 py-1 rounded hover:bg-emerald-500 text-white transition-colors flex items-center gap-1"
                >
                    <span>🔗</span> 自动打断
                </button>
                <button onClick={addElement} className="text-[10px] bg-violet-600 px-2 py-1 rounded hover:bg-violet-500 text-white transition-colors">+ 添加</button>
            </div>
            </div>
            <div className="space-y-2 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700 flex-1 bg-slate-950/30 p-2 rounded-lg border border-slate-800/50">
                {params.elements.length === 0 && <div className="text-xs text-slate-600 text-center py-4">暂无单元</div>}
                {params.elements.map(e => (
                    <div key={e.id} className="bg-slate-800 p-2 rounded text-xs grid grid-cols-[20px_1fr_1fr_40px_auto] gap-2 items-center group">
                        <span className="text-slate-500 font-mono font-bold">{e.id}</span>
                        <div>
                            <label className="text-[9px] text-slate-500 block text-center">Start N1</label>
                            <select 
                                value={e.startNode} 
                                onChange={(ev) => updateElement(e.id, 'startNode', Number(ev.target.value))} 
                                className="bg-slate-900 w-full p-1 rounded border border-slate-700 text-center text-white focus:border-violet-500 outline-none text-[10px] appearance-none cursor-pointer hover:bg-slate-800"
                            >
                                {params.nodes.map(n => (
                                    <option key={n.id} value={n.id}>Node {n.id}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[9px] text-slate-500 block text-center">End N2</label>
                            <select 
                                value={e.endNode} 
                                onChange={(ev) => updateElement(e.id, 'endNode', Number(ev.target.value))} 
                                className="bg-slate-900 w-full p-1 rounded border border-slate-700 text-center text-white focus:border-violet-500 outline-none text-[10px] appearance-none cursor-pointer hover:bg-slate-800"
                            >
                                {params.nodes.map(n => (
                                    <option key={n.id} value={n.id}>Node {n.id}</option>
                                ))}
                            </select>
                        </div>
                        
                        {/* Hinges / Releases */}
                        <div className="flex items-center justify-center gap-1">
                            <div className="flex flex-col items-center">
                                <label className="text-[8px] text-slate-500 mb-0.5">S</label>
                                <input 
                                    type="checkbox" 
                                    checked={!!e.releaseStart} 
                                    onChange={(ev) => updateElement(e.id, 'releaseStart', ev.target.checked)}
                                    className="accent-violet-500 w-3 h-3"
                                    title="Release Start Moment"
                                />
                            </div>
                            <div className="flex flex-col items-center">
                                <label className="text-[8px] text-slate-500 mb-0.5">E</label>
                                <input 
                                    type="checkbox" 
                                    checked={!!e.releaseEnd} 
                                    onChange={(ev) => updateElement(e.id, 'releaseEnd', ev.target.checked)}
                                    className="accent-violet-500 w-3 h-3"
                                    title="Release End Moment"
                                />
                            </div>
                        </div>

                        <button onClick={() => removeElement(e.id)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">×</button>
                    </div>
                ))}
            </div>
        </div>
        
        <div className="text-[10px] text-slate-500 border-t border-slate-800 pt-2">
            提示：如遇T型连接处力无法传递，请点击“自动打断”按钮。
        </div>
    </div>
  );
};

export default GeometryEditor;
