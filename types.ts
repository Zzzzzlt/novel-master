
export enum Role {
  User = 'user',
  Assistant = 'assistant',
  System = 'system'
}

export enum AppMode {
  Setting = 'settingMode',
  Body = 'bodyMode',
  Record = 'recordMode',
  Flash = 'flashMode', // New Fast Creation Mode
  Suggestion = 'suggestMode',
  Edit = 'editMode',
  Map = 'mapMode'
}

export interface MessageMetadata {
  duration?: number; // milliseconds
  memoryRounds?: number; // snapshot of N
  mode?: AppMode; // snapshot of mode used
}

export interface MessageNode {
  id: string;
  role: Role;
  content: string;
  parentId: string | null;
  childrenIds: string[];
  createdAt: number;
  // If this message was a result of a specific mode, tag it.
  mode?: AppMode;
  // For UI state (e.g., if we are waiting for a record update based on this node)
  isRecordPending?: boolean;
  // New metadata field
  metadata?: MessageMetadata;
  // Reasoning content from DeepSeek Reasoner
  reasoning?: string;
}

export interface NovelContext {
  characterList: string;
  longTermMemory: string;
  plotSummary: string;
  novelSetting: string;
}

export interface Suggestion {
  [key: string]: string; // A: "...", B: "..."
}

export interface RecordResult {
    nodeId: string;
    data: Partial<NovelContext>;
}

// --- Map Types ---

export interface MapNode {
  id: string;
  label: string;
  type: 'room' | 'landmark' | 'transit' | 'unknown';
  parentId?: string; // Scope ID
  x: number;
  y: number;
  isFuzzy: boolean;
  desc?: string;
  status?: string;
}

export interface MapEdge {
  source: string;
  target: string;
  direction: string; // N, S, E, W, etc.
  type: 'road' | 'door' | 'portal' | 'stairs';
  isFuzzy: boolean;
  label?: string;
}

export interface MapScope {
  id: string;
  label: string;
  layer: 'WORLD' | 'REGION';
  parentId?: string;
  desc?: string;
  // Geometry
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapViewData {
  scopes: MapScope[];
  nodes: MapNode[];
  edges: MapEdge[];
  focusId?: string;
}

export interface MapHistoryItem {
  id: string;
  timestamp: number;
  source: 'ai' | 'user';
  instructions: any[]; // The instructions that created this state (for AI) or description (for user)
  snapshot: MapViewData;
}

// ----------------

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  
  // The Tree Structure
  messages: Record<string, MessageNode>;
  rootNodeId: string | null;
  currentLeafId: string | null; // The node currently being viewed at the bottom

  // Local State
  context: NovelContext;
  suggestions: Suggestion | null;
  
  // Tracking for "Overwrite" logic
  lastRecordResult?: RecordResult | null;

  // Map State
  mapView: MapViewData;
  mapHistory: MapHistoryItem[];
  autoMapUpdate: boolean;
  
  // Fast Creation Mode
  flashModeEnabled: boolean;

  // Bookmarks
  bookmarkedNodeIds: string[];
}

// 模型类型
export type ModelType = 'chat' | 'reasoner';

export interface ModelParameters {
  temperature: number;       // 0-2, 默认 1.0
  topP: number;              // 0-1, 默认 1.0
  presencePenalty: number;   // -2-2, 默认 0
  frequencyPenalty: number;  // -2-2, 默认 0
  maxTokens: number;         // 最大输出token数
}

export interface AppSettings {
  apiKey: string;
  apiBaseUrl: string;
  memoryRounds: number; // N
  renderMsgLimit: number; // Max messages to render (0 = all)
  theme: 'light' | 'dark' | 'system';
  developerMode: boolean; // NEW: Toggle for debug features
  language: 'en' | 'zh'; // Language setting
  showReasoning: boolean; // 是否显示推理过程

  // 模型配置
  bodyModelType: ModelType; // 正文模式使用的模型类型
  modelParameters: ModelParameters; // 模型高级参数
}

export interface DifyInputs {
  Mode: string;
  characterList?: string;
  longTermMemory?: string;
  plotSummary?: string;
  llmMemory?: string;
  novelSetting?: string;
  latestAiReply?: string;
  suggestQuery?: string; // For suggestion mode user input
  
  // Edit Mode Inputs
  fullContext?: string;
  targetSegment?: string;
  userInstruction?: string;

  // Map Mode Inputs
  mapView?: string; // JSON string of current map
  relatedMap?: string; // Context string

  // Map Mode Input (Record Trigger)
  recentChapter?: string;

  [key: string]: any;
}

export interface DifyResponse {
  event: string;
  answer: string;
  conversation_id?: string;
  message_id?: string;
  task_id?: string;
}

export interface DialogState {
  isOpen: boolean;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'info';
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  singleButton?: boolean;
}

// Conflict Resolution Types
export enum ConflictType {
    CHARACTER = 'character',
    RECORD_OVERWRITE = 'record_overwrite'
}

export interface ConflictItem {
    id: string;
    type: ConflictType;
    title: string;
    description: string;
    // Data necessary to apply the resolution
    payload: {
        key?: string; // e.g. character name
        existingData: any; // What is currently there
        newData: any; // What came from AI
        field?: keyof NovelContext; // For context updates
    };
    onResolve: (choice: 'keep_existing' | 'use_new') => void;
}
