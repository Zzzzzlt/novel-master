
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppMode, AppSettings, MessageNode, MessageMetadata, NovelContext, Role, Session, Suggestion, DialogState, ConflictItem, RecordResult, MapViewData, MapHistoryItem } from '../types';
import { generateId, getHistoryChain, executeMapInstructions } from '../utils';
import { setLanguage } from '../utils/i18n';

interface State {
  settings: AppSettings;
  sessions: Session[];
  currentSessionId: string | null;
  
  // UI State for Mobile
  mobileSidebarOpen: boolean;
  mobileRightPanelOpen: boolean;
  toggleMobileSidebar: (isOpen?: boolean) => void;
  toggleMobileRightPanel: (isOpen?: boolean) => void;

  // Global UI State (Dialogs & Modals)
  showSettings: boolean;
  setShowSettings: (isOpen: boolean) => void;
  
  dialog: DialogState;
  openDialog: (options: Partial<Omit<DialogState, 'isOpen'>>) => void;
  closeDialog: () => void;

  // Conflict State
  conflicts: ConflictItem[];
  addConflict: (conflict: ConflictItem) => void;
  resolveConflict: (id: string) => void;
  clearConflicts: () => void;

  // Actions
  setSettings: (settings: Partial<AppSettings>) => void;
  createSession: (name?: string) => void;
  renameSession: (id: string, newName: string) => void;
  deleteSession: (id: string) => void;
  selectSession: (id: string) => void;
  importSession: (session: Session) => void;
  
  // Chat Actions
  addMessage: (role: Role, content: string, mode?: AppMode) => void;
  updateMessageContent: (nodeId: string, content: string) => void;
  updateMessageMetadata: (nodeId: string, metadata: Partial<MessageMetadata>) => void;
  updateContext: (context: Partial<NovelContext>) => void;
  updateSuggestions: (suggestions: Suggestion) => void;
  deleteMessage: (nodeId: string) => void;
  toggleBookmark: (nodeId: string) => void; // New Action
  
  // Tree Actions
  navigateBranch: (nodeId: string, direction: 'prev' | 'next') => void;
  editMessage: (nodeId: string, newContent: string) => void;
  regenerate: (nodeId: string) => void;
  createBranch: (nodeId: string) => void;
  jumpToMessage: (nodeId: string) => void;
  
  // Record Mode Logic
  setRecordPending: (nodeId: string, isPending: boolean) => void;
  setLastRecordResult: (result: RecordResult | null) => void;

  // Map Actions
  updateMap: (instructions: any[], source: 'ai' | 'user') => void;
  replaceMap: (newMap: MapViewData) => void;
  toggleAutoMapUpdate: (enabled?: boolean) => void;
  
  // Flash Mode
  toggleFlashMode: (enabled?: boolean) => void;
}

const DEFAULT_CONTEXT: NovelContext = {
  characterList: '',
  longTermMemory: '',
  plotSummary: '',
  novelSetting: ''
};

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  apiBaseUrl: 'https://api.deepseek.com',
  memoryRounds: 4,
  renderMsgLimit: 20,
  theme: 'system',
  developerMode: false,
  language: 'en',
  showReasoning: false,
  bodyModelType: 'chat',
  modelParameters: {
    temperature: 1.0,
    topP: 1.0,
    presencePenalty: 0,
    frequencyPenalty: 0,
    maxTokens: 4096
  }
};

const DEFAULT_MAP_VIEW: MapViewData = {
    scopes: [],
    nodes: [],
    edges: []
};

const DEFAULT_DIALOG: DialogState = {
  isOpen: false,
  title: '',
  variant: 'default',
  singleButton: false
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      sessions: [],
      currentSessionId: null,
      mobileSidebarOpen: false,
      mobileRightPanelOpen: false,

      // Global UI
      showSettings: false,
      setShowSettings: (isOpen) => set({ showSettings: isOpen }),
      
      dialog: DEFAULT_DIALOG,
      openDialog: (options) => set((state) => ({
          dialog: { ...state.dialog, ...options, isOpen: true }
      })),
      closeDialog: () => set((state) => ({
          dialog: { ...state.dialog, isOpen: false }
      })),

      // Conflict Management
      conflicts: [],
      addConflict: (conflict) => set((state) => ({ conflicts: [...state.conflicts, conflict] })),
      resolveConflict: (id) => set((state) => ({ conflicts: state.conflicts.filter(c => c.id !== id) })),
      clearConflicts: () => set({ conflicts: [] }),

      toggleMobileSidebar: (isOpen) => set((state) => ({ 
        mobileSidebarOpen: isOpen !== undefined ? isOpen : !state.mobileSidebarOpen,
        mobileRightPanelOpen: false // Close other panel
      })),
      
      toggleMobileRightPanel: (isOpen) => set((state) => ({ 
        mobileRightPanelOpen: isOpen !== undefined ? isOpen : !state.mobileRightPanelOpen,
        mobileSidebarOpen: false // Close other panel
      })),

      setSettings: (newSettings) => set((state) => {
        if (newSettings.language) {
          setLanguage(newSettings.language);
        }
        return {
          settings: { ...state.settings, ...newSettings }
        };
      }),

      createSession: (name) => {
        const newSession: Session = {
          id: generateId(),
          name: name || `Novel Project ${new Date().toLocaleDateString()}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: {},
          rootNodeId: null,
          currentLeafId: null,
          context: { ...DEFAULT_CONTEXT },
          suggestions: null,
          lastRecordResult: null,
          mapView: { ...DEFAULT_MAP_VIEW },
          mapHistory: [],
          autoMapUpdate: false,
          flashModeEnabled: false,
          bookmarkedNodeIds: []
        };
        set((state) => ({
          sessions: [newSession, ...state.sessions],
          currentSessionId: newSession.id,
          mobileSidebarOpen: false
        }));
      },

      renameSession: (id, newName) => set((state) => ({
        sessions: state.sessions.map(s => s.id === id ? { ...s, name: newName } : s)
      })),

      deleteSession: (id) => set((state) => ({
        sessions: state.sessions.filter(s => s.id !== id),
        currentSessionId: state.currentSessionId === id ? null : state.currentSessionId
      })),

      selectSession: (id) => set({ 
        currentSessionId: id,
        mobileSidebarOpen: false 
      }),

      importSession: (session) => set((state) => ({
        sessions: [session, ...state.sessions],
        currentSessionId: session.id
      })),

      addMessage: (role, content, mode) => set((state) => {
        const session = state.sessions.find(s => s.id === state.currentSessionId);
        if (!session) return state;

        const newNodeId = generateId();
        const newNode: MessageNode = {
          id: newNodeId,
          role,
          content,
          parentId: session.currentLeafId,
          childrenIds: [],
          createdAt: Date.now(),
          mode,
          metadata: {
             mode 
          }
        };

        const newMessages = { ...session.messages, [newNodeId]: newNode };

        if (session.currentLeafId) {
          const parent = newMessages[session.currentLeafId];
          if (parent) {
            newMessages[session.currentLeafId] = {
              ...parent,
              childrenIds: [...parent.childrenIds, newNodeId]
            };
          }
        }

        const updatedSession = {
          ...session,
          messages: newMessages,
          rootNodeId: session.rootNodeId || newNodeId,
          currentLeafId: newNodeId,
          updatedAt: Date.now()
        };

        return {
          sessions: state.sessions.map(s => s.id === session.id ? updatedSession : s)
        };
      }),

      updateMessageContent: (nodeId, content) => set((state) => {
        const session = state.sessions.find(s => s.id === state.currentSessionId);
        if (!session) return state;

        const node = session.messages[nodeId];
        if (!node) return state;

        return {
          sessions: state.sessions.map(s => s.id === session.id ? {
            ...s,
            messages: {
              ...s.messages,
              [nodeId]: { ...node, content }
            }
          } : s)
        };
      }),

      updateMessageMetadata: (nodeId, metadata) => set((state) => {
        const session = state.sessions.find(s => s.id === state.currentSessionId);
        if (!session) return state;

        const node = session.messages[nodeId];
        if (!node) return state;

        return {
          sessions: state.sessions.map(s => s.id === session.id ? {
            ...s,
            messages: {
              ...s.messages,
              [nodeId]: { 
                  ...node, 
                  metadata: { ...node.metadata, ...metadata } 
              }
            }
          } : s)
        };
      }),

      updateContext: (newContext) => set((state) => {
        const session = state.sessions.find(s => s.id === state.currentSessionId);
        if (!session) return state;
        return {
          sessions: state.sessions.map(s => s.id === session.id ? {
            ...s,
            context: { ...s.context, ...newContext }
          } : s)
        };
      }),

      updateSuggestions: (suggestions) => set((state) => {
        const session = state.sessions.find(s => s.id === state.currentSessionId);
        if (!session) return state;
        return {
          sessions: state.sessions.map(s => s.id === session.id ? { ...s, suggestions } : s)
        };
      }),

      deleteMessage: (nodeId) => set((state) => {
        const session = state.sessions.find(s => s.id === state.currentSessionId);
        if (!session) return state;

        const nodeToDelete = session.messages[nodeId];
        if (!nodeToDelete) return state;

        const newMessages = { ...session.messages };
        
        if (nodeToDelete.parentId) {
            const parent = newMessages[nodeToDelete.parentId];
            if (parent) {
                newMessages[nodeToDelete.parentId] = {
                    ...parent,
                    childrenIds: parent.childrenIds.filter(id => id !== nodeId)
                };
            }
        }

        let isPathActive = false;
        let pointer = session.currentLeafId;
        while(pointer) {
            if (pointer === nodeId) {
                isPathActive = true;
                break;
            }
            pointer = newMessages[pointer]?.parentId || null;
        }

        let newCurrentLeafId = session.currentLeafId;
        if (isPathActive) {
            newCurrentLeafId = nodeToDelete.parentId;
        }

        delete newMessages[nodeId];

        return {
            sessions: state.sessions.map(s => s.id === session.id ? {
                ...s,
                messages: newMessages,
                currentLeafId: newCurrentLeafId
            } : s)
        };
      }),

      toggleBookmark: (nodeId) => set((state) => {
          const session = state.sessions.find(s => s.id === state.currentSessionId);
          if (!session) return state;
          
          const bookmarks = session.bookmarkedNodeIds || [];
          const isBookmarked = bookmarks.includes(nodeId);
          const newBookmarks = isBookmarked 
              ? bookmarks.filter(id => id !== nodeId)
              : [...bookmarks, nodeId];
              
          return {
              sessions: state.sessions.map(s => s.id === session.id ? {
                  ...s,
                  bookmarkedNodeIds: newBookmarks
              } : s)
          };
      }),

      navigateBranch: (nodeId, direction) => set((state) => {
        const session = state.sessions.find(s => s.id === state.currentSessionId);
        if (!session) return state;

        const node = session.messages[nodeId];
        if (!node || !node.parentId) return state;

        const parent = session.messages[node.parentId];
        const currentIndex = parent.childrenIds.indexOf(nodeId);
        if (currentIndex === -1) return state;

        let targetSiblingId: string | null = null;
        if (direction === 'prev' && currentIndex > 0) {
          targetSiblingId = parent.childrenIds[currentIndex - 1];
        } else if (direction === 'next' && currentIndex < parent.childrenIds.length - 1) {
          targetSiblingId = parent.childrenIds[currentIndex + 1];
        }

        if (targetSiblingId) {
          let pointer = targetSiblingId;
          while(true) {
             const n = session.messages[pointer];
             if (n.childrenIds.length > 0) {
               pointer = n.childrenIds[n.childrenIds.length - 1];
             } else {
               break;
             }
          }
          
          return {
            sessions: state.sessions.map(s => s.id === session.id ? {
              ...s,
              currentLeafId: pointer
            } : s)
          };
        }
        return state;
      }),

      editMessage: (nodeId, newContent) => set((state) => {
        const session = state.sessions.find(s => s.id === state.currentSessionId);
        if (!session) return state;

        const originalNode = session.messages[nodeId];
        if (!originalNode) return state;

        const newMessageId = generateId();
        const newMessage: MessageNode = {
          ...originalNode,
          id: newMessageId,
          content: newContent,
          childrenIds: [],
          createdAt: Date.now()
        };

        const newMessages = { ...session.messages, [newMessageId]: newMessage };

        if (originalNode.parentId) {
          const parent = newMessages[originalNode.parentId];
          newMessages[originalNode.parentId] = {
            ...parent,
            childrenIds: [...parent.childrenIds, newMessageId]
          };
        }

        return {
          sessions: state.sessions.map(s => s.id === session.id ? {
            ...s,
            messages: newMessages,
            currentLeafId: newMessageId
          } : s)
        };
      }),

      createBranch: (nodeId) => set((state) => {
        const session = state.sessions.find(s => s.id === state.currentSessionId);
        if (!session) return state;

        const history = getHistoryChain(session.messages, nodeId);
        
        const newSessionId = generateId();
        const newMessages: Record<string, MessageNode> = {};
        let lastId: string | null = null;
        let rootId: string | null = null;

        history.forEach((msg, index) => {
          const cloneId = generateId();
          newMessages[cloneId] = {
            ...msg,
            id: cloneId,
            parentId: lastId,
            childrenIds: []
          };
          if (lastId) {
            newMessages[lastId].childrenIds.push(cloneId);
          }
          if (index === 0) rootId = cloneId;
          lastId = cloneId;
        });

        const newSession: Session = {
          ...session,
          id: newSessionId,
          name: `${session.name} (Branch)`,
          messages: newMessages,
          rootNodeId: rootId,
          currentLeafId: lastId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          context: { ...session.context }, // Copy context
          lastRecordResult: null,
          mapView: JSON.parse(JSON.stringify(session.mapView || DEFAULT_MAP_VIEW)),
          mapHistory: [],
          autoMapUpdate: session.autoMapUpdate,
          flashModeEnabled: session.flashModeEnabled,
          bookmarkedNodeIds: session.bookmarkedNodeIds || []
        };

        return {
          sessions: [newSession, ...state.sessions],
          currentSessionId: newSessionId
        };
      }),

      jumpToMessage: (nodeId) => set((state) => {
        const session = state.sessions.find(s => s.id === state.currentSessionId);
        if (!session || !session.messages[nodeId]) return state;
        return {
            sessions: state.sessions.map(s => s.id === session.id ? {
                ...s,
                currentLeafId: nodeId
            } : s)
        };
      }),

      regenerate: (nodeId) => set((state) => state),

      setRecordPending: (nodeId, isPending) => set((state) => {
        const session = state.sessions.find(s => s.id === state.currentSessionId);
        if (!session) return state;
        
        const node = session.messages[nodeId];
        if(!node) return state;

        return {
           sessions: state.sessions.map(s => s.id === session.id ? {
             ...s,
             messages: {
               ...s.messages,
               [nodeId]: { ...node, isRecordPending: isPending }
             }
           } : s)
        };
      }),

      setLastRecordResult: (result) => set((state) => {
          const session = state.sessions.find(s => s.id === state.currentSessionId);
          if (!session) return state;
          return {
              sessions: state.sessions.map(s => s.id === session.id ? { ...s, lastRecordResult: result } : s)
          };
      }),

      // --- Map Actions ---

      updateMap: (instructions, source) => set((state) => {
        const session = state.sessions.find(s => s.id === state.currentSessionId);
        if (!session) return state;

        const currentMap = session.mapView || DEFAULT_MAP_VIEW;
        const newMap = executeMapInstructions(currentMap, instructions);
        
        // Create history entry
        const historyItem: MapHistoryItem = {
            id: generateId(),
            timestamp: Date.now(),
            source,
            instructions,
            snapshot: JSON.parse(JSON.stringify(currentMap)) // Store state BEFORE change
        };

        // Maintain 15 items limit
        const newHistory = [historyItem, ...session.mapHistory].slice(0, 15);

        return {
            sessions: state.sessions.map(s => s.id === session.id ? {
                ...s,
                mapView: newMap,
                mapHistory: newHistory
            } : s)
        };
      }),

      replaceMap: (newMap) => set((state) => {
          const session = state.sessions.find(s => s.id === state.currentSessionId);
          if (!session) return state;
          return {
              sessions: state.sessions.map(s => s.id === session.id ? {
                  ...s,
                  mapView: newMap
              } : s)
          };
      }),

      toggleAutoMapUpdate: (enabled) => set((state) => {
          const session = state.sessions.find(s => s.id === state.currentSessionId);
          if (!session) return state;
          return {
              sessions: state.sessions.map(s => s.id === session.id ? {
                  ...s,
                  autoMapUpdate: enabled !== undefined ? enabled : !s.autoMapUpdate
              } : s)
          };
      }),
      
      toggleFlashMode: (enabled) => set((state) => {
          const session = state.sessions.find(s => s.id === state.currentSessionId);
          if (!session) return state;
          return {
              sessions: state.sessions.map(s => s.id === session.id ? {
                  ...s,
                  flashModeEnabled: enabled !== undefined ? enabled : !s.flashModeEnabled
              } : s)
          };
      })

    }),
    {
      name: 'dify-novelist-storage',
      partialize: (state) => ({ 
        settings: state.settings,
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
        conflicts: [] 
      }),
    }
  )
);
