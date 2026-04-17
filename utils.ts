
import { MessageNode, Role, MapViewData, MapNode, MapEdge, MapScope, NovelContext } from './types';

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const getHistoryChain = (
  messages: Record<string, MessageNode>,
  leafId: string | null
): MessageNode[] => {
  if (!leafId) return [];
  
  const chain: MessageNode[] = [];
  let currentId: string | null = leafId;

  while (currentId) {
    const node = messages[currentId];
    if (!node) break;
    chain.unshift(node);
    currentId = node.parentId;
  }
  return chain;
};

export const cleanThinking = (content: string): string => {
  // Replace all occurrences of <think>...</think>, handling multi-line and case-insensitivity
  return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
};

export const formatLlmMemory = (
  history: MessageNode[], 
  memoryRounds: number
): string => {
  if (memoryRounds <= 0) {
      return "";
  }

  const limit = memoryRounds * 2;
  const recentHistory = history.slice(-limit);

  return recentHistory.map(msg => {
    const prefix = msg.role === Role.User ? 'User' : 'Assistant';
    const content = cleanThinking(msg.content);
    return `${prefix}: ${content}`;
  }).join('\n');
};

export const repairJsonString = (str: string): string => {
  try {
    JSON.parse(str);
    return str;
  } catch (e) {
    let repaired = str
      .replace(/'\s*:/g, '":')
      .replace(/:\s*'/g, ':"')
      .replace(/',\s*/g, '",')
      .replace(/'\s*\}/g, '"}')
      .replace(/\{\s*'/g, '{"')
      .replace(/\['/g, '["')
      .replace(/'\]/g, '"]');
    return repaired;
  }
};

export const parseRecordResponse = (response: string): any => {
    if (!response) return null;

    // 1. Clean <think> tags first (GLOBAL replacement)
    const cleaned = cleanThinking(response);

    // 2. Try extracting from Markdown code blocks
    // Matches ```json ... ``` or ``` ... ```
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
    const codeBlockMatch = cleaned.match(codeBlockRegex);
    if (codeBlockMatch) {
        try {
            return JSON.parse(codeBlockMatch[1]);
        } catch (e) {
            // Attempt repair on code block content
            try {
                return JSON.parse(repairJsonString(codeBlockMatch[1]));
            } catch (e2) {
                // Code block didn't contain valid JSON, continue to heuristic
            }
        }
    }

    // 3. Heuristic Extraction: Find first '{' and last '}' for objects, or '[' and ']' for arrays
    // We prioritize the structure that starts earlier in the string
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');

    let candidate = '';
    
    const hasObject = firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace;
    const hasArray = firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket;

    if (hasObject && (!hasArray || firstBrace < firstBracket)) {
        candidate = cleaned.substring(firstBrace, lastBrace + 1);
    } else if (hasArray) {
        candidate = cleaned.substring(firstBracket, lastBracket + 1);
    } else {
        // No obvious JSON wrapper found, try the raw cleaned string
        candidate = cleaned;
    }

    try {
        return JSON.parse(candidate);
    } catch (e) {
        try {
            return JSON.parse(repairJsonString(candidate));
        } catch (e2) {
            console.error("Failed to parse JSON response", e2, "Candidate:", candidate);
            return null;
        }
    }
};

export const mergeContextData = (current: NovelContext, update: Partial<NovelContext>): NovelContext => {
    return {
        ...current,
        ...update
    };
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
    // 1. Try Modern Clipboard API (Requires Secure Context: HTTPS or Localhost)
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.warn('Clipboard API failed, attempting fallback...', err);
        }
    }

    // 2. Fallback: execCommand('copy') for insecure contexts (e.g., HTTP LAN)
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        
        // Ensure it's not visible but part of DOM
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        textArea.setAttribute('readonly', ''); // Prevent keyboard showing on mobile
        
        document.body.appendChild(textArea);
        
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        return successful;
    } catch (err) {
        console.error('Fallback copy failed', err);
        return false;
    }
};

export const extractChapterTitle = (content: string): string => {
    const cleanText = cleanThinking(content);
    if (!cleanText) return "Thinking...";

    const firstLine = cleanText.split('\n').find(l => l.trim().length > 0) || "";

    // Regex for Chapter Title
    // Supports: ### 第34章, 第三十四章, 第 1 章, etc.
    const chapterRegex = /(?:^|\s|#)第\s*([0-9０-９零一二三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟]+)\s*章/;
    const match = firstLine.match(chapterRegex);

    if (match && match[1]) {
        return `第${match[1]}章`;
    }

    // Fallback: Remove symbols/punctuation and take first 5 chars
    // Simplified regex to avoid potential invalid flag/escape issues
    const cleanFallback = firstLine.replace(/[^\w\u4e00-\u9fa5]/g, '');
    return cleanFallback.substring(0, 5) || "New Entry";
};

export const generateRelatedMapString = (mapView: MapViewData): string => {
    if (!mapView || (!mapView.nodes.length && !mapView.scopes.length)) return "No map data.";
    
    const scopeDesc = mapView.scopes.map(s => `${s.label} (${s.layer})`).join(', ');
    const nodeDesc = mapView.nodes.map(n => {
        const parent = n.parentId ? ` in ${mapView.scopes.find(s => s.id === n.parentId)?.label}` : '';
        return `${n.label} (${n.type})${parent}`;
    }).join('; ');
    
    const edgeDesc = mapView.edges.map(e => {
        const s = mapView.nodes.find(n => n.id === e.source)?.label || e.source;
        const t = mapView.nodes.find(n => n.id === e.target)?.label || e.target;
        return `${s} -> ${t} [${e.type}]`;
    }).join('; ');

    return `Map Scopes: ${scopeDesc}\nNodes: ${nodeDesc}\nConnections: ${edgeDesc}`;
};

// --- Map Logic Helpers ---

const expandScopeToFit = (scopeId: string, itemRect: {x:number, y:number, w:number, h:number}, allScopes: MapScope[]) => {
    const scope = allScopes.find(s => s.id === scopeId);
    if (!scope) return;

    // Padding
    const P = 40; 
    
    let minX = scope.x;
    let minY = scope.y;
    let maxX = scope.x + scope.w;
    let maxY = scope.y + scope.h;
    
    let updated = false;

    // Check Left
    if (itemRect.x < minX + P) { minX = itemRect.x - P; updated = true; }
    // Check Right
    if (itemRect.x + itemRect.w > maxX - P) { maxX = itemRect.x + itemRect.w + P; updated = true; }
    // Check Top
    if (itemRect.y < minY + P + 40) { minY = itemRect.y - P - 40; updated = true; } // +40 for header
    // Check Bottom
    if (itemRect.y + itemRect.h > maxY - P) { maxY = itemRect.y + itemRect.h + P; updated = true; }

    if (updated) {
        scope.x = minX;
        scope.y = minY;
        scope.w = maxX - minX;
        scope.h = maxY - minY;
        
        // Recursive check upwards
        if (scope.parentId) {
            expandScopeToFit(scope.parentId, { x: scope.x, y: scope.y, w: scope.w, h: scope.h }, allScopes);
        }
    }
};

export const executeMapInstructions = (currentMap: MapViewData, instructions: any[]): MapViewData => {
    const newMap = JSON.parse(JSON.stringify(currentMap)) as MapViewData;
    
    if (!newMap.nodes) newMap.nodes = [];
    if (!newMap.edges) newMap.edges = [];
    if (!newMap.scopes) newMap.scopes = [];

    if (!Array.isArray(instructions)) return newMap;

    instructions.forEach(op => {
        // Normalize OpCode
        const code = op.op_code;
        
        // 1. CREATE / DEFINE SCOPE
        if (code === 'CREATE_SCOPE' || code === 'DEFINE_SCOPE') {
            const id = op.id || generateId();
            const exists = newMap.scopes.find(s => s.id === id);
            
            // Snake case fallback
            const parentId = op.parentId || op.parent_id;

            if (!exists) {
                // Determine Default Size/Pos if not provided
                let x = op.x !== undefined ? op.x : 0;
                let y = op.y !== undefined ? op.y : 0;
                let w = op.w || (op.layer === 'WORLD' ? 600 : 300);
                let h = op.h || (op.layer === 'WORLD' ? 400 : 200);

                // Smart Placement if Parent exists
                if (parentId) {
                    const parentScope = newMap.scopes.find(s => s.id === parentId);
                    if (parentScope) {
                        // Place inside parent with padding
                        if (op.x === undefined) x = parentScope.x + 40;
                        if (op.y === undefined) y = parentScope.y + 60;
                        
                        // Ensure parent grows
                        expandScopeToFit(parentId, {x, y, w, h}, newMap.scopes);
                    }
                }

                newMap.scopes.push({
                    id,
                    label: op.label || 'New Region',
                    layer: op.layer || 'REGION',
                    parentId,
                    desc: op.desc,
                    x, y, w, h
                });
            } else {
                 // Update existing
                 if (op.label) exists.label = op.label;
                 if (op.desc) exists.desc = op.desc;
                 if (parentId !== undefined) exists.parentId = parentId;
                 if (op.x !== undefined) exists.x = op.x;
                 if (op.y !== undefined) exists.y = op.y;
                 if (op.w !== undefined) exists.w = op.w;
                 if (op.h !== undefined) exists.h = op.h;
            }
        }

        // 2. CREATE SPOT / NODE
        else if (code === 'CREATE_SPOT') {
            const id = op.id || generateId();
            const exists = newMap.nodes.find(n => n.id === id);
            
            // Normalize snake_case
            const parentId = op.parentId || op.parent_id;
            const type = op.type || op.node_type || 'unknown';
            const isFuzzy = op.isFuzzy || op.is_fuzzy || false;

            if (!exists) {
                // Random Jitter for default positions to prevent perfect stacking
                const jitter = () => (Math.random() - 0.5) * 60;
                const x = op.x !== undefined ? op.x : (100 + jitter());
                const y = op.y !== undefined ? op.y : (100 + jitter());

                // Auto Hierarchy Logic: If creating node in void (no parentId), check for containment or create default
                let finalParentId = parentId;
                
                if (!finalParentId) {
                    // Check if x,y falls inside any existing REGION
                    const container = newMap.scopes.find(s => s.layer === 'REGION' && 
                        x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h
                    );
                    if (container) finalParentId = container.id;
                    else {
                        // Create default World & Region around this spot
                        const wId = `auto_world_${Date.now()}`;
                        const rId = `auto_region_${Date.now()}`;
                        
                        // Create World
                        newMap.scopes.push({
                            id: wId, label: 'New World', layer: 'WORLD', x: x - 150, y: y - 150, w: 450, h: 300
                        });
                        // Create Region
                        newMap.scopes.push({
                            id: rId, label: 'New Region', layer: 'REGION', parentId: wId, x: x - 100, y: y - 100, w: 300, h: 200
                        });
                        finalParentId = rId;
                    }
                } else {
                    // If explicit parent ID provided, ensure parent expands
                    expandScopeToFit(finalParentId, {x, y, w: 140, h: 60}, newMap.scopes);
                }

                newMap.nodes.push({
                    id,
                    label: op.label || 'New Spot',
                    type,
                    parentId: finalParentId,
                    x,
                    y,
                    isFuzzy,
                    desc: op.desc
                });
            } else {
                if (op.label) exists.label = op.label;
                if (type) exists.type = type;
                if (parentId) {
                    exists.parentId = parentId;
                }
                if (op.x !== undefined) exists.x = op.x;
                if (op.y !== undefined) exists.y = op.y;
                
                // If moved, check expansion
                if (exists.parentId) {
                    expandScopeToFit(exists.parentId, {x: exists.x, y: exists.y, w: 140, h: 60}, newMap.scopes);
                }
            }
        }

        // 3. BUILD PATH
        else if (code === 'BUILD_PATH') {
            const exists = newMap.edges.find(e => e.source === op.source && e.target === op.target);
            const pathInfo = op.label || op.path_info;
            const pathType = op.path_type || op.type || 'road';
            const isFuzzy = op.is_fuzzy || op.isFuzzy || false;

            if (!exists) {
                newMap.edges.push({
                    source: op.source,
                    target: op.target,
                    direction: op.direction || 'UNKNOWN',
                    type: pathType,
                    isFuzzy,
                    label: pathInfo
                });
            } else {
                if (pathInfo) exists.label = pathInfo;
                if (op.direction) exists.direction = op.direction;
            }
        }

        // 4. UPDATE STATE (Generic)
        else if (code === 'UPDATE_STATE') {
            // Can target Node or Scope
            const node = newMap.nodes.find(n => n.id === op.target_id);
            if (node && op.changes) {
                Object.assign(node, op.changes);
                // Check expansion if position changed
                if (node.parentId && (op.changes.x !== undefined || op.changes.y !== undefined)) {
                     expandScopeToFit(node.parentId, {x: node.x, y: node.y, w: 140, h: 60}, newMap.scopes);
                }
            } else {
                const scope = newMap.scopes.find(s => s.id === op.target_id);
                if (scope && op.changes) {
                    Object.assign(scope, op.changes);
                    if (scope.parentId) {
                         expandScopeToFit(scope.parentId, {x: scope.x, y: scope.y, w: scope.w, h: scope.h}, newMap.scopes);
                    }
                }
            }
        }

        // 5. RENAME_ID (Deep Update)
        else if (code === 'RENAME_ID') {
            const { oldId, newId } = op;
            if (oldId && newId && oldId !== newId) {
                // Update Node ID
                const node = newMap.nodes.find(n => n.id === oldId);
                if (node) node.id = newId;

                // Update Scope ID
                const scope = newMap.scopes.find(s => s.id === oldId);
                if (scope) scope.id = newId;

                // Update References in Nodes (ParentId)
                newMap.nodes.forEach(n => {
                    if (n.parentId === oldId) n.parentId = newId;
                });

                // Update References in Scopes (ParentId)
                newMap.scopes.forEach(s => {
                    if (s.parentId === oldId) s.parentId = newId;
                });

                // Update Edges (Source/Target)
                newMap.edges.forEach(e => {
                    if (e.source === oldId) e.source = newId;
                    if (e.target === oldId) e.target = newId;
                });
            }
        }

        // 6. DELETE
        else if (code === 'DELETE_ELEMENT') {
            if (op.element_type === 'node') {
                newMap.nodes = newMap.nodes.filter(n => n.id !== op.id);
                newMap.edges = newMap.edges.filter(e => e.source !== op.id && e.target !== op.id);
            } else if (op.element_type === 'edge') {
                 newMap.edges = newMap.edges.filter(e => `${e.source}-${e.target}` !== op.id && e.source !== op.id); // Handles both ID formats roughly
            } else if (op.element_type === 'scope') {
                // Delete scope AND cascading children? Or just unparent them?
                // Usually "Delete" implies deep delete or unparenting.
                // Let's unparent children for safety.
                newMap.scopes = newMap.scopes.filter(s => s.id !== op.id);
                newMap.nodes.forEach(n => { if (n.parentId === op.id) n.parentId = undefined; });
                newMap.scopes.forEach(s => { if (s.parentId === op.id) s.parentId = undefined; });
            }
        }
        
        // 7. REPARENT (Utility)
        else if (code === 'REPARENT') {
            // { op_code: 'REPARENT', targetId, newParentId }
            const node = newMap.nodes.find(n => n.id === op.targetId);
            if (node) {
                node.parentId = op.newParentId;
                expandScopeToFit(op.newParentId, {x: node.x, y: node.y, w: 140, h: 60}, newMap.scopes);
            }
            const scope = newMap.scopes.find(s => s.id === op.targetId);
            if (scope) {
                scope.parentId = op.newParentId;
                expandScopeToFit(op.newParentId, {x: scope.x, y: scope.y, w: scope.w, h: scope.h}, newMap.scopes);
            }
        }
    });

    return newMap;
};
