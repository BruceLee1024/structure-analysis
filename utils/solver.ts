

import { Node, Element, Load, AnalysisResult, ElementResult, StiffnessType } from '../types';

// Helper to remove floating point noise (e.g. 9.999 -> 10, 0.00001 -> 0)
const cleanValue = (val: number) => {
    const abs = Math.abs(val);
    // 1. Zero threshold - Stricter
    if (abs < 1e-4) return 0;
    
    // 2. Integer snapping with relaxed tolerance (e.g. 9.99 -> 10)
    // Increased tolerance to 0.02 to catch mouse-drag precision issues
    const rounded = Math.round(val);
    if (Math.abs(val - rounded) < 0.02) { 
        return rounded;
    }

    // 3. Half-integer snapping (e.g. 12.5001 -> 12.5)
    if (Math.abs(val * 2 - Math.round(val * 2)) < 0.02) {
         return Math.round(val * 2) / 2;
    }

    // 4. Default precision for display
    return parseFloat(val.toFixed(4));
};

// Matrix helpers
const createMatrix = (rows: number, cols: number) => Array(rows).fill(0).map(() => Array(cols).fill(0));
const createVector = (size: number) => Array(size).fill(0);
const multiplyMatrixVector = (M: number[][], v: number[]) => {
    const res = createVector(M.length);
    for (let i = 0; i < M.length; i++) {
        for (let j = 0; j < M[0].length; j++) res[i] += M[i][j] * v[j];
    }
    return res;
};

// Gauss-Jordan Solver with Stability Check
const solveLinearSystem = (A: number[][], b: number[]) => {
  const n = b.length;
  // Deep copy to avoid mutating original K matrix if reused
  const M = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    }
    
    [M[i], M[maxRow]] = [M[maxRow], M[i]];

    // STABILITY CHECK:
    // If the pivot is effectively zero, it means this Degree of Freedom (DOF) has no stiffness.
    // This happens for Rotation DOFs in Trusses (where all elements are pinned).
    // We stabilize it by setting the diagonal to 1 and the Result (RHS) to 0.
    // This effectively "locks" the unconstrained DOF to 0 displacement.
    if (Math.abs(M[i][i]) < 1e-10) { 
        M[i][i] = 1.0;
        M[i][n] = 0.0;
        // Zero out the rest of the row to decouple this equation
        for(let j=i+1; j<n; j++) M[i][j] = 0;
        continue;
    }

    for (let k = i + 1; k < n; k++) {
      const c = -M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        if (i === j) M[k][j] = 0;
        else M[k][j] += c * M[i][j];
      }
    }
  }

  const x = createVector(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) sum += M[i][j] * x[j];
    x[i] = (M[i][n] - sum) / M[i][i];
  }
  return x;
};

/**
 * Calculates exact internal forces and deflection at a specific local x position.
 * Used for both generating the result plots and for precise mouse-over tooltips.
 */
export const calculateExactValues = (
    xInput: number, 
    L: number, 
    c: number, // cos(theta)
    s: number, // sin(theta)
    u_local: number[], // Local displacements [u1, v1, th1, u2, v2, th2]
    startForces: { fx: number, fy: number, m: number }, 
    elementLoads: Load[]
) => {
    // Clamp x to [0, L] to avoid floating point overshoot
    let x = Math.max(0, Math.min(L, xInput));
    // If very close to ends, snap exactly
    if (x < 1e-4) x = 0;
    if (Math.abs(x - L) < 1e-4) x = L;

    const xi = L > 1e-9 ? x / L : 0;

    // 1. Deflection (Hermitian Shape Functions)
    // u_local indices: 0:u1, 1:v1, 2:th1, 3:u2, 4:v2, 5:th2
    const N1 = 1 - 3*xi*xi + 2*xi*xi*xi;
    const N2 = L * (xi - 2*xi*xi + xi*xi*xi);
    const N3 = 3*xi*xi - 2*xi*xi*xi;
    const N4 = L * (-xi*xi + xi*xi*xi);
    
    // Deflection v(x)
    const def = N1*u_local[1] + N2*u_local[2] + N3*u_local[4] + N4*u_local[5];

    // 2. Internal Forces (Statics / Equilibrium from left end)
    // Start Forces are the forces EXERTED BY NODE ON ELEMENT at Start.
    
    // Use raw double precision for intermediate calc
    let N_x = -startForces.fx;
    let V_x = startForces.fy;
    let M_x = -startForces.m + V_x * x; 

    elementLoads.forEach(l => {
        const loc = (l.location !== undefined ? l.location : 0.5) * L;
        
        // Decompose load to local coordinates
        let magX = 0, magY = 0;
        if (l.type === 'distributed' || l.type === 'point') {
            const dir = l.direction || 'y';
            if (dir === 'x') { 
                magX = l.magnitude * c; 
                magY = l.magnitude * -s; 
            } else { 
                magX = l.magnitude * s; 
                magY = l.magnitude * c; 
            }
        } else if (l.type === 'moment') {
            // Moment magnitude is scalar
        }

        if (l.type === 'distributed') {
             // Distributed load wx, wy starting from x=0
             N_x -= magX * x;
             V_x += magY * x;
             M_x += magY * x * x / 2;

        } else {
             // Point Loads / Moments
             // Use strict inequality for integration steps, but for 'exact' value display:
             // If x is past the load, include it.
             if (x > loc + 1e-6) { 
                 if (l.type === 'point') {
                     N_x -= magX;
                     V_x += magY;
                     M_x += magY * (x - loc);
                 } else if (l.type === 'moment') {
                     M_x -= l.magnitude; 
                 }
             }
        }
    });

    return {
        deflectionY: cleanValue(def * 1000), // Convert to mm for display
        axial: cleanValue(N_x),
        shear: cleanValue(V_x),
        moment: cleanValue(M_x)
    };
};

export const solveStructure = (nodes: Node[], elements: Element[], loads: Load[], stiffnessType: StiffnessType = 'Elastic'): AnalysisResult => {
  const nNodes = nodes.length;
  const dofPerNode = 3; // u, v, theta
  const totalDOF = nNodes * dofPerNode;
  
  const nodeIndexMap = new Map<number, number>();
  nodes.forEach((n, i) => nodeIndexMap.set(n.id, i));
  
  const getDofIndex = (nodeId: number) => {
      const idx = nodeIndexMap.get(nodeId);
      return idx !== undefined ? idx * 3 : -1;
  };

  const K_global = createMatrix(totalDOF, totalDOF);
  const F_global = createVector(totalDOF);

  // 1. Assemble Global Stiffness Matrix
  elements.forEach(el => {
    const idx1 = getDofIndex(el.startNode);
    const idx2 = getDofIndex(el.endNode);
    if (idx1 === -1 || idx2 === -1) return;

    const n1 = nodes.find(n => n.id === el.startNode);
    const n2 = nodes.find(n => n.id === el.endNode);
    if (!n1 || !n2) return;
    
    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;
    const L = Math.sqrt(dx*dx + dy*dy);
    if (L < 1e-6) return;

    const c = dx / L;
    const s = dy / L;

    // Apply Stiffness Overrides
    const RIGID_MULTIPLIER = 1e4;
    
    let effE = el.E * 1e6; // kPa
    let effA = el.A * 1e-4; // m2
    let effI = el.I * 1e-6; // m4

    if (stiffnessType === 'AxiallyRigid') {
        effA *= RIGID_MULTIPLIER;
    } else if (stiffnessType === 'Rigid') {
        effE *= RIGID_MULTIPLIER; 
    }

    // Local Stiffness
    const k_axial = effE * effA / L;
    let k_local = createMatrix(6, 6);

    // Axial
    k_local[0][0] = k_axial;  k_local[0][3] = -k_axial;
    k_local[3][0] = -k_axial; k_local[3][3] = k_axial;

    // Bending
    let k33 = 0, k32 = 0, k31 = 0, kb1=0, kb2=0, kb3=0, kb4=0;
    
    if (el.releaseStart && el.releaseEnd) {
        // Pinned-Pinned (Truss-like for bending). No stiffness added to rotation matrix terms.
    } else if (el.releaseStart) {
        k33 = 3 * effE * effI / (L * L * L);
        k32 = 3 * effE * effI / (L * L);
        k31 = 3 * effE * effI / L;
        k_local[1][1] = k33;   k_local[1][4] = -k33; k_local[1][5] = k32;
        k_local[4][1] = -k33;  k_local[4][4] = k33;  k_local[4][5] = -k32;
        k_local[5][1] = k32;   k_local[5][4] = -k32; k_local[5][5] = k31;
    } else if (el.releaseEnd) {
        k33 = 3 * effE * effI / (L * L * L);
        k32 = 3 * effE * effI / (L * L);
        k31 = 3 * effE * effI / L;
        k_local[1][1] = k33;   k_local[1][2] = k32;  k_local[1][4] = -k33;
        k_local[2][1] = k32;   k_local[2][2] = k31;  k_local[2][4] = -k32;
        k_local[4][1] = -k33;  k_local[4][2] = -k32; k_local[4][4] = k33;
    } else {
        kb1 = 12 * effE * effI / (L * L * L);
        kb2 = 6 * effE * effI / (L * L);
        kb3 = 4 * effE * effI / L;
        kb4 = 2 * effE * effI / L;
        k_local[1][1] = kb1; k_local[1][2] = kb2; k_local[1][4] = -kb1; k_local[1][5] = kb2;
        k_local[2][1] = kb2; k_local[2][2] = kb3; k_local[2][4] = -kb2; k_local[2][5] = kb4;
        k_local[4][1] = -kb1;k_local[4][2] = -kb2;k_local[4][4] = kb1;  k_local[4][5] = -kb2;
        k_local[5][1] = kb2; k_local[5][2] = kb4; k_local[5][4] = -kb2; k_local[5][5] = kb3;
    }

    // Transformation T
    const T = createMatrix(6, 6);
    T[0][0]=c; T[0][1]=s;
    T[1][0]=-s; T[1][1]=c;
    T[2][2]=1;
    T[3][3]=c; T[3][4]=s;
    T[4][3]=-s; T[4][4]=c;
    T[5][5]=1;

    const k_global_el = createMatrix(6, 6);
    for(let i=0; i<6; i++) {
        for(let j=0; j<6; j++) {
            let val = 0;
            for(let a=0; a<6; a++) for(let b=0; b<6; b++) val += T[a][i] * k_local[a][b] * T[b][j];
            k_global_el[i][j] = val;
        }
    }

    const map = [idx1, idx1+1, idx1+2, idx2, idx2+1, idx2+2];
    for(let i=0; i<6; i++) for(let j=0; j<6; j++) K_global[map[i]][map[j]] += k_global_el[i][j];
  });

  // 2. Apply Loads
  loads.forEach(load => {
    if (!load.elementId && load.nodeId) {
         const idx = getDofIndex(load.nodeId);
         if (idx !== -1) {
             if (load.type === 'moment') {
                 F_global[idx + 2] += load.magnitude;
             } else {
                const dir = load.direction || 'y';
                if (dir === 'x') F_global[idx] += load.magnitude;
                else F_global[idx + 1] += load.magnitude; 
             }
         }
         return;
    }

    if (load.elementId) {
        const el = elements.find(e => e.id === load.elementId);
        if (!el) return;

        const idx1 = getDofIndex(el.startNode);
        const idx2 = getDofIndex(el.endNode);
        if (idx1 === -1 || idx2 === -1) return;

        const n1 = nodes.find(n => n.id === el.startNode);
        const n2 = nodes.find(n => n.id === el.endNode);
        if (!n1 || !n2) return;

        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const L = Math.sqrt(dx*dx + dy*dy);
        const c = dx / L;
        const s = dy / L;

        let m1 = 0, m2 = 0, v1 = 0, v2 = 0, fx1 = 0, fx2 = 0;

        // Equivalent Nodal Forces (Fixed End Actions)
        if (load.type === 'distributed') {
            const mag = load.magnitude;
            const dir = load.direction || 'y';
            let wx = (dir === 'x') ? mag * c : mag * s; 
            let wy = (dir === 'x') ? mag * -s : mag * c; 
            
            m1 = -wy * L * L / 12; m2 = wy * L * L / 12;
            v1 = -wy * L / 2; v2 = -wy * L / 2;
            fx1 = -wx * L / 2; fx2 = -wx * L / 2;

        } else if (load.type === 'point') {
            const mag = load.magnitude;
            const a = (load.location !== undefined ? load.location : 0.5) * L;
            const b = L - a;
            const dir = load.direction || 'y';
            
            let Px = (dir === 'x') ? mag * c : mag * s; 
            let Py = (dir === 'x') ? mag * -s : mag * c;

            m1 = -Py * a * b * b / (L * L); m2 = Py * a * a * b / (L * L);
            v1 = -Py * b * b * (3 * a + b) / (L * L * L); v2 = -Py * a * a * (a + 3 * b) / (L * L * L);
            fx1 = -Px * b / L; fx2 = -Px * a / L;

        } else if (load.type === 'moment') {
            const M = load.magnitude;
            const a = (load.location !== undefined ? load.location : 0.5) * L;
            const b = L - a;
            m1 = M * b * (2 * a - b) / (L * L); m2 = M * a * (2 * b - a) / (L * L);
            v1 = -6 * M * a * b / (L * L * L); v2 = 6 * M * a * b / (L * L * L);
        }

        // Release Adjustments
        if (el.releaseStart) {
            const dm1 = -m1; m1 += dm1; m2 += 0.5 * dm1; 
            const dV = -1.5 * dm1 / L; v1 += dV; v2 -= dV;
        }
        if (el.releaseEnd) {
             const dm2 = -m2; m2 += dm2; 
             if (!el.releaseStart) {
                 m1 += 0.5 * dm2; const dV1 = -1.5 * dm2 / L; v1 += dV1; v2 -= dV1;
             } else {
                 if (load.type === 'distributed') {
                     const mag = load.magnitude; const dir = load.direction || 'y';
                     let wy = (dir === 'x') ? mag * -s : mag * c;
                     v1 = -wy * L / 2; v2 = -wy * L / 2;
                 } else if (load.type === 'point') {
                     const mag = load.magnitude; const dir = load.direction || 'y';
                     const a = (load.location !== undefined ? load.location : 0.5) * L; const b = L - a;
                     let Py = (dir === 'x') ? mag * -s : mag * c;
                     v1 = -Py * b / L; v2 = -Py * a / L;
                 } else if (load.type === 'moment') {
                     const M = load.magnitude; v1 = -M / L; v2 = M / L;
                 }
                 fx1 = 0; fx2 = 0; m1 = 0; m2 = 0;
             }
        }

        const fem_local = [fx1, v1, m1, fx2, v2, m2];
        const map = [idx1, idx1+1, idx1+2, idx2, idx2+1, idx2+2];
        
        // F_global -= T^T * fem_local
        F_global[map[0]] -= c*fem_local[0] - s*fem_local[1];
        F_global[map[1]] -= s*fem_local[0] + c*fem_local[1];
        F_global[map[2]] -= fem_local[2];
        
        F_global[map[3]] -= c*fem_local[3] - s*fem_local[4];
        F_global[map[4]] -= s*fem_local[3] + c*fem_local[4];
        F_global[map[5]] -= fem_local[5];
    }
  });

  // 3. Boundary Conditions
  const K_reduced = K_global.map(row => [...row]);
  const F_reduced = [...F_global];
  
  nodes.forEach((node, i) => {
    const idx = nodeIndexMap.get(node.id)! * 3;
    node.restraints.forEach((isConstrained, dofOffset) => {
        if (isConstrained) {
            const k = idx + dofOffset;
            for (let j = 0; j < totalDOF; j++) {
                K_reduced[k][j] = 0;
                K_reduced[j][k] = 0;
            }
            K_reduced[k][k] = 1;
            F_reduced[k] = 0;
        }
    });
  });

  // 4. Solve
  const U = solveLinearSystem(K_reduced, F_reduced);

  // 5. Post Processing
  const results: ElementResult[] = [];
  const reactions: { nodeId: number; fx: number; fy: number; m: number }[] = [];

  const KU = multiplyMatrixVector(K_global, U);
  nodes.forEach((node) => {
      const idx = nodeIndexMap.get(node.id)! * 3;
      if (node.restraints.some(r => r)) {
          reactions.push({
              nodeId: node.id,
              fx: cleanValue(node.restraints[0] ? KU[idx] - F_global[idx] : 0),
              fy: cleanValue(node.restraints[1] ? KU[idx+1] - F_global[idx+1] : 0),
              m:  cleanValue(node.restraints[2] ? KU[idx+2] - F_global[idx+2] : 0)
          });
      }
  });

  let maxDeflection = 0;

  elements.forEach(el => {
      const idx1 = getDofIndex(el.startNode);
      const idx2 = getDofIndex(el.endNode);
      if (idx1 === -1 || idx2 === -1) return;

      const n1 = nodes.find(n => n.id === el.startNode)!;
      const n2 = nodes.find(n => n.id === el.endNode)!;

      const u_global_el = [
          U[idx1], U[idx1+1], U[idx1+2],
          U[idx2], U[idx2+1], U[idx2+2]
      ];

      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      const L = Math.sqrt(dx*dx + dy*dy);
      const c = dx / L;
      const s = dy / L;

      // Calculate Local Displacements
      const u_local = [
          c*u_global_el[0] + s*u_global_el[1],
          -s*u_global_el[0] + c*u_global_el[1],
          u_global_el[2],
          c*u_global_el[3] + s*u_global_el[4],
          -s*u_global_el[3] + c*u_global_el[4],
          u_global_el[5]
      ];

      // Recompute Local Stiffness & Forces...
      // (Simplified: We use exact shape functions in calculateExactValues, 
      //  but we need startForces for equilibrium)
      
      const RIGID_MULTIPLIER = 1e4;
      let effE = el.E * 1e6; 
      let effA = el.A * 1e-4; 
      let effI = el.I * 1e-6; 

      if (stiffnessType === 'AxiallyRigid') effA *= RIGID_MULTIPLIER;
      else if (stiffnessType === 'Rigid') effE *= RIGID_MULTIPLIER;

      let k_local = createMatrix(6, 6);
      const k_axial = effE * effA / L;
      k_local[0][0] = k_axial;  k_local[0][3] = -k_axial;
      k_local[3][0] = -k_axial; k_local[3][3] = k_axial;

      if (el.releaseStart && el.releaseEnd) {
      } else if (el.releaseStart) {
        const k33 = 3*effE*effI/(L*L*L); const k32 = 3*effE*effI/(L*L); const k31 = 3*effE*effI/L;
        k_local[1][1]=k33; k_local[1][4]=-k33; k_local[1][5]=k32;
        k_local[4][1]=-k33; k_local[4][4]=k33; k_local[4][5]=-k32;
        k_local[5][1]=k32; k_local[5][4]=-k32; k_local[5][5]=k31;
      } else if (el.releaseEnd) {
        const k33 = 3*effE*effI/(L*L*L); const k32 = 3*effE*effI/(L*L); const k31 = 3*effE*effI/L;
        k_local[1][1]=k33; k_local[1][2]=k32; k_local[1][4]=-k33;
        k_local[2][1]=k32; k_local[2][2]=k31; k_local[2][4]=-k32;
        k_local[4][1]=-k33; k_local[4][2]=-k32; k_local[4][4]=k33;
      } else {
        const kb1=12*effE*effI/(L*L*L); const kb2=6*effE*effI/(L*L); const kb3=4*effE*effI/L; const kb4=2*effE*effI/L;
        k_local[1][1]=kb1; k_local[1][2]=kb2; k_local[1][4]=-kb1; k_local[1][5]=kb2;
        k_local[2][1]=kb2; k_local[2][2]=kb3; k_local[2][4]=-kb2; k_local[2][5]=kb4;
        k_local[4][1]=-kb1;k_local[4][2]=-kb2;k_local[4][4]=kb1;  k_local[4][5]=-kb2;
        k_local[5][1]=kb2; k_local[5][2]=kb4; k_local[5][4]=-kb2; k_local[5][5]=kb3;
      }

      // Forces from Stiffness (F = K * u)
      const f_stiff = createVector(6);
      for(let r=0; r<6; r++) for(let col=0; col<6; col++) f_stiff[r] += k_local[r][col] * u_local[col];
      
      // Forces from Fixed End Actions (Load Effects)
      const elLoads = loads.filter(l => l.elementId === el.id);
      const fem = [0, 0, 0, 0, 0, 0];

      elLoads.forEach(l => {
          let m1 = 0, m2 = 0, v1 = 0, v2 = 0, fx1 = 0, fx2 = 0;
          const locParam = l.location !== undefined ? l.location : 0.5;

          if (l.type === 'distributed') {
              const mag = l.magnitude; const dir = l.direction || 'y';
              let wx = (dir === 'x') ? mag*c : mag*s; 
              let wy = (dir === 'x') ? mag*-s : mag*c; 
              m1 = -wy*L*L/12; m2 = wy*L*L/12; v1 = -wy*L/2; v2 = -wy*L/2; fx1 = -wx*L/2; fx2 = -wx*L/2;
          } else if (l.type === 'point') {
              const mag = l.magnitude; const dir = l.direction || 'y';
              const a = locParam * L; const b = L - a;
              let Px = (dir === 'x') ? mag*c : mag*s; 
              let Py = (dir === 'x') ? mag*-s : mag*c;
              m1 = -Py*a*b*b/(L*L); m2 = Py*a*a*b/(L*L); 
              v1 = -Py*b*b*(3*a+b)/(L*L*L); v2 = -Py*a*a*(a+3*b)/(L*L*L);
              fx1 = -Px*b/L; fx2 = -Px*a/L;
          } else if (l.type === 'moment') {
               const M = l.magnitude; const a = locParam * L; const b = L - a;
               m1 = M*b*(2*a-b)/(L*L); m2 = M*a*(2*b-a)/(L*L);
               v1 = -6*M*a*b/(L*L*L); v2 = 6*M*a*b/(L*L*L);
          }

          if (el.releaseStart) {
              const dm1 = -m1; m1 += dm1; m2 += 0.5*dm1;
              const dV = -1.5 * dm1 / L; v1 += dV; v2 -= dV;
          }
          if (el.releaseEnd) {
              const dm2 = -m2; m2 += dm2;
              if (!el.releaseStart) {
                  m1 += 0.5*dm2; const dV1 = -1.5 * dm2 / L; v1 += dV1; v2 -= dV1;
              } else {
                  if (l.type === 'distributed') {
                      const mag = l.magnitude; const dir = l.direction || 'y';
                      let wy = (dir === 'x') ? mag*-s : mag*c;
                      v1 = -wy*L/2; v2 = -wy*L/2;
                  } else if (l.type === 'point') {
                      const mag = l.magnitude; const dir = l.direction || 'y';
                      const a = locParam * L; const b = L - a;
                      let Py = (dir === 'x') ? mag*-s : mag*c;
                      v1 = -Py*b/L; v2 = -Py*a/L;
                  } else if (l.type === 'moment') {
                      const M = l.magnitude; v1 = -M/L; v2 = M/L;
                  }
                  fx1=0; fx2=0; m1=0; m2=0;
              }
          }
          fem[0]+=fx1; fem[1]+=v1; fem[2]+=m1; fem[3]+=fx2; fem[4]+=v2; fem[5]+=m2;
      });

      // Total End Forces (Force exerted by Node ON Element)
      const F_total = f_stiff.map((v, i) => v + fem[i]);
      
      const startForces = { 
          fx: cleanValue(F_total[0]), 
          fy: cleanValue(F_total[1]), 
          m: cleanValue(F_total[2]) 
      };

      // Generate Plot Stations
      const plotPoints = [];
      const criticalX = new Set([0, L]);
      elLoads.forEach(l => {
          const loc = (l.location !== undefined ? l.location : 0.5) * L;
          if(loc > 0 && loc < L) {
              criticalX.add(loc);
              criticalX.add(Math.max(0, loc - 0.001));
              criticalX.add(Math.min(L, loc + 0.001));
          }
      });
      const numSteps = 100; 
      for(let i=0; i<=numSteps; i++) criticalX.add(i*L/numSteps);
      const sortedX = Array.from(criticalX).sort((a,b) => a-b);

      let elMaxM = 0, elMaxV = 0, elMaxN = 0;

      for (const x of sortedX) {
          const vals = calculateExactValues(x, L, c, s, u_local, startForces, elLoads);
          
          const gx = n1.x + x * c - (vals.deflectionY/1000) * s; 
          const gy = n1.y + x * s + (vals.deflectionY/1000) * c; 

          plotPoints.push({
              x,
              deflectionY: vals.deflectionY,
              axial: vals.axial,
              shear: vals.shear,
              moment: vals.moment,
              globalX: gx,
              globalY: gy
          });

          if(Math.abs(vals.moment) > elMaxM) elMaxM = Math.abs(vals.moment);
          if(Math.abs(vals.shear) > elMaxV) elMaxV = Math.abs(vals.shear);
          if(Math.abs(vals.axial) > elMaxN) elMaxN = Math.abs(vals.axial);
          if(Math.abs(vals.deflectionY) > maxDeflection) maxDeflection = Math.abs(vals.deflectionY);
      }

      results.push({
          elementId: el.id,
          stations: plotPoints,
          maxAxial: cleanValue(elMaxN),
          maxMoment: cleanValue(elMaxM),
          maxShear: cleanValue(elMaxV),
          u_local: u_local,
          startForces: startForces
      });
  });

  return {
      elements: results,
      maxDeflection: cleanValue(maxDeflection),
      reactions
  };
};