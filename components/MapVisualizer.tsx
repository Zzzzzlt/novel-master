import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import { MapViewData, MapNode, MapEdge, MapScope } from '../types';
import { Button } from './ui/Button';
import { X, Trash2, MapPin, Code, Layers, Plus, Copy, CornerDownRight, Edit2, BoxSelect, Maximize, Wand2 } from 'lucide-react';
import { generateId } from '../utils';

// --- Constants ---
const NODE_WIDTH = 140;
const NODE_HEIGHT = 60;
const GRID_SIZE = 40;
const DRAG_THRESHOLD = 5; 

const COLORS = {
    CYAN: '#00f0ff',
    MAGENTA: '#ff00ff',
    GREEN: '#00ff41',
    YELLOW: '#fcee0a',
    ORANGE: '#f97316',
    DARK_BG: '#0b0b15',
    GRID: 'rgba(255,255,255,0.05)',
    SELECTED: '#facc15',
    WORLD_BG: 'rgba(20, 20, 30, 0.6)', 
    WORLD_BORDER: '#555',
    REGION_BG: 'rgba(0, 240, 255, 0.05)',
    REGION_BORDER: 'rgba(0, 240, 255, 0.3)'
};

const EDGE_COLORS: Record<string, string> = {
    road: '#94a3b8', 
    door: '#2dd4bf', 
    portal: '#a855f7', 
    stairs: '#facc15'
};

const PORTS = [
    { id: 'N', x: 0, y: -1, type: 'planar' },
    { id: 'NE', x: 1, y: -1, type: 'planar' },
    { id: 'E', x: 1, y: 0, type: 'planar' },
    { id: 'SE', x: 1, y: 1, type: 'planar' },
    { id: 'S', x: 0, y: 1, type: 'planar' },
    { id: 'SW', x: -1, y: 1, type: 'planar' },
    { id: 'W', x: -1, y: 0, type: 'planar' },
    { id: 'NW', x: -1, y: -1, type: 'planar' },
    { id: 'UP', x: 0, y: -1.8, type: 'z-axis' }, 
    { id: 'DOWN', x: 0, y: 1.8, type: 'z-axis' }
];

const OPPOSITE_PORTS: Record<string, string> = {
    'N': 'S', 'S': 'N',
    'E': 'W', 'W': 'E',
    'NE': 'SW', 'SW': 'NE',
    'SE': 'NW', 'NW': 'SE',
    'UP': 'DOWN', 'DOWN': 'UP'
};

const getOctagonPath = (w: number, h: number, r: number = 10) => {
    return `
        M ${-w/2 + r} ${-h/2} 
        L ${w/2 - r} ${-h/2} 
        L ${w/2} ${-h/2 + r} 
        L ${w/2} ${h/2 - r} 
        L ${w/2 - r} ${h/2} 
        L ${-w/2 + r} ${h/2} 
        L ${-w/2} ${h/2 - r} 
        L ${-w/2} ${-h/2 + r} 
        Z
    `;
};

// Port position calculator that supports arbitrary widths/heights (for scopes)
const getPortPosition = (cx: number, cy: number, w: number, h: number, pid: string) => {
    const p = PORTS.find(port => port.id === pid);
    if (!p) return { x: cx, y: cy };
    
    // Scale factor: If planar, we go to edge. 
    // For Z-Axis, we go bit further out.
    const px = p.x * (w / 2);
    const py = p.y * (h / 2);
    
    return { x: cx + px, y: cy + py };
};

const getOrthogonalPath = (x1: number, y1: number, x2: number, y2: number, sourcePortId: string) => {
    const p = PORTS.find(port => port.id === sourcePortId);
    
    // Z-Axis: Direct Line (No Manhattan bends)
    if (p?.type === 'z-axis') {
        return `M ${x1} ${y1} L ${x2} ${y2}`;
    }

    if (Math.abs(x1 - x2) < 1 && Math.abs(y1 - y2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;

    let path = `M ${x1} ${y1}`;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    let horizontalFirst = Math.abs(x2 - x1) > Math.abs(y2 - y1);
    
    if (['N', 'S'].includes(sourcePortId)) horizontalFirst = false;
    if (['E', 'W'].includes(sourcePortId)) horizontalFirst = true;

    if (horizontalFirst) {
        path += ` L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
    } else {
        path += ` L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
    }
    
    return path;
};

// --- Helper: Recursive Movement ---
const moveScopeRecursively = (
    scopeId: string, 
    dx: number, 
    dy: number, 
    nodes: MapNode[], 
    scopes: MapScope[]
) => {
    const scope = scopes.find(s => s.id === scopeId);
    if (scope) {
        scope.x += dx;
        scope.y += dy;
    }

    // Move children nodes
    nodes.filter(n => n.parentId === scopeId).forEach(n => {
        n.x += dx;
        n.y += dy;
    });

    // Move children scopes (and their children)
    scopes.filter(s => s.parentId === scopeId).forEach(s => {
        moveScopeRecursively(s.id, dx, dy, nodes, scopes);
    });
};

// --- ALGORITHM: Deterministic Grid Layout ---
const computeSmartLayout = (allNodes: MapNode[], allScopes: MapScope[], allEdges: MapEdge[]) => {
    // Grid unit size (Pixels)
    const GRID_W = 280;
    const GRID_H = 200;
    
    // Track occupied positions: "x,y" -> nodeId
    const occupied = new Map<string, string>();
    const nodePositions = new Map<string, {x: number, y: number}>();

    // Helper to snap coords to key
    const toKey = (x: number, y: number) => `${Math.round(x*10)/10},${Math.round(y*10)/10}`;
    const checkOccupied = (x: number, y: number) => occupied.has(toKey(x, y));

    // Find a free spot near (tx, ty)
    // Uses a spiral search to guarantee a spot is found
    const findFreeSpot = (tx: number, ty: number, fromDir: string) => {
        let radius = 0;
        let angle = 0;
        
        // Check immediate target first
        if (!checkOccupied(tx, ty)) return {x: tx, y: ty};

        // Directional preference logic: try linear expansion first
        const linearCandidates = [];
        if (['E', 'W'].includes(fromDir)) {
            linearCandidates.push({x: tx, y: ty + 1});
            linearCandidates.push({x: tx, y: ty - 1});
        } else if (['N', 'S'].includes(fromDir)) {
            linearCandidates.push({x: tx + 1, y: ty});
            linearCandidates.push({x: tx - 1, y: ty});
        }
        
        for(const cand of linearCandidates) {
            if(!checkOccupied(cand.x, cand.y)) return cand;
        }

        // Spiral fallback
        while(radius < 20) {
            radius += 1;
            // Check 8 neighbors at current radius (simplified square spiral)
            for(let dx = -radius; dx <= radius; dx++) {
                for(let dy = -radius; dy <= radius; dy++) {
                    // Only check the perimeter of the square
                    if (Math.abs(dx) === radius || Math.abs(dy) === radius) {
                        const cx = tx + dx;
                        const cy = ty + dy;
                        if (!checkOccupied(cx, cy)) return {x: cx, y: cy};
                    }
                }
            }
        }
        return {x: tx + 50, y: ty + 50}; // Emergency fallback
    };

    const visited = new Set<string>();
    const updates: Record<string, any> = {};

    // Process each connected component
    for (const node of allNodes) {
        if (visited.has(node.id)) continue;

        // Queue items: {id, gridX, gridY}
        const queue = [{id: node.id, x: 0, y: 0}];
        
        // If this node was already placed (by a cross-component edge processed earlier), use its pos
        if (nodePositions.has(node.id)) {
            const pos = nodePositions.get(node.id)!;
            queue[0].x = pos.x;
            queue[0].y = pos.y;
        } else {
            // Find a spot for the root of this component that doesn't overlap with other components
            let startX = 0, startY = 0;
            // Shift entire component right until it finds clear space
            while(checkOccupied(startX, startY)) {
                startX += 2; 
            }
            queue[0].x = startX;
            queue[0].y = startY;
        }

        while (queue.length > 0) {
            const curr = queue.shift()!;
            
            // Double check visited inside loop to handle multi-path
            if (visited.has(curr.id)) continue;
            visited.add(curr.id);

            // 1. Finalize Position
            let finalX = curr.x;
            let finalY = curr.y;
            
            if (checkOccupied(finalX, finalY)) {
                const free = findFreeSpot(finalX, finalY, 'NONE');
                finalX = free.x;
                finalY = free.y;
            }
            
            occupied.set(toKey(finalX, finalY), curr.id);
            nodePositions.set(curr.id, {x: finalX, y: finalY});

            // 2. Discover Neighbors
            const outgoing = allEdges.filter(e => e.source === curr.id);
            const incoming = allEdges.filter(e => e.target === curr.id);

            const queueNeighbor = (neighborId: string, dir: string, isOutgoing: boolean) => {
                if (visited.has(neighborId)) return;
                
                // Determine direction offset
                let dx = 0, dy = 0;
                // If isOutgoing (Curr -> Neighbor), dir is correct.
                // If Incoming (Neighbor -> Curr), dir is from Neighbor's perspective. 
                // We need the opposite vector to place Neighbor relative to Curr.
                
                // Effective direction relative to Current Node
                const effectiveDir = isOutgoing ? dir : (OPPOSITE_PORTS[dir] || 'N');

                switch(effectiveDir) {
                    case 'N': dy = -1; break;
                    case 'S': dy = 1; break;
                    case 'E': dx = 1; break;
                    case 'W': dx = -1; break;
                    case 'NE': dx = 1; dy = -1; break;
                    case 'NW': dx = -1; dy = -1; break;
                    case 'SE': dx = 1; dy = 1; break;
                    case 'SW': dx = -1; dy = 1; break;
                    case 'UP': dx = 0.5; dy = -0.5; break; // Isometric Z
                    case 'DOWN': dx = -0.5; dy = 0.5; break;
                    default: dx = 1; break; 
                }

                queue.push({ id: neighborId, x: finalX + dx, y: finalY + dy });
            };

            outgoing.forEach(e => queueNeighbor(e.target, e.direction, true));
            incoming.forEach(e => queueNeighbor(e.source, e.direction, false));
        }
    }

    // --- Apply Node Updates ---
    nodePositions.forEach((pos, id) => {
        updates[id] = {
            x: pos.x * GRID_W, 
            y: pos.y * GRID_H
        };
    });

    // --- Handle Scopes (Bounding Box) ---
    // Recursively calculate bounds to wrap nodes
    const scopeChildren = new Map<string, string[]>();
    allNodes.forEach(n => {
        if(n.parentId) {
            if(!scopeChildren.has(n.parentId)) scopeChildren.set(n.parentId, []);
            scopeChildren.get(n.parentId)!.push(n.id);
        }
    });
    
    allScopes.forEach(s => {
        if(s.parentId) {
            if(!scopeChildren.has(s.parentId)) scopeChildren.set(s.parentId, []);
            scopeChildren.get(s.parentId)!.push(s.id);
        }
    });

    // Recursive function to get bounds of a scope (including nested scopes)
    const getBounds = (itemId: string, type: 'node'|'scope'): {x:number, y:number, w:number, h:number} | null => {
        if (type === 'node') {
            const up = updates[itemId]; 
            if (up) return { x: up.x, y: up.y, w: NODE_WIDTH, h: NODE_HEIGHT };
            const existing = allNodes.find(n => n.id === itemId);
            if (existing) return { x: existing.x, y: existing.y, w: NODE_WIDTH, h: NODE_HEIGHT };
            return null;
        } else {
            const children = scopeChildren.get(itemId) || [];
            if (children.length === 0) {
                const s = allScopes.find(x => x.id === itemId);
                return s ? {x: s.x, y: s.y, w: s.w, h: s.h} : null;
            }

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            children.forEach(childId => {
                const isNode = allNodes.some(n => n.id === childId);
                const b = getBounds(childId, isNode ? 'node' : 'scope');
                if (b) {
                    minX = Math.min(minX, b.x);
                    minY = Math.min(minY, b.y);
                    maxX = Math.max(maxX, b.x + b.w);
                    maxY = Math.max(maxY, b.y + b.h);
                }
            });

            if (minX === Infinity) return null;

            const PADDING = 60;
            const HEADER = 40;
            const finalRect = {
                x: minX - PADDING,
                y: minY - PADDING - HEADER,
                w: (maxX - minX) + PADDING * 2,
                h: (maxY - minY) + PADDING * 2 + HEADER
            };
            
            updates[itemId] = finalRect;
            return finalRect;
        }
    };

    // Trigger calculation for all root scopes
    const rootScopes = allScopes.filter(s => !s.parentId);
    rootScopes.forEach(s => getBounds(s.id, 'scope'));
    
    // Catch-all for disconnected scopes
    allScopes.forEach(s => {
        if (!updates[s.id]) getBounds(s.id, 'scope');
    });

    return Object.entries(updates).map(([id, val]) => ({
        op_code: 'UPDATE_STATE',
        target_id: id,
        changes: val
    }));
};


// --- Property Editor Modal ---
interface PropertyDialogState {
    isOpen: boolean;
    mode: 'create_node' | 'edit_node' | 'edit_edge' | 'create_scope' | 'edit_scope';
    data: any; 
    position?: { x: number, y: number }; 
}

const PropertyDialog: React.FC<{
    state: PropertyDialogState;
    onClose: () => void;
    onConfirm: (data: any) => void;
}> = ({ state, onClose, onConfirm }) => {
    const [formData, setFormData] = useState(state.data || {});
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setFormData(state.data || {});
        setTimeout(() => inputRef.current?.focus(), 100);
    }, [state]);

    const handleChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        onConfirm(formData);
        onClose();
    };

    return (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={e => e.stopPropagation()}>
            <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-700 p-6 rounded-xl shadow-2xl w-80 animate-in zoom-in-95">
                <h3 className="text-zinc-200 font-bold mb-4 text-sm uppercase tracking-wider flex items-center gap-2">
                    <Edit2 size={14}/> 
                    {state.mode.replace('_', ' ').toUpperCase()}
                </h3>
                
                <div className="space-y-4">
                    {/* ID Input (Advanced) */}
                    <div className="bg-red-900/10 p-2 rounded border border-red-900/30">
                        <label className="text-[10px] text-red-400 uppercase font-bold block mb-1">ID (Caution)</label>
                        <input 
                            className="w-full bg-black border border-red-900/30 text-xs text-red-200 p-2 rounded focus:border-red-500 outline-none font-mono"
                            value={formData.id || ''}
                            onChange={e => handleChange('id', e.target.value)}
                        />
                    </div>

                    {/* Label Input */}
                    {(state.mode.includes('node') || state.mode.includes('scope')) && (
                        <div>
                            <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Label</label>
                            <input 
                                ref={inputRef}
                                className="w-full bg-black border border-zinc-700 text-sm text-zinc-200 p-2 rounded focus:border-cyan-500 outline-none"
                                value={formData.label || ''}
                                onChange={e => handleChange('label', e.target.value)}
                            />
                        </div>
                    )}

                    {/* Node Type Selector */}
                    {state.mode.includes('node') && (
                        <div>
                            <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Type</label>
                            <select 
                                className="w-full bg-black border border-zinc-700 text-sm text-zinc-200 p-2 rounded outline-none"
                                value={formData.type || 'room'}
                                onChange={e => handleChange('type', e.target.value)}
                            >
                                <option value="room">Room</option>
                                <option value="landmark">Landmark</option>
                                <option value="transit">Transit</option>
                                <option value="unknown">Unknown</option>
                            </select>
                        </div>
                    )}

                    {/* Edge Type Selector */}
                    {state.mode === 'edit_edge' && (
                        <div>
                            <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Connection Type</label>
                            <div className="grid grid-cols-2 gap-2">
                                {['road', 'door', 'portal', 'stairs'].map(t => (
                                    <button 
                                        key={t} 
                                        type="button"
                                        onClick={() => handleChange('type', t)} 
                                        className={`text-xs border px-2 py-2 rounded capitalize transition-all ${formData.type === t ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 font-bold' : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'}`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                     {state.mode === 'edit_edge' && (
                        <div className="flex items-center gap-2">
                             <input 
                                type="checkbox" 
                                id="fuzzy"
                                checked={formData.isFuzzy || false} 
                                onChange={e => handleChange('isFuzzy', e.target.checked)} 
                                className="rounded border-zinc-700 bg-black text-cyan-500"
                            />
                            <label htmlFor="fuzzy" className="text-xs text-zinc-400">Fuzzy / Uncertain</label>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 mt-6 border-t border-zinc-800 pt-4">
                    <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button type="submit" size="sm" className="bg-cyan-600 hover:bg-cyan-500 text-white">Save</Button>
                </div>
            </form>
        </div>
    );
};

// --- Context Menu ---
interface ContextMenuState {
    x: number;
    y: number;
    type: 'canvas' | 'node' | 'edge' | 'scope';
    targetId?: string;
    worldPos: { x: number, y: number };
}

const ContextMenu: React.FC<{ 
    menu: ContextMenuState, 
    onClose: () => void, 
    onAction: (action: string, payload?: any) => void 
}> = ({ menu, onClose, onAction }) => {
    useEffect(() => {
        const handler = () => onClose();
        window.addEventListener('click', handler);
        return () => window.removeEventListener('click', handler);
    }, [onClose]);

    return (
        <div 
            className="fixed z-[9999] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
            style={{ top: menu.y, left: menu.x }}
            onClick={e => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
        >
            {menu.type === 'canvas' && (
                <>
                    <button onClick={() => { onAction('open_create_node', { ...menu.worldPos }); onClose(); }} className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-cyan-900/30 hover:text-cyan-400 flex items-center gap-2"><Plus size={12}/> New Node</button>
                    <div className="h-px bg-zinc-800 my-1"/>
                    <button onClick={() => { onAction('create_scope', { ...menu.worldPos, layer: 'REGION' }); onClose(); }} className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-cyan-900/30 hover:text-cyan-400 flex items-center gap-2"><Layers size={12}/> New Region</button>
                    <button onClick={() => { onAction('create_scope', { ...menu.worldPos, layer: 'WORLD' }); onClose(); }} className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-cyan-900/30 hover:text-cyan-400 flex items-center gap-2"><Layers size={12}/> New World</button>
                    <div className="h-px bg-zinc-800 my-1"/>
                    <button onClick={() => { onAction('paste', menu.worldPos); onClose(); }} className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"><CornerDownRight size={12}/> Paste</button>
                </>
            )}
            {menu.type === 'node' && (
                <>
                    <button onClick={() => { onAction('edit_node', menu.targetId); onClose(); }} className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"><Edit2 size={12}/> Edit Node</button>
                    <button onClick={() => { onAction('copy', { id: menu.targetId, type: 'node' }); onClose(); }} className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"><Copy size={12}/> Copy</button>
                    <div className="h-px bg-zinc-800 my-1"/>
                    <button onClick={() => { onAction('delete_node', menu.targetId); onClose(); }} className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-900/20 flex items-center gap-2"><Trash2 size={12}/> Delete</button>
                </>
            )}
            {menu.type === 'edge' && (
                <>
                     <button onClick={() => { onAction('edit_edge', menu.targetId); onClose(); }} className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"><Edit2 size={12}/> Edit Connection</button>
                     <button onClick={() => { onAction('delete_edge', menu.targetId); onClose(); }} className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-900/20 flex items-center gap-2"><Trash2 size={12}/> Delete</button>
                </>
            )}
            {menu.type === 'scope' && (
                <>
                     <button onClick={() => { onAction('edit_scope', menu.targetId); onClose(); }} className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"><Edit2 size={12}/> Edit Scope</button>
                     <button onClick={() => { onAction('delete_scope', menu.targetId); onClose(); }} className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-900/20 flex items-center gap-2"><Trash2 size={12}/> Delete</button>
                </>
            )}
        </div>
    );
};


// --- Main Visualizer ---
interface MapVisualizerProps {
    data: MapViewData;
    isExpanded?: boolean;
    onClose?: () => void;
}

export const MapVisualizer: React.FC<MapVisualizerProps> = ({ data, isExpanded, onClose }) => {
    const { updateMap, replaceMap, settings } = useStore();
    
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    
    type Mode = 'idle' | 'panning' | 'potential_drag' | 'dragging_node' | 'dragging_scope' | 'resizing_scope' | 'connecting' | 'box_selecting';
    const [mode, setMode] = useState<Mode>('idle');
    
    const [mouseDownPos, setMouseDownPos] = useState({ x: 0, y: 0 });
    const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 });
    
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
    const [draggedItemType, setDraggedItemType] = useState<'node' | 'scope' | null>(null);
    const [resizeHandle, setResizeHandle] = useState<string | null>(null); // 'se', 'sw', etc.
    const [initialScopeGeom, setInitialScopeGeom] = useState<{x:number, y:number, w:number, h:number} | null>(null);
    const [initialChildrenGeom, setInitialChildrenGeom] = useState<Record<string, {x: number, y: number}>>({});
    
    // Store initial snapshot for diffing on drop
    const [dragStartSnapshot, setDragStartSnapshot] = useState<{nodes: MapNode[], scopes: MapScope[]} | null>(null);

    const [connectionDraft, setConnectionDraft] = useState<{ sourceId: string, sourcePort: string, currX: number, currY: number } | null>(null);
    const [boxSelectRect, setBoxSelectRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
    
    // UI States
    const [inspectorData, setInspectorData] = useState<any | null>(null);
    const [showDevTools, setShowDevTools] = useState(false);
    const [devJsonInput, setDevJsonInput] = useState('');
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [clipboard, setClipboard] = useState<{type: string, data: any} | null>(null);
    const [propertyModal, setPropertyModal] = useState<PropertyDialogState | null>(null);
    const [, forceUpdate] = useState(0);

    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // --- Helpers ---
    const getElement = useCallback((id: string) => {
        const n = data.nodes.find(node => node.id === id);
        if (n) return { ...n, w: NODE_WIDTH, h: NODE_HEIGHT, entityType: 'node' };
        const s = data.scopes.find(scope => scope.id === id);
        if (s) return { ...s, entityType: 'scope' };
        return null;
    }, [data.nodes, data.scopes]);

    // Rendered Scopes (Sorted by layer)
    const sortedScopes = useMemo(() => {
        return [...data.scopes].sort((a, b) => {
             // World first (bottom), then Region
             if (a.layer !== b.layer) return a.layer === 'WORLD' ? -1 : 1;
             // If same layer, larger one first (painter's algo)
             return (b.w * b.h) - (a.w * a.h);
        });
    }, [data.scopes]);

    useEffect(() => {
        if (isExpanded) {
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = ''; };
        }
    }, [isExpanded]);

    const toWorld = useCallback((clientX: number, clientY: number) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const rect = svgRef.current.getBoundingClientRect();
        return {
            x: (clientX - rect.left - offset.x) / scale,
            y: (clientY - rect.top - offset.y) / scale
        };
    }, [offset, scale]);

    useEffect(() => {
        if (data.nodes.length > 0 && offset.x === 0 && offset.y === 0 && containerRef.current) {
            const focusNode = data.focusId ? data.nodes.find(n => n.id === data.focusId) : data.nodes[0];
            if (focusNode) {
                setTimeout(() => {
                    if (containerRef.current) {
                         const w = containerRef.current.clientWidth || window.innerWidth;
                         const h = containerRef.current.clientHeight || window.innerHeight;
                         setOffset({ x: w / 2 - focusNode.x * scale, y: h / 2 - focusNode.y * scale });
                    }
                }, 10);
            }
        }
    }, [data.nodes, data.focusId, isExpanded]);

    // --- Actions ---

    const handleAutoArrange = () => {
        const updates = computeSmartLayout(data.nodes, data.scopes, data.edges);
        if (updates.length > 0) {
            updateMap(updates, 'user');
        }
    };

    const handleContextMenuAction = (action: string, payload: any) => {
        switch (action) {
            case 'open_create_node':
                setPropertyModal({
                    isOpen: true,
                    mode: 'create_node',
                    data: { label: 'New Node', type: 'room' },
                    position: payload // {x, y}
                });
                break;
            case 'create_scope':
                updateMap([{ op_code: 'CREATE_SCOPE', id: generateId(), label: `New ${payload.layer}`, layer: payload.layer, x: payload.x, y: payload.y }], 'user');
                break;
            case 'edit_node': {
                const n = data.nodes.find(node => node.id === payload);
                if(n) setPropertyModal({ isOpen: true, mode: 'edit_node', data: { ...n } });
                break;
            }
            case 'edit_edge': {
                const [sId, tId] = payload.split('-');
                const edge = data.edges.find(e => e.source === sId && e.target === tId);
                if(edge) setPropertyModal({ isOpen: true, mode: 'edit_edge', data: { ...edge, id: payload } });
                break;
            }
            case 'edit_scope': {
                const s = data.scopes.find(scope => scope.id === payload);
                if(s) setPropertyModal({ isOpen: true, mode: 'edit_scope', data: { ...s } });
                break;
            }
            case 'delete_node':
            case 'delete_edge':
                updateMap([{ op_code: 'DELETE_ELEMENT', element_type: action === 'delete_node' ? 'node' : 'edge', id: payload }], 'user');
                setSelectedIds(new Set());
                setInspectorData(null);
                break;
             case 'delete_scope':
                updateMap([{ op_code: 'DELETE_ELEMENT', element_type: 'scope', id: payload }], 'user');
                setSelectedIds(new Set());
                break;
            case 'copy':
                if (payload.type === 'node') {
                    const n = data.nodes.find(no => no.id === payload.id);
                    if (n) setClipboard({ type: 'node', data: n });
                }
                break;
            case 'paste':
                if (clipboard && clipboard.type === 'node') {
                    const pos = payload as { x: number, y: number };
                    updateMap([{ 
                        op_code: 'CREATE_SPOT', 
                        id: generateId(), 
                        label: clipboard.data.label + ' (Copy)', 
                        type: clipboard.data.type, 
                        x: pos.x, 
                        y: pos.y,
                        desc: clipboard.data.desc
                    }], 'user');
                }
                break;
        }
    };

    const handlePropertyConfirm = (formData: any) => {
        if (!propertyModal) return;
        const { mode, data: initialData, position } = propertyModal;

        if (mode === 'create_node') {
            updateMap([{ 
                op_code: 'CREATE_SPOT', 
                id: formData.id || generateId(), 
                label: formData.label, 
                type: formData.type, 
                x: position?.x || 0, 
                y: position?.y || 0 
            }], 'user');
        } else if (mode === 'edit_node') {
            if (formData.id !== initialData.id) {
                // Rename ID
                updateMap([{ op_code: 'RENAME_ID', oldId: initialData.id, newId: formData.id }], 'user');
            }
            updateMap([{ 
                op_code: 'UPDATE_STATE', 
                target_id: formData.id || initialData.id, // Use new ID if renamed
                changes: { label: formData.label, type: formData.type } 
            }], 'user');
        } else if (mode === 'edit_scope') {
            if (formData.id !== initialData.id) {
                updateMap([{ op_code: 'RENAME_ID', oldId: initialData.id, newId: formData.id }], 'user');
            }
            updateMap([{ 
                op_code: 'UPDATE_STATE', 
                target_id: formData.id || initialData.id,
                changes: { label: formData.label } 
            }], 'user');
        } else if (mode === 'edit_edge') {
             // Edge edit logic (delete/recreate)
             const [sId, tId] = initialData.id.split('-');
             updateMap([
                { op_code: 'DELETE_ELEMENT', element_type: 'edge', id: initialData.id },
                { 
                    op_code: 'BUILD_PATH', 
                    source: sId, 
                    target: tId, 
                    direction: initialData.direction, 
                    path_type: formData.type, 
                    is_fuzzy: formData.isFuzzy 
                }
            ], 'user');
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        const newScale = Math.min(Math.max(0.2, scale * Math.exp(delta)), 3);
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const worldX = (mouseX - offset.x) / scale;
            const worldY = (mouseY - offset.y) / scale;
            setOffset({ x: mouseX - worldX * newScale, y: mouseY - worldY * newScale });
            setScale(newScale);
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const world = toWorld(e.clientX, e.clientY);
        setMouseDownPos({ x: e.clientX, y: e.clientY });
        setContextMenu(null);

        if (e.button === 1) {
            setMode('panning');
            setDragStartOffset({ x: offset.x, y: offset.y });
            e.preventDefault();
        } 
        else if (e.button === 0) {
             setMode('box_selecting');
             setBoxSelectRect({ x: world.x, y: world.y, w: 0, h: 0 });
             if (!e.shiftKey) { setSelectedIds(new Set()); setInspectorData(null); }
        }
    };

    const handleCanvasContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        const world = toWorld(e.clientX, e.clientY);
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            type: 'canvas',
            worldPos: world
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const world = toWorld(e.clientX, e.clientY);
        const dist = Math.sqrt(Math.pow(e.clientX - mouseDownPos.x, 2) + Math.pow(e.clientY - mouseDownPos.y, 2));

        if (mode === 'panning') {
            setOffset({ x: dragStartOffset.x + (e.clientX - mouseDownPos.x), y: dragStartOffset.y + (e.clientY - mouseDownPos.y) });
        } 
        else if (mode === 'potential_drag') {
            if (dist > DRAG_THRESHOLD) {
                // Decide what we are dragging based on what was set in MouseDown
                if (draggedItemType === 'node') setMode('dragging_node');
                else if (draggedItemType === 'scope') setMode('dragging_scope');
            }
        } 
        else if (mode === 'dragging_node' && draggedItemId) {
            const node = data.nodes.find(n => n.id === draggedItemId);
            if (node) { node.x = world.x; node.y = world.y; }
            forceUpdate(n => n + 1);
        } 
        else if (mode === 'dragging_scope' && draggedItemId) {
            const scope = data.scopes.find(s => s.id === draggedItemId);
            if (scope && initialScopeGeom) {
                const dx = (e.clientX - mouseDownPos.x) / scale;
                const dy = (e.clientY - mouseDownPos.y) / scale;
                
                // Calculate new position
                let newX = initialScopeGeom.x + dx;
                let newY = initialScopeGeom.y + dy;

                // Simple collision check: Scope vs Sibling Scopes
                const rectIntersectLocal = (r1: {x:number, y:number, w:number, h:number}, r2: {x:number, y:number, w:number, h:number}) => {
                    return !(r2.x > r1.x + r1.w || r2.x + r2.w < r1.x || r2.y > r1.y + r1.h || r2.y + r2.h < r1.y);
                };

                const siblings = data.scopes.filter(s => s.id !== scope.id && s.layer === scope.layer && s.parentId === scope.parentId);
                for (const sibling of siblings) {
                    if (rectIntersectLocal({x: newX, y: newY, w: scope.w, h: scope.h}, {x: sibling.x, y: sibling.y, w: sibling.w, h: sibling.h})) {
                        // Collision! Push sibling away
                        const pushX = (newX + scope.w/2) - (sibling.x + sibling.w/2);
                        const pushY = (newY + scope.h/2) - (sibling.y + sibling.h/2);
                        
                        // Recursive move for the collided sibling
                        moveScopeRecursively(sibling.id, -pushX * 0.1, -pushY * 0.1, data.nodes, data.scopes);
                    }
                }

                // Update Parent Position
                scope.x = newX;
                scope.y = newY;

                // Move Children of Dragged Scope
                Object.entries(initialChildrenGeom).forEach(([childId, initialPos]) => {
                    const n = data.nodes.find(no => no.id === childId);
                    if (n) { n.x = initialPos.x + dx; n.y = initialPos.y + dy; }
                    else {
                        const s = data.scopes.find(so => so.id === childId);
                        if (s) { s.x = initialPos.x + dx; s.y = initialPos.y + dy; }
                    }
                });
                forceUpdate(n => n + 1);
            }
        }
        else if (mode === 'resizing_scope' && draggedItemId && resizeHandle) {
            // ... (Resizing logic same as before) ...
            const scope = data.scopes.find(s => s.id === draggedItemId);
            if (scope && initialScopeGeom) {
                 const dx = (e.clientX - mouseDownPos.x) / scale;
                 const dy = (e.clientY - mouseDownPos.y) / scale;
                 const minSize = 100;
                 if (resizeHandle === 'se') {
                     scope.w = Math.max(minSize, initialScopeGeom.w + dx);
                     scope.h = Math.max(minSize, initialScopeGeom.h + dy);
                 } else if (resizeHandle === 'sw') {
                     const newW = Math.max(minSize, initialScopeGeom.w - dx);
                     scope.x = initialScopeGeom.x + (initialScopeGeom.w - newW);
                     scope.w = newW;
                     scope.h = Math.max(minSize, initialScopeGeom.h + dy);
                 } else if (resizeHandle === 'ne') {
                     const newH = Math.max(minSize, initialScopeGeom.h - dy);
                     scope.y = initialScopeGeom.y + (initialScopeGeom.h - newH);
                     scope.h = newH;
                     scope.w = Math.max(minSize, initialScopeGeom.w + dx);
                 } else if (resizeHandle === 'nw') {
                     const newW = Math.max(minSize, initialScopeGeom.w - dx);
                     const newH = Math.max(minSize, initialScopeGeom.h - dy);
                     scope.x = initialScopeGeom.x + (initialScopeGeom.w - newW);
                     scope.y = initialScopeGeom.y + (initialScopeGeom.h - newH);
                     scope.w = newW;
                     scope.h = newH;
                 }
                 forceUpdate(n => n + 1);
            }
        }
        else if (mode === 'connecting' && connectionDraft) {
            setConnectionDraft(prev => prev ? { ...prev, currX: world.x, currY: world.y } : null);
        } 
        else if (mode === 'box_selecting' && boxSelectRect) {
            // ... (Selection logic) ...
            const anchor = toWorld(mouseDownPos.x, mouseDownPos.y);
            const minX = Math.min(anchor.x, world.x), minY = Math.min(anchor.y, world.y);
            const w = Math.abs(world.x - anchor.x), h = Math.abs(world.y - anchor.y);
            setBoxSelectRect({ x: minX, y: minY, w, h });
            const newSelection = new Set<string>();
            data.nodes.forEach(n => { if (n.x >= minX && n.x <= minX + w && n.y >= minY && n.y <= minY + h) newSelection.add(n.id); });
            setSelectedIds(newSelection);
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        const world = toWorld(e.clientX, e.clientY);
        
        // --- Global Updates Generation ---
        // Instead of only updating the dragged item, we compare the ENTIRE current state
        // against the snapshot taken at MouseDown. This captures recursive moves.
        if ((mode === 'dragging_node' || mode === 'dragging_scope' || mode === 'resizing_scope') && dragStartSnapshot) {
            const updates: any[] = [];
            
            // Check Nodes
            data.nodes.forEach(current => {
                const start = dragStartSnapshot.nodes.find(n => n.id === current.id);
                if (start && (Math.abs(start.x - current.x) > 0.1 || Math.abs(start.y - current.y) > 0.1)) {
                    updates.push({ op_code: 'UPDATE_STATE', target_id: current.id, changes: { x: current.x, y: current.y } });
                }
            });

            // Check Scopes
            data.scopes.forEach(current => {
                const start = dragStartSnapshot.scopes.find(s => s.id === current.id);
                if (start) {
                    const changed = Math.abs(start.x - current.x) > 0.1 || Math.abs(start.y - current.y) > 0.1 || Math.abs(start.w - current.w) > 0.1 || Math.abs(start.h - current.h) > 0.1;
                    if (changed) {
                        updates.push({ op_code: 'UPDATE_STATE', target_id: current.id, changes: { x: current.x, y: current.y, w: current.w, h: current.h } });
                    }
                }
            });

            // Drop Reparenting Logic (Only for the actively dragged item)
            if (mode === 'dragging_node' && draggedItemId) {
                const node = data.nodes.find(n => n.id === draggedItemId);
                if (node) {
                    const regions = data.scopes.filter(s => s.layer === 'REGION');
                    const targetRegion = regions.find(r => node.x >= r.x && node.x <= r.x + r.w && node.y >= r.y && node.y <= r.y + r.h);
                    if (targetRegion && targetRegion.id !== node.parentId) {
                        updates.push({ op_code: 'REPARENT', targetId: node.id, newParentId: targetRegion.id });
                    }
                }
            } else if (mode === 'dragging_scope' && draggedItemId) {
                const scope = data.scopes.find(s => s.id === draggedItemId);
                if (scope && scope.layer === 'REGION') {
                    const worlds = data.scopes.filter(s => s.layer === 'WORLD');
                    const targetWorld = worlds.find(w => scope.x >= w.x && scope.x + scope.w <= w.x + w.w && scope.y >= w.y && scope.y + scope.h <= w.y + w.h);
                    if (targetWorld && targetWorld.id !== scope.parentId) {
                        updates.push({ op_code: 'REPARENT', targetId: scope.id, newParentId: targetWorld.id });
                    }
                }
            }

            if (updates.length > 0) {
                updateMap(updates, 'user');
            }
        }

        // Connection Logic
        if (mode === 'connecting' && connectionDraft) {
            let targetId: string | null = null;
            const targetNode = data.nodes.find(n => Math.abs(n.x - world.x) < NODE_WIDTH/2 + 20 && Math.abs(n.y - world.y) < NODE_HEIGHT/2 + 20);
            if (targetNode) targetId = targetNode.id;
            else {
                const targetScope = [...data.scopes].reverse().find(s => world.x >= s.x && world.x <= s.x + s.w && world.y >= s.y && world.y <= s.y + s.h);
                if (targetScope) targetId = targetScope.id;
            }
            
            if (targetId && targetId !== connectionDraft.sourceId) {
                updateMap([{ op_code: 'BUILD_PATH', source: connectionDraft.sourceId, target: targetId, direction: connectionDraft.sourcePort, path_type: 'road', is_fuzzy: false }], 'user');
            }
        }

        // Reset
        setDraggedItemId(null);
        setInitialScopeGeom(null);
        setInitialChildrenGeom({});
        setDragStartSnapshot(null);
        setConnectionDraft(null);
        setBoxSelectRect(null);
        setMode('idle');
    };

    // --- Renderers ---
    const renderContent = () => (
        <div 
            ref={containerRef}
            className={`
                bg-[#0b0b15] select-none outline-none overflow-hidden
                ${isExpanded ? 'fixed inset-0 z-[9999] w-screen h-screen' : 'relative w-full h-full'}
            `}
            onContextMenu={handleCanvasContextMenu}
            tabIndex={0}
            onKeyDown={e => {
                if (e.key === 'Delete' && selectedIds.size > 0) {
                     selectedIds.forEach(id => {
                         const type = id.includes('-') ? 'edge' : (data.nodes.find(n=>n.id===id) ? 'node' : 'scope');
                         updateMap([{ op_code: 'DELETE_ELEMENT', element_type: type, id }], 'user');
                     });
                     setSelectedIds(new Set()); setInspectorData(null);
                }
            }}
        >
             {isExpanded && (
                <div className="absolute top-0 left-0 right-0 h-14 bg-black/80 backdrop-blur border-b border-white/10 flex items-center justify-between px-6 z-50 pointer-events-none">
                    <div className="flex items-center gap-2 pointer-events-auto">
                        <MapPin className="text-cyan-400"/> <span className="font-bold tracking-widest text-lg text-white">NEURAL MAP</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={onClose} className="pointer-events-auto hover:bg-white/10"><X/></Button>
                </div>
            )}
            
            <svg 
                ref={svgRef} 
                className="w-full h-full cursor-crosshair block" 
                onWheel={handleWheel} 
                onMouseDown={handleMouseDown} 
                onMouseMove={handleMouseMove} 
                onMouseUp={handleMouseUp}
            >
                <defs>
                    <pattern id="grid-pattern" width={GRID_SIZE * scale} height={GRID_SIZE * scale} patternUnits="userSpaceOnUse" x={offset.x} y={offset.y}>
                        <path d={`M ${GRID_SIZE*scale} 0 L 0 0 0 ${GRID_SIZE*scale}`} fill="none" stroke={COLORS.GRID} strokeWidth="1"/>
                    </pattern>
                    <linearGradient id="grad-z-axis" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#fbbf24" />
                        <stop offset="50%" stopColor="#f97316" />
                        <stop offset="100%" stopColor="#fbbf24" />
                    </linearGradient>
                </defs>
                <rect width="100%" height="100%" fill={COLORS.DARK_BG} />
                <rect width="100%" height="100%" fill="url(#grid-pattern)" />
                <g transform={`translate(${offset.x}, ${offset.y}) scale(${scale})`}>
                    
                    {/* 1. Render Scopes (Layers) - Manually Positioned */}
                    {sortedScopes.map(scope => (
                        <g 
                            key={scope.id} 
                            className="pointer-events-auto group/scope"
                            onMouseDown={(e) => {
                                if (e.button === 0 && !e.shiftKey) {
                                    // Only start drag if not clicking resize handle
                                    e.stopPropagation();
                                    setMode('potential_drag');
                                    setDraggedItemId(scope.id);
                                    setDraggedItemType('scope');
                                    setInitialScopeGeom({ x: scope.x, y: scope.y, w: scope.w, h: scope.h });
                                    setMouseDownPos({ x: e.clientX, y: e.clientY });
                                    
                                    // Snapshot for global diffing
                                    setDragStartSnapshot({ 
                                        nodes: JSON.parse(JSON.stringify(data.nodes)), 
                                        scopes: JSON.parse(JSON.stringify(data.scopes)) 
                                    });

                                    // Capture descendant positions for smooth drag rendering
                                    const descendants: Record<string, {x: number, y: number}> = {};
                                    const stack = [scope.id];
                                    while(stack.length > 0) {
                                        const pid = stack.pop()!;
                                        data.nodes.filter(n => n.parentId === pid).forEach(n => {
                                            descendants[n.id] = { x: n.x, y: n.y };
                                        });
                                        data.scopes.filter(s => s.parentId === pid).forEach(s => {
                                            descendants[s.id] = { x: s.x, y: s.y };
                                            stack.push(s.id);
                                        });
                                    }
                                    setInitialChildrenGeom(descendants);
                                }
                            }}
                            onContextMenu={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                setContextMenu({ x: e.clientX, y: e.clientY, type: 'scope', targetId: scope.id, worldPos: {x:0, y:0} });
                            }}
                        >
                            <rect 
                                x={scope.x} y={scope.y} width={scope.w} height={scope.h}
                                fill={scope.layer === 'WORLD' ? COLORS.WORLD_BG : COLORS.REGION_BG}
                                stroke={scope.layer === 'WORLD' ? COLORS.WORLD_BORDER : COLORS.REGION_BORDER}
                                strokeWidth={scope.layer === 'WORLD' ? 3 : 2}
                                strokeDasharray={scope.layer === 'WORLD' ? '12,6' : 'none'}
                                rx={scope.layer === 'WORLD' ? 8 : 16}
                                className="cursor-move"
                            />
                            {/* Header Label */}
                            <path d={`M ${scope.x} ${scope.y + 40} L ${scope.x + scope.w} ${scope.y + 40}`} stroke={scope.layer === 'WORLD' ? '#444' : 'rgba(0, 240, 255, 0.1)'} strokeWidth={1} fill="none" pointerEvents="none"/>
                            <text 
                                x={scope.x + 16} y={scope.y + 26} 
                                fill={scope.layer === 'WORLD' ? '#888' : COLORS.CYAN}
                                fontSize={scope.layer === 'WORLD' ? 16 : 14}
                                fontWeight="bold"
                                letterSpacing="1px"
                                opacity={0.9}
                                pointerEvents="none"
                            >
                                {scope.layer === 'WORLD' ? `◈ ${scope.label.toUpperCase()}` : scope.label.toUpperCase()}
                            </text>
                            
                            {/* Scope Ports (For Connection) */}
                            {PORTS.map(p => {
                                const pos = getPortPosition(scope.x + scope.w/2, scope.y + scope.h/2, scope.w, scope.h, p.id);
                                return (
                                    <circle 
                                        key={p.id}
                                        cx={pos.x} cy={pos.y} r={6}
                                        fill="transparent"
                                        className="hover:fill-white/50 cursor-crosshair"
                                        onMouseDown={e => {
                                            if (e.button === 0) {
                                                e.stopPropagation();
                                                setMode('connecting');
                                                setConnectionDraft({ sourceId: scope.id, sourcePort: p.id, currX: pos.x, currY: pos.y });
                                            }
                                        }}
                                    />
                                );
                            })}

                            {/* Resize Handles */}
                            <g className="opacity-0 group-hover/scope:opacity-100 transition-opacity">
                                {['nw', 'ne', 'sw', 'se'].map(corner => {
                                    let cx = scope.x, cy = scope.y;
                                    if(corner.includes('e')) cx += scope.w;
                                    if(corner.includes('s')) cy += scope.h;
                                    return (
                                        <rect 
                                            key={corner}
                                            x={cx-6} y={cy-6} width={12} height={12}
                                            fill={COLORS.SELECTED}
                                            className={`cursor-${corner}-resize`}
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                setMode('resizing_scope');
                                                setResizeHandle(corner);
                                                setDraggedItemId(scope.id);
                                                setInitialScopeGeom({ x: scope.x, y: scope.y, w: scope.w, h: scope.h });
                                                setMouseDownPos({ x: e.clientX, y: e.clientY });
                                                // Snapshot for global diffing
                                                setDragStartSnapshot({ 
                                                    nodes: JSON.parse(JSON.stringify(data.nodes)), 
                                                    scopes: JSON.parse(JSON.stringify(data.scopes)) 
                                                });
                                            }}
                                        />
                                    );
                                })}
                            </g>
                        </g>
                    ))}

                    {/* 2. Edges */}
                    {data.edges.map(e => {
                         const s = getElement(e.source);
                         const t = getElement(e.target);
                         if(!s || !t) return null;
                         
                         const edgeId = `${e.source}-${e.target}`;
                         
                         // Determine Center and Dimensions based on type
                         const sPosInfo = s.entityType === 'node' ? {x: s.x, y: s.y, w: NODE_WIDTH, h: NODE_HEIGHT} : {x: s.x + s.w/2, y: s.y + s.h/2, w: s.w, h: s.h};
                         const tPosInfo = t.entityType === 'node' ? {x: t.x, y: t.y, w: NODE_WIDTH, h: NODE_HEIGHT} : {x: t.x + t.w/2, y: t.y + t.h/2, w: t.w, h: t.h};

                         const sPos = getPortPosition(sPosInfo.x, sPosInfo.y, sPosInfo.w, sPosInfo.h, e.direction);
                         const targetPort = OPPOSITE_PORTS[e.direction] || 'N'; 
                         const tPos = getPortPosition(tPosInfo.x, tPosInfo.y, tPosInfo.w, tPosInfo.h, targetPort);
                         const d = getOrthogonalPath(sPos.x, sPos.y, tPos.x, tPos.y, e.direction);
                         
                         const isSelected = selectedIds.has(edgeId);
                         const isZAxis = e.direction === 'UP' || e.direction === 'DOWN';
                         const strokeColor = isZAxis ? 'url(#grad-z-axis)' : (EDGE_COLORS[e.type] || '#fff');
                         // Z-Axis: Thicker, specific dash pattern
                         const strokeDash = isZAxis ? '12,4,2,4' : (e.isFuzzy ? '8,4' : 'none');
                         const strokeWidth = isSelected ? 4 : (isZAxis ? 4 : 2);

                         return (
                            <g 
                                key={edgeId} 
                                onClick={ev => {ev.stopPropagation(); setSelectedIds(new Set([edgeId])); setInspectorData({id: edgeId, type:'edge', label: e.type, desc: e.label||''})}}
                                onContextMenu={ev => {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    setSelectedIds(new Set([edgeId])); 
                                    setContextMenu({ x: ev.clientX, y: ev.clientY, type: 'edge', targetId: edgeId, worldPos: {x:0,y:0} });
                                }}
                            >
                                <path 
                                    d={d} 
                                    stroke={strokeColor} 
                                    strokeWidth={strokeWidth}
                                    fill="none" 
                                    strokeDasharray={strokeDash} 
                                    opacity={isZAxis ? 1 : 0.8}
                                    className="transition-all"
                                />
                                <path d={d} stroke="transparent" strokeWidth="15" fill="none" className="cursor-pointer"/> 
                            </g>
                         );
                    })}

                    {/* 3. Draft Line */}
                    {connectionDraft && (() => {
                        const s = getElement(connectionDraft.sourceId);
                        if (!s) return null;
                        const sPosInfo = s.entityType === 'node' ? {x: s.x, y: s.y, w: NODE_WIDTH, h: NODE_HEIGHT} : {x: s.x + s.w/2, y: s.y + s.h/2, w: s.w, h: s.h};
                        const sPos = getPortPosition(sPosInfo.x, sPosInfo.y, sPosInfo.w, sPosInfo.h, connectionDraft.sourcePort);
                        const isZ = connectionDraft.sourcePort === 'UP' || connectionDraft.sourcePort === 'DOWN';

                        return (
                            <path 
                                d={getOrthogonalPath(sPos.x, sPos.y, connectionDraft.currX, connectionDraft.currY, connectionDraft.sourcePort)} 
                                stroke={isZ ? COLORS.ORANGE : COLORS.GREEN} 
                                strokeWidth="3" 
                                strokeDasharray={isZ ? "8,6" : "5,5"}
                                fill="none"
                                pointerEvents="none"
                            />
                        );
                    })()}

                    {/* 4. Nodes */}
                    {data.nodes.map(node => {
                        const isSelected = selectedIds.has(node.id);
                        const strokeColor = isSelected ? COLORS.SELECTED : (node.isFuzzy ? COLORS.MAGENTA : COLORS.CYAN);
                        return (
                            <g 
                                key={node.id} 
                                transform={`translate(${node.x}, ${node.y})`} 
                                onMouseDown={e => {
                                    if(e.button===0) {
                                        e.stopPropagation(); 
                                        setMode('potential_drag'); 
                                        setDraggedItemId(node.id); 
                                        setDraggedItemType('node');
                                        setMouseDownPos({x:e.clientX, y:e.clientY});
                                        // Snapshot
                                        setDragStartSnapshot({ 
                                            nodes: JSON.parse(JSON.stringify(data.nodes)), 
                                            scopes: JSON.parse(JSON.stringify(data.scopes)) 
                                        });
                                    }
                                }} 
                                onContextMenu={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setContextMenu({ x: e.clientX, y: e.clientY, type: 'node', targetId: node.id, worldPos: {x: node.x, y: node.y} });
                                }}
                                onMouseEnter={() => setHoveredNodeId(node.id)} 
                                onMouseLeave={() => setHoveredNodeId(null)} 
                                className="cursor-pointer group"
                            >
                                <path d={getOctagonPath(NODE_WIDTH, NODE_HEIGHT, 15)} fill={isSelected ? '#1e293b' : '#0f172a'} stroke={strokeColor} strokeWidth={isSelected ? 2 : 1}/>
                                <text y={4} fill="#e2e8f0" fontSize="10" fontWeight="bold" textAnchor="middle" style={{pointerEvents:'none'}}>{node.label}</text>
                                
                                {/* Ports */}
                                <g>
                                    {PORTS.map(p => {
                                        const px = p.type === 'planar' ? p.x * (NODE_WIDTH/2) : p.x * (NODE_WIDTH/2);
                                        const py = p.type === 'planar' ? p.y * (NODE_HEIGHT/2) : p.y * (NODE_HEIGHT/2);
                                        return (
                                            <g 
                                                key={p.id} 
                                                transform={`translate(${px}, ${py})`} 
                                                onMouseDown={e => { 
                                                    if(e.button === 0) {
                                                        e.stopPropagation(); 
                                                        setMode('connecting'); 
                                                        setConnectionDraft({ sourceId: node.id, sourcePort: p.id, currX: node.x, currY: node.y });
                                                    }
                                                }} 
                                                className="cursor-crosshair group/port"
                                            >
                                                {p.type === 'planar' ? (
                                                    <circle r={4} fill={COLORS.DARK_BG} stroke={strokeColor} strokeWidth={2} className="group-hover/port:fill-cyan-400 transition-colors"/>
                                                ) : (
                                                    <path d={p.id === 'UP' ? "M -6 6 L 6 6 L 0 -6 Z" : "M -6 -6 L 6 -6 L 0 6 Z"} fill={COLORS.ORANGE} stroke={COLORS.DARK_BG} strokeWidth={1} className="group-hover/port:scale-125 transition-transform"/>
                                                )}
                                                <circle r={14} fill="transparent" />
                                                <title>{p.id}</title>
                                            </g>
                                        );
                                    })}
                                </g>
                            </g>
                        );
                    })}
                    
                    {/* 5. Box Select */}
                    {boxSelectRect && <rect x={boxSelectRect.x} y={boxSelectRect.y} width={boxSelectRect.w} height={boxSelectRect.h} fill="rgba(0, 240, 255, 0.1)" stroke={COLORS.CYAN} strokeWidth="1" strokeDasharray="4,2"/>}
                </g>
            </svg>

            {/* Overlays */}
            <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-50 pointer-events-auto">
                 <Button size="icon" variant="secondary" className="bg-cyan-900/50 text-cyan-400 hover:bg-cyan-800 border-cyan-800" title="Auto Arrange" onClick={handleAutoArrange}><Wand2 size={18}/></Button>
                 {settings.developerMode && <Button size="icon" variant="outline" className="border-yellow-600/50 text-yellow-500 bg-black/80" onClick={() => setShowDevTools(true)}><Code size={18}/></Button>}
                 <Button variant="secondary" size="icon" onClick={() => replaceMap({scopes:[], nodes:[], edges:[]})}><Trash2 size={18}/></Button>
            </div>
            
            {inspectorData && <div className="absolute top-20 left-4 w-64 bg-zinc-900/95 border border-zinc-700 rounded shadow-xl p-4 z-50 backdrop-blur"><div className="flex justify-between items-center mb-2 pb-2 border-b border-zinc-700"><span className="font-bold text-zinc-200">{inspectorData.label}</span><button onClick={()=>setInspectorData(null)}><X size={14}/></button></div><textarea className="w-full bg-black/50 border border-zinc-700 text-xs p-2 h-20 rounded" value={inspectorData.desc} onChange={e=>{setInspectorData({...inspectorData, desc:e.target.value}); if(inspectorData.type==='node') updateMap([{op_code:'UPDATE_STATE',target_id:inspectorData.id,changes:{desc:e.target.value}}],'user');}} placeholder="Description..."/></div>}
            
            {contextMenu && <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} onAction={handleContextMenuAction} />}
            {propertyModal && <PropertyDialog state={propertyModal} onClose={() => setPropertyModal(null)} onConfirm={handlePropertyConfirm} />}
            
            {showDevTools && <div className="absolute inset-0 z-[100] bg-black/80 flex items-center justify-center p-8" onMouseDown={e=>e.stopPropagation()}><div className="bg-zinc-900 border border-yellow-600 p-6 rounded-lg w-full max-w-xl shadow-2xl relative"><button onClick={()=>setShowDevTools(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><X/></button><h3 className="text-yellow-500 font-bold mb-4">Dev Tools</h3><textarea className="w-full h-64 bg-black border border-zinc-700 text-green-400 p-4 font-mono text-xs" value={devJsonInput} onChange={e=>setDevJsonInput(e.target.value)} placeholder='{ "instructions": [] }'/><div className="flex justify-end mt-4"><Button onClick={()=>{try{updateMap(JSON.parse(devJsonInput).instructions||[],'user');setDevJsonInput('');setShowDevTools(false);}catch(e){alert('Invalid JSON')}}}>Run</Button></div></div></div>}
        </div>
    );

    if (isExpanded) {
        return createPortal(renderContent(), document.body);
    }
    return renderContent();
};