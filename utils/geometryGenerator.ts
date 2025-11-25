

import { StructureType, Node, Element, Load } from '../types';

export const generateGeometry = (
    type: StructureType, 
    width: number, 
    height: number, 
    roofHeight: number,
    E: number,
    A: number,
    I: number,
    numSpans: number = 2,
    numStories: number = 2,
    numBays: number = 2
): { nodes: Node[], elements: Element[] } => {
    const nodes: Node[] = [];
    const elements: Element[] = [];
    
    // Helper to add node
    let nodeIdCounter = 1;
    const addNode = (x: number, y: number, r: [boolean, boolean, boolean]) => {
        nodes.push({ id: nodeIdCounter++, x, y, restraints: r });
        return nodeIdCounter - 1;
    };

    // Helper to add element
    let elIdCounter = 1;
    const addEl = (n1: number, n2: number, hingeS=false, hingeE=false) => {
        elements.push({ 
            id: elIdCounter++, 
            startNode: n1, endNode: n2, 
            E, A, I, 
            releaseStart: hingeS, releaseEnd: hingeE 
        });
    };

    if (type === StructureType.Beam) {
        addNode(0, 0, [true, true, false]); // Pin
        addNode(width / 2, 0, [false, true, false]); // Roller
        addNode(width, 0, [false, true, false]); // Roller
        addEl(1, 2);
        addEl(2, 3);
    }
    else if (type === StructureType.MultiSpanBeam) {
        const spanLen = width / numSpans;
        for (let i = 0; i <= numSpans; i++) {
            // Leftmost Pin, others Roller
            const restraints: [boolean, boolean, boolean] = i === 0 ? [true, true, false] : [false, true, false];
            addNode(i * spanLen, 0, restraints);
            if (i > 0) {
                addEl(i, i + 1);
            }
        }
    }
    else if (type === StructureType.PortalFrame) {
        addNode(0, 0, [true, true, true]);
        addNode(0, height, [false, false, false]);
        addNode(width, height, [false, false, false]);
        addNode(width, 0, [true, true, true]);
        addEl(1, 2);
        addEl(2, 3);
        addEl(3, 4);
    }
    else if (type === StructureType.MultiStoryFrame) {
        const bayWidth = width / numBays;
        const storyHeight = height / numStories;
        
        // Grid of nodes: y is outer loop (stories), x is inner (bays)
        // Level 0 = Ground
        for (let level = 0; level <= numStories; level++) {
            for (let bay = 0; bay <= numBays; bay++) {
                const isGround = level === 0;
                addNode(bay * bayWidth, level * storyHeight, isGround ? [true, true, true] : [false, false, false]);
            }
        }

        // Elements
        const nodesPerLevel = numBays + 1;
        for (let level = 0; level <= numStories; level++) {
            for (let bay = 0; bay <= numBays; bay++) {
                const currentNodeIdx = level * nodesPerLevel + bay + 1; // 1-based ID
                
                // Horizontal Beams (only if not ground and not last bay column)
                if (level > 0 && bay < numBays) {
                    addEl(currentNodeIdx, currentNodeIdx + 1);
                }

                // Vertical Columns (only if not top floor)
                if (level < numStories) {
                    const nodeAboveIdx = (level + 1) * nodesPerLevel + bay + 1;
                    addEl(currentNodeIdx, nodeAboveIdx);
                }
            }
        }
    }
    else if (type === StructureType.GableFrame) {
        addNode(0, 0, [true, true, false]);
        addNode(0, height, [false, false, false]);
        addNode(width/2, height + roofHeight, [false, false, false]);
        addNode(width, height, [false, false, false]);
        addNode(width, 0, [true, true, false]);
        addEl(1, 2);
        addEl(2, 3);
        addEl(3, 4);
        addEl(4, 5);
    }
    else if (type === StructureType.Truss) {
        // Pratt Truss variant
        const panels = Math.max(2, Math.floor(numSpans)); // Reuse numSpans slider as 'Panels'
        const panelWidth = width / panels;
        
        // Bottom Chord Nodes (1 to N+1)
        for(let i=0; i<=panels; i++) {
             // Left Pin, Right Roller
             const r: [boolean, boolean, boolean] = i===0 ? [true, true, false] : (i===panels ? [false, true, false] : [false, false, false]);
             addNode(i*panelWidth, 0, r);
        }
        // Top Chord Nodes (N+2 to 2N+2)
        // Parallel chord
        for(let i=0; i<=panels; i++) {
            addNode(i*panelWidth, height, [false, false, false]);
        }
        
        const offset = panels + 1; // ID offset between bottom and top nodes of same index

        for(let i=1; i<=panels; i++) {
            // Bottom Chord Elements
            addEl(i, i+1, true, true);
            // Top Chord Elements
            addEl(offset + i, offset + i + 1, true, true);
            // Verticals
            addEl(i, offset + i, true, true);
            // Diagonals (N shape: Bottom i -> Top i+1)
            addEl(i, offset + i + 1, true, true);
        }
        // Last Vertical (Right End)
        addEl(panels + 1, offset + panels + 1, true, true);
    }
    else if (type === StructureType.Cantilever) {
        addNode(0, 0, [true, true, true]);
        addNode(0, height, [false, false, false]);
        addNode(width, height, [false, false, false]);
        addEl(1, 2);
        addEl(2, 3);
    }

    return { nodes, elements };
};

/**
 * Automatically splits elements that are intersected by nodes.
 * Used to ensure mesh connectivity (e.g. T-junctions).
 */
export const autoConnectNodes = (
    nodes: Node[], 
    elements: Element[], 
    loads: Load[]
): { nodes: Node[], elements: Element[], loads: Load[] } => {
    // Helper: Distance from point to line segment
    const getDist = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq !== 0) param = dot / len_sq;
        let xx, yy;
        if (param < 0) { xx = x1; yy = y1; }
        else if (param > 1) { xx = x2; yy = y2; }
        else { xx = x1 + param * C; yy = y1 + param * D; }
        const dx = px - xx;
        const dy = py - yy;
        return { dist: Math.sqrt(dx * dx + dy * dy), t: param };
    };

    let nextElId = elements.reduce((max, e) => Math.max(max, e.id), 0) + 1;
    let newElements: Element[] = [];
    let newLoads: Load[] = [...loads.filter(l => !!l.nodeId)]; // Keep node loads
    const elementLoads = loads.filter(l => !!l.elementId);

    elements.forEach(el => {
        const n1 = nodes.find(n => n.id === el.startNode);
        const n2 = nodes.find(n => n.id === el.endNode);
        if (!n1 || !n2) {
            newElements.push(el);
            newLoads.push(...elementLoads.filter(l => l.elementId === el.id));
            return;
        }

        // Find intersections
        const splitNodes = nodes.filter(n => {
            if (n.id === n1.id || n.id === n2.id) return false;
            const res = getDist(n.x, n.y, n1.x, n1.y, n2.x, n2.y);
            // Tolerance: 5cm distance, and strictly inside the segment
            return res.dist < 0.05 && res.t > 0.01 && res.t < 0.99; 
        }).map(n => ({
            node: n,
            t: getDist(n.x, n.y, n1.x, n1.y, n2.x, n2.y).t
        }));

        if (splitNodes.length === 0) {
            newElements.push(el);
            newLoads.push(...elementLoads.filter(l => l.elementId === el.id));
            return;
        }

        // Sort by position (t)
        splitNodes.sort((a, b) => a.t - b.t);

        // Create Segments
        let currentStart = n1;
        let prevT = 0;
        
        // Define segments by points: [M1, M2, ..., End]
        const points = [...splitNodes, {node: n2, t: 1}];

        points.forEach((pt, idx) => {
            const elId = nextElId++;
            const isFirst = idx === 0;
            const isLast = idx === points.length - 1;

            // Create new element segment
            const segmentEl: Element = {
                ...el,
                id: elId,
                startNode: currentStart.id,
                endNode: pt.node.id,
                // Inherit hinges only at original ends
                releaseStart: isFirst ? el.releaseStart : false,
                releaseEnd: isLast ? el.releaseEnd : false
            };
            newElements.push(segmentEl);

            // Map Loads from original Element to this Segment
            const currentT = pt.t;
            const relevantLoads = elementLoads.filter(l => l.elementId === el.id);
            
            relevantLoads.forEach(l => {
                const lClone = { ...l, id: `auto-${Math.random().toString(36).substr(2,9)}` };
                lClone.elementId = elId;
                
                if (l.type === 'distributed') {
                    // Distributed loads apply to all segments
                    newLoads.push(lClone);
                } else {
                    // Point/Moment loads: check if location falls within segment
                    const loc = l.location !== undefined ? l.location : 0.5;
                    // Check if loc is within [prevT, currentT] with tolerance
                    if (loc >= prevT - 1e-4 && loc <= currentT + 1e-4) {
                        // Map location t_global to t_local (0-1)
                        const segLen = currentT - prevT;
                        const newLoc = segLen > 1e-6 ? (loc - prevT) / segLen : 0;
                        lClone.location = Math.max(0, Math.min(1, newLoc));
                        newLoads.push(lClone);
                    }
                }
            });

            currentStart = pt.node;
            prevT = currentT;
        });
    });

    return { nodes, elements: newElements, loads: newLoads };
};