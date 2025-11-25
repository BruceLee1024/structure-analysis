

export enum SupportType {
  Fixed = 'Fixed',
  Pinned = 'Pinned',
  Roller = 'Roller',
  RollerX = 'RollerX', // Roller moving in X direction
  Free = 'Free',
}

export enum StructureType {
  Beam = 'Beam',
  MultiSpanBeam = 'MultiSpanBeam', // New
  PortalFrame = 'PortalFrame',
  MultiStoryFrame = 'MultiStoryFrame', // New
  GableFrame = 'GableFrame',
  Truss = 'Truss', // New
  Cantilever = 'Cantilever',
  Custom = 'Custom',
}

export type StiffnessType = 'Elastic' | 'AxiallyRigid' | 'Rigid';

export interface Node {
  id: number;
  x: number;
  y: number;
  restraints: [boolean, boolean, boolean]; // [fix X, fix Y, fix Rot]
}

export interface Element {
  id: number;
  startNode: number;
  endNode: number;
  E: number; // GPa
  A: number; // cm2
  I: number; // 10^-6 m4
  releaseStart?: boolean; // True if moment is released at start node (hinged)
  releaseEnd?: boolean;   // True if moment is released at end node (hinged)
}

export interface Load {
  id: string;
  elementId?: number;
  nodeId?: number;
  type: 'point' | 'distributed' | 'moment';
  magnitude: number; // kN or kN/m or kNm
  direction?: 'x' | 'y'; // Global axis direction. Default 'y'
  // Future expansion for partial loads:
  location?: number; // 0-1 relative
}

export interface SolverParams {
  structureType: StructureType;
  stiffnessType: StiffnessType; 
  
  // Dimensions
  width: number;       // Total Width
  height: number;      // Total Height
  roofHeight: number;  // For Gable
  
  // Parametric Counters (New)
  numSpans: number;    // For Beams/Trusses
  numStories: number;  // For Frames
  numBays: number;     // For Frames

  // Properties
  elasticModulus: number;
  crossSectionArea: number;
  momentOfInertia: number;
  
  // Geometry State
  nodes: Node[];
  elements: Element[];

  // Load Management
  loads: Load[];
}

export interface ElementResult {
  elementId: number;
  stations: {
    x: number; // local x
    deflectionY: number; // local v
    axial: number; // N
    shear: number; // V
    moment: number; // M
    globalX: number;
    globalY: number;
  }[];
  maxMoment: number;
  maxShear: number;
  maxAxial: number;
  // For Exact Calculation at any x
  u_local: number[]; // [u1, v1, th1, u2, v2, th2]
  startForces: { fx: number, fy: number, m: number };
}

export interface AnalysisResult {
  elements: ElementResult[];
  maxDeflection: number;
  reactions: { nodeId: number; fx: number; fy: number; m: number }[];
}