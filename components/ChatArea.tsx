
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useStore } from '../store/useStore';
import { AppMode, MessageNode, Role, ConflictType, ConflictItem } from '../types';
import { getHistoryChain, formatLlmMemory, parseRecordResponse, cleanThinking, mergeContextData, copyToClipboard, extractChapterTitle, generateRelatedMapString } from '../utils';
import { callAI, streamAI } from '../services/aiService';
import { authService } from '../services/auth';
import { Button } from './ui/Button';
import { MessageBubble } from './MessageBubble';
import { CanvasEditor } from './CanvasEditor';
import {
  Send, ArrowDown, Menu, Info, Square, MessageSquarePlus, ArrowUpToLine, ArrowUp, X, Sparkles, Loader2, Star, Book
} from 'lucide-react';
import { t } from '../utils/i18n';

// Type for the compass markers
interface ChapterMarker {
    nodeId: string;
    index: number;
    label: string;
    isBookmarked: boolean;
}

export const ChatArea: React.FC = () => {
  const { 
    sessions, 
    currentSessionId, 
    settings, 
    addMessage, 
    updateMessageContent,
    updateMessageMetadata,
    deleteMessage,
    navigateBranch, 
    editMessage, 
    createBranch,
    setRecordPending,
    updateContext,
    updateSuggestions,
    toggleMobileSidebar,
    toggleMobileRightPanel,
    openDialog,
    setShowSettings,
    addConflict,
    conflicts,
    setLastRecordResult,
    jumpToMessage,
    updateMap,
    toggleBookmark
  } = useStore();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [canvasNodeId, setCanvasNodeId] = useState<string | null>(null);

  const [mode, setMode] = useState<AppMode>(AppMode.Body);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedToSettingId, setSavedToSettingId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  // Citation Logic State
  const [showCitationMenu, setShowCitationMenu] = useState(false);
  
  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const navScrollRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const atBottomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll State Logic
  const [atBottom, setAtBottom] = useState(false); 
  const atBottomRef = useRef(false); 
  
  const [isScrollingUp, setIsScrollingUp] = useState(false);
  const [isIdle, setIsIdle] = useState(false); // No scroll activity for 3s
  const [firstVisibleIndex, setFirstVisibleIndex] = useState(0);

  // Compass Navigation State
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [showCompass, setShowCompass] = useState(false);
  const compassTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Navigation Lock: Prevents scroll events from overwriting active state during a click-jump
  const isNavigatingViaClick = useRef(false);
  const navigationLockTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Physics & Drag State for Compass
  const [isNavDragging, setIsNavDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false); // Distinguish click vs drag
  
  // Inertia Refs
  const navState = useRef({
      isDown: false,
      isMomentum: false, 
      startX: 0,
      scrollLeft: 0,
      velocity: 0,
      lastPageX: 0,
      lastTime: 0,
      animationFrameId: 0
  });

  const session = sessions.find(s => s.id === currentSessionId);
  
  // Memoize history
  const history = useMemo(() => {
    return session ? getHistoryChain(session.messages, session.currentLeafId) : [];
  }, [session?.messages, session?.currentLeafId]);

  // Apply Render Limit (Slicing) for Performance
  const visibleHistory = useMemo(() => {
      if (settings.renderMsgLimit > 0 && history.length > settings.renderMsgLimit) {
          return history.slice(-settings.renderMsgLimit);
      }
      return history;
  }, [history, settings.renderMsgLimit]);

  const hasPendingRecord = useMemo(() => {
      return visibleHistory.some(n => n.isRecordPending);
  }, [visibleHistory]);

  // --- Calculate Chapter Markers for Compass ---
  const chapterMarkers = useMemo<ChapterMarker[]>(() => {
      if (!session) return [];
      const bookmarks = session.bookmarkedNodeIds || [];

      // Setting Mode: Unified Index
      if (mode === AppMode.Setting) {
          if (visibleHistory.length > 0) {
              return [{
                  nodeId: visibleHistory[0].id,
                  index: 0,
                  label: t('bookmark.setting'),
                  isBookmarked: false
              }];
          }
          return [];
      }

      // Story Mode: Extract Chapters
      const markers: ChapterMarker[] = [];
      visibleHistory.forEach((node, idx) => {
          // Identify Chapter Start: Assistant Role + Body Mode
          if (node.role === Role.Assistant) {
             const label = extractChapterTitle(node.content);
             markers.push({
                 nodeId: node.id,
                 index: idx,
                 label: label,
                 isBookmarked: bookmarks.includes(node.id)
             });
          }
      });
      return markers;
  }, [visibleHistory, mode, session]);

  // Keep a ref to visibleHistory for event handlers
  const visibleHistoryRef = useRef<MessageNode[]>([]);
  useEffect(() => { visibleHistoryRef.current = visibleHistory; }, [visibleHistory]);

  // --- Effects ---
  useEffect(() => {
      const checkMobile = () => setIsMobile(window.matchMedia("(pointer:coarse)").matches || window.innerWidth < 768);
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle Session Switch: Set Mode and Scroll
  useEffect(() => {
    if (session) {
        if (Object.keys(session.messages).length === 0) {
            setMode(AppMode.Setting);
        } else {
            setMode(AppMode.Body);
        }

        const scroll = () => {
             virtuosoRef.current?.scrollToIndex({
                 index: visibleHistory.length - 1, 
                 align: 'end',
                 behavior: 'auto'
             });
        };
        const t1 = setTimeout(scroll, 50);
        const t2 = setTimeout(scroll, 200); 
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [currentSessionId]); 

  // --- Sync Nav Bar to Active Marker (Auto-Center) ---
  // Only scroll the Nav Bar if the user is NOT interacting with it.
  useEffect(() => {
    if (activeMarkerId && navScrollRef.current && !navState.current.isDown && !navState.current.isMomentum) {
        const activeEl = document.getElementById(`nav-marker-${activeMarkerId}`);
        if (activeEl) {
            activeEl.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }
    }
  }, [activeMarkerId]);

  // Listen for suggestions click
  useEffect(() => {
    const handleSuggestion = (e: any) => {
        setInput(e.detail);
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
                textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 208)}px`;
            }
        }, 0);
    };
    window.addEventListener('insertSuggestion', handleSuggestion);
    return () => window.removeEventListener('insertSuggestion', handleSuggestion);
  }, []);

  // --- Visibility Logic for Compass ---
  const activateCompass = useCallback(() => {
      if (chapterMarkers.length === 0) return;
      setShowCompass(true);
      if (compassTimeoutRef.current) clearTimeout(compassTimeoutRef.current);
      compassTimeoutRef.current = setTimeout(() => {
          if (!navState.current.isDown && !navState.current.isMomentum) {
              setShowCompass(false);
          }
      }, 3000);
  }, [chapterMarkers.length]);

  // --- Main Chat Scroll Handlers ---

  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    const currentScrollTop = target.scrollTop;
    
    activateCompass();
    
    if (currentScrollTop < 0) return;

    if (currentScrollTop < lastScrollTopRef.current - 10) { 
        setIsScrollingUp(true);
        setIsIdle(false);
    } else if (currentScrollTop > lastScrollTopRef.current + 10) {
        setIsScrollingUp(false);
        setIsIdle(false);
    }
    
    lastScrollTopRef.current = currentScrollTop;

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
        setIsIdle(true);
    }, 3000);

  }, [activateCompass]);

  const handleAtBottomStateChange = useCallback((isBottom: boolean) => {
      atBottomRef.current = isBottom;
      if (atBottomTimeoutRef.current) clearTimeout(atBottomTimeoutRef.current);

      if (isBottom) {
          setAtBottom(true);
      } else {
          atBottomTimeoutRef.current = setTimeout(() => {
              setAtBottom(false);
          }, 150);
      }
  }, []);

  // --- Detect Active Chapter from Viewport ---
  const handleRangeChanged = useCallback((range: { startIndex: number, endIndex: number }) => {
      setFirstVisibleIndex(range.startIndex);

      // CRITICAL: Block update if we are in the middle of a click-based navigation
      if (isNavigatingViaClick.current) return;
      // Block update if user is dragging/scrolling the nav bar manually to prevent jumpy loops
      if (navState.current.isDown || navState.current.isMomentum) return;

      const thresholdIndex = range.startIndex + 2;

      if (chapterMarkers.length > 0) {
          let currentMarker = chapterMarkers[0];
          
          for (let i = 0; i < chapterMarkers.length; i++) {
              if (chapterMarkers[i].index <= thresholdIndex) { 
                  currentMarker = chapterMarkers[i];
              } else {
                  break; 
              }
          }
          
          setActiveMarkerId(prev => prev !== currentMarker.nodeId ? currentMarker.nodeId : prev);
      }
  }, [chapterMarkers]);

  const scrollToBottom = useCallback((instant: boolean = false) => {
     const targetIndex = visibleHistoryRef.current.length - 1;
     virtuosoRef.current?.scrollToIndex({ 
         index: targetIndex >= 0 ? targetIndex : 0,
         align: 'end', 
         behavior: instant ? 'auto' : 'smooth' 
     });
     setIsScrollingUp(false);
     setIsIdle(false);
  }, []);

  const scrollToTop = () => {
     virtuosoRef.current?.scrollToIndex({ index: 0, align: 'start', behavior: 'smooth' });
  };

  const scrollToPrevious = () => {
     const targetIndex = Math.max(0, firstVisibleIndex - 1);
     virtuosoRef.current?.scrollToIndex({ index: targetIndex, align: 'start', behavior: 'smooth' });
  };

  const scrollToMarker = (index: number) => {
      virtuosoRef.current?.scrollToIndex({ index, align: 'start', behavior: 'smooth' });
  };

  // --- COMPASS PHYSICS & INTERACTION ---

  // Helper: Find closest marker to the visual center of the Nav Bar
  const findClosestMarkerToNavCenter = () => {
    if (!navScrollRef.current) return null;
    const container = navScrollRef.current;
    const center = container.scrollLeft + container.clientWidth / 2;
    
    let closestId: string | null = null;
    let minDiff = Infinity;

    const markers = container.querySelectorAll('[id^="nav-marker-"]');
    markers.forEach((el) => {
        if (el instanceof HTMLElement) {
             const elCenter = el.offsetLeft + el.offsetWidth / 2;
             const diff = Math.abs(elCenter - center);
             if (diff < minDiff) {
                 minDiff = diff;
                 closestId = el.id.replace('nav-marker-', '');
             }
        }
    });
    return closestId;
  };

  const updateActiveFromNavPosition = () => {
      const closestId = findClosestMarkerToNavCenter();
      if (closestId) {
          setActiveMarkerId(closestId);
      }
  };

  const snapToNearest = () => {
    if (!navScrollRef.current) return;
    
    navState.current.isMomentum = false;
    
    const closestId = findClosestMarkerToNavCenter();

    if (closestId) {
        setActiveMarkerId(closestId);
        
        isNavigatingViaClick.current = true;
        
        const marker = chapterMarkers.find(m => m.nodeId === closestId);
        if (marker) {
            scrollToMarker(marker.index);
        }
        
        if (navigationLockTimeout.current) clearTimeout(navigationLockTimeout.current);
        navigationLockTimeout.current = setTimeout(() => {
            isNavigatingViaClick.current = false;
        }, 800); 
    }
  };

  const stopMomentum = () => {
      if (navState.current.animationFrameId) {
          cancelAnimationFrame(navState.current.animationFrameId);
          navState.current.animationFrameId = 0;
      }
      navState.current.isMomentum = false;
  };

  const startMomentumLoop = () => {
      stopMomentum();
      navState.current.isMomentum = true;
      
      const loop = () => {
          if (!navScrollRef.current) return;
          
          navState.current.velocity *= 0.92; // Friction
          
          if (Math.abs(navState.current.velocity) > 0.5) {
              navScrollRef.current.scrollLeft -= navState.current.velocity;
              updateActiveFromNavPosition(); // Visual feedback during inertia
              navState.current.animationFrameId = requestAnimationFrame(loop);
          } else {
              navState.current.velocity = 0;
              snapToNearest();
          }
      };
      
      navState.current.animationFrameId = requestAnimationFrame(loop);
  };

  const onNavMouseDown = (e: React.MouseEvent) => {
      if (!navScrollRef.current) return;
      navState.current.isDown = true;
      navState.current.startX = e.pageX - navScrollRef.current.offsetLeft;
      navState.current.scrollLeft = navScrollRef.current.scrollLeft;
      navState.current.lastPageX = e.pageX;
      navState.current.lastTime = Date.now();
      navState.current.velocity = 0;
      
      stopMomentum(); 
      setIsNavDragging(true);
      setHasMoved(false);
      activateCompass();
  };
  
  const onNavMouseLeave = () => {
      if (navState.current.isDown) {
         navState.current.isDown = false;
         setIsNavDragging(false);
         startMomentumLoop();
      }
  };
  
  const onNavMouseUp = () => {
      if (navState.current.isDown) {
         navState.current.isDown = false;
         setIsNavDragging(false);
         startMomentumLoop();
      }
  };
  
  const onNavMouseMove = (e: React.MouseEvent) => {
      if (!navState.current.isDown || !navScrollRef.current) return;
      e.preventDefault();
      
      const x = e.pageX - navScrollRef.current.offsetLeft;
      const walk = (x - navState.current.startX) * 1.0; 
      
      const now = Date.now();
      const dt = now - navState.current.lastTime;
      const dx = e.pageX - navState.current.lastPageX;
      
      if (dt > 0) {
          navState.current.velocity = dx; 
      }
      
      navState.current.lastPageX = e.pageX;
      navState.current.lastTime = now;
      
      if (Math.abs(walk) > 5) setHasMoved(true); 
      
      navScrollRef.current.scrollLeft = navState.current.scrollLeft - walk;
      updateActiveFromNavPosition(); 
      activateCompass(); 
  };

  const onMarkerClick = (marker: ChapterMarker) => {
      if (!hasMoved) { 
          stopMomentum();
          
          isNavigatingViaClick.current = true;
          
          setActiveMarkerId(marker.nodeId);
          scrollToMarker(marker.index);
          
          if (navigationLockTimeout.current) clearTimeout(navigationLockTimeout.current);
          navigationLockTimeout.current = setTimeout(() => {
              isNavigatingViaClick.current = false;
          }, 800); 
      }
  };

  // --- Button Visibility Logic ---

  const showNavControls = useMemo(() => {
      return isScrollingUp && !isIdle;
  }, [isScrollingUp, isIdle]);

  const showScrollButton = useMemo(() => {
      if (atBottom) return false;
      if (loading) return true;
      if (isScrollingUp || isIdle) return false;
      return true;
  }, [atBottom, loading, isScrollingUp, isIdle]);


  // --- Actions ---
  
  const handleCopy = useCallback(async (id: string, content: string) => {
      const textToCopy = cleanThinking(content);
      const success = await copyToClipboard(textToCopy);
      if (success) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }
  }, []);

  const handleAddToSetting = useCallback((id: string, content: string) => {
      if (!session) return;
      const cleanContent = cleanThinking(content);
      const currentSetting = session.context.novelSetting || '';
      
      const newSetting = currentSetting 
        ? `${currentSetting}\n\n${cleanContent}` 
        : cleanContent;
        
      updateContext({ novelSetting: newSetting });
      
      setSavedToSettingId(id);
      setTimeout(() => setSavedToSettingId(null), 2000);
  }, [session, updateContext]);

  const handleStop = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
    }
  };

  const handleDelete = useCallback((nodeId: string) => {
      openDialog({
          title: t('dialog.deleteTitle'),
          description: t('dialog.deleteDesc'),
          variant: 'destructive',
          confirmLabel: t('dialog.delete'),
          onConfirm: () => deleteMessage(nodeId)
      });
  }, [deleteMessage, openDialog]);

  const handleBranch = useCallback((nodeId: string) => {
      createBranch(nodeId);
  }, [createBranch]);

  const handleNavigate = useCallback((nodeId: string, direction: 'prev' | 'next') => {
      navigateBranch(nodeId, direction);
  }, [navigateBranch]);

  const handleEditStart = useCallback((nodeId: string) => {
      // Find the index of the node being edited
      const nodeIndex = visibleHistory.findIndex(n => n.id === nodeId);
      if (nodeIndex >= 0 && virtuosoRef.current) {
          // Scroll to the editing node, position it at the top of viewport with smooth behavior
          virtuosoRef.current.scrollToIndex({
              index: nodeIndex,
              align: 'start',
              behavior: 'smooth'
          });
      }
      setEditingNodeId(nodeId);
  }, [visibleHistory]);

  const handleEditCancel = useCallback((nodeId?: string) => {
      setEditingNodeId(null);
  }, []);
  
  const handleCanvasStart = useCallback((nodeId: string) => {
      setCanvasNodeId(nodeId);
  }, []);

  const handleCanvasSave = useCallback((content: string) => {
      if (canvasNodeId) {
          updateMessageContent(canvasNodeId, content);
          setCanvasNodeId(null);
      }
  }, [canvasNodeId, updateMessageContent]);
  
  const handleCanvasCancel = useCallback(() => {
      setCanvasNodeId(null);
  }, []);

  const checkApiKey = useCallback(() => {
      // 优先使用设置中的 API Key，如果没有则使用环境变量
      const apiKey = settings.apiKey || import.meta.env.VITE_DEEPSEEK_API_KEY;
      if (!apiKey) {
          openDialog({
              title: t('dialog.apiRequired'),
              description: t('dialog.apiDesc'),
              confirmLabel: t('dialog.openSettings'),
              variant: 'default',
              onConfirm: () => setShowSettings(true)
          });
          return false;
      }
      return true;
  }, [settings.apiKey, openDialog, setShowSettings]);

  // Polish (Runse) Functionality
  const handlePolish = useCallback(async () => {
      if (!input.trim() || loading || !session) return;
      if (!checkApiKey()) return;

      setLoading(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      
      const originalInput = input;
      setInput(''); 
      let currentPolished = '';

      try {
          const variables = {
              Mode: AppMode.Edit,
              targetSegment: originalInput,
              userInstruction: "Polish this text",
              novelSetting: session.context.novelSetting,
              fullContext: '',
              characterList: session.context.characterList,
              plotSummary: session.context.plotSummary,
              longTermMemory: session.context.longTermMemory
          };

          await streamAI(
              AppMode.Edit,
              'Polish this text',
              variables,
              {
                  onChunk: (chunk) => {
                      currentPolished += chunk;
                      setInput(currentPolished);
                      if(textareaRef.current) {
                        textareaRef.current.style.height = 'auto';
                        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 208)}px`;
                      }
                  },
                  onComplete: () => {
                      setLoading(false);
                      abortControllerRef.current = null;
                  },
                  onError: (err) => {
                      console.error(err);
                      setInput(originalInput);
                  }
              },
              controller.signal,
              settings.modelParameters,
              settings.bodyModelType
          );
      } catch (e: any) {
          if (e.name !== 'AbortError') {
             setInput(originalInput);
             openDialog({
                 title: t('dialog.polishFailed'),
                 description: e.message,
                 singleButton: true,
                 variant: 'destructive'
             });
          }
      } finally {
          setLoading(false);
          abortControllerRef.current = null;
      }

  }, [input, loading, session, checkApiKey, settings, openDialog]);

  const handleRecordAnalysis = useCallback(async (nodeId: string, content: string, analysisMode: AppMode = AppMode.Record) => {
    if (loading) return; 
    if (!checkApiKey()) return;

    if (!session) return;
    setLoading(true);
    setRecordPending(nodeId, true);
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const freshState = useStore.getState();
      const currentSession = freshState.sessions.find(s => s.id === currentSessionId);
      if (!currentSession) return;

      const cleanedContent = cleanThinking(content);

      // Get history chain to calculate recentChapter
      const chain = getHistoryChain(currentSession.messages, nodeId);
      const historyBefore = chain.slice(0, -1);
      
      const recentAiNodes = historyBefore
          .filter(node => node.role === Role.Assistant)
          .slice(-4);
      
      const recentChapter = recentAiNodes
          .map(node => cleanThinking(node.content))
          .join('\n\n');

      const variables = {
        Mode: analysisMode,
        novelSetting: currentSession.context.novelSetting,
        characterList: currentSession.context.characterList,
        latestAiReply: cleanedContent,
        recentChapter: recentChapter,
        sys: { query: 'start' }
      };

      const response = await callAI(analysisMode, 'start', variables, controller.signal, settings.modelParameters, settings.bodyModelType);

      const parsed = parseRecordResponse(response.answer);
      if (parsed && parsed.record) {
         
         const conflictsFound: ConflictItem[] = [];
         const newRecord = parsed.record;
         const currentContext = currentSession.context;
         
         const getEntryKey = (text: string) => {
             const match = text.match(/^([^|:：]+)(?:[|:：])/);
             return match ? match[1].trim() : null;
         };

         // 1. Plot & Memory Conflicts
         ['plotSummary', 'longTermMemory'].forEach(fieldKey => {
             const key = fieldKey as 'plotSummary' | 'longTermMemory';
             if (newRecord[key]) {
                 // Prevent Type Error Crash: Ensure it's a string
                 if (typeof newRecord[key] !== 'string') {
                     newRecord[key] = typeof newRecord[key] === 'object' ? JSON.stringify(newRecord[key]) : String(newRecord[key]);
                 }

                 const newLines: string[] = newRecord[key].split('\n').filter((l: string) => l.trim());
                 const currentLines: string[] = (currentContext[key] || '').split('\n').filter((l: string) => l.trim());
                 const safeNewLines: string[] = [];

                 newLines.forEach((newLine) => {
                     const entryKey = getEntryKey(newLine);
                     const existingLine = entryKey 
                        ? currentLines.find(cl => getEntryKey(cl) === entryKey)
                        : null;

                     if (existingLine) {
                         conflictsFound.push({
                             id: Date.now() + Math.random().toString(),
                             type: ConflictType.RECORD_OVERWRITE,
                             title: `Conflict: ${key === 'plotSummary' ? 'Plot' : 'Memory'} - ${entryKey}`,
                             description: `An entry for "${entryKey}" already exists. Do you want to overwrite it?`,
                             payload: {
                                 field: key,
                                 existingData: existingLine,
                                 newData: newLine
                             },
                             onResolve: (choice) => {
                                 if (choice === 'use_new') {
                                     const freshCtx = useStore.getState().sessions.find(s => s.id === currentSessionId)?.context;
                                     if (!freshCtx) return;
                                     const freshText = freshCtx[key] || '';
                                     
                                     const lines = freshText.split('\n');
                                     const updatedLines = lines.map(l => {
                                         if (getEntryKey(l) === entryKey) return newLine;
                                         return l;
                                     });
                                     
                                     updateContext({ [key]: updatedLines.join('\n') });
                                 }
                             }
                         });
                     } else {
                         safeNewLines.push(newLine);
                     }
                 });

                 if (safeNewLines.length > 0) {
                     // FIX: Append to existing, do not overwrite
                     const existingContent = currentContext[key] || '';
                     const newContent = safeNewLines.join('\n');
                     newRecord[key] = existingContent.trim() ? `${existingContent}\n${newContent}` : newContent;
                 } else {
                     delete newRecord[key];
                 }
             }
         });


         // 2. Character Conflict Check
         if (newRecord.characterList) {
             let existingList: any[] = [];
             try { existingList = JSON.parse(currentContext.characterList || '[]'); } catch(e){}
             
             let newList: any[] = [];
             if (Array.isArray(newRecord.characterList)) newList = newRecord.characterList;
             // Safe parse for non-array input
             else if (typeof newRecord.characterList === 'string') {
                 try { newList = JSON.parse(newRecord.characterList); } catch(e){}
             } 
             else if (typeof newRecord.characterList === 'object' && newRecord.characterList !== null) {
                 // Try to recover if it's an object (single character?)
                 newList = [newRecord.characterList];
             }

             if (!Array.isArray(newList)) newList = []; // Fallback

             const safeNewList: any[] = [];
             
             newList.forEach((newChar: any) => {
                 // Safety check for malformed character objects
                 if (typeof newChar !== 'object' || newChar === null) return;

                 const newName = Object.keys(newChar)[0];
                 const existingChar = existingList.find((c: any) => Object.keys(c)[0] === newName);
                 
                 if (existingChar) {
                     conflictsFound.push({
                         id: Date.now() + Math.random().toString(),
                         type: ConflictType.CHARACTER,
                         title: `Character Conflict: ${newName}`,
                         description: `A character named "${newName}" already exists. Choose which version to keep.`,
                         payload: {
                             key: newName,
                             existingData: existingChar,
                             newData: newChar
                         },
                         onResolve: (choice) => {
                             if (choice === 'use_new') {
                                 const freshCtx = useStore.getState().sessions.find(s=>s.id===currentSessionId)?.context;
                                 let freshList: any[] = [];
                                 try { freshList = JSON.parse(freshCtx?.characterList || '[]'); } catch(e){}
                                 
                                 const updatedList = freshList.map(c => Object.keys(c)[0] === newName ? newChar : c);
                                 updateContext({ characterList: JSON.stringify(updatedList, null, 2) });
                             }
                         }
                     });
                 } else {
                     safeNewList.push(newChar);
                 }
             });
             
             // FIX: Append new characters to existing list
             newRecord.characterList = JSON.stringify([...existingList, ...safeNewList], null, 2);
         }

         conflictsFound.forEach(addConflict);

         if (parsed.record) {
             const mergedUpdates = mergeContextData(useStore.getState().sessions.find(s=>s.id===currentSessionId)?.context || currentContext, newRecord);
             updateContext(mergedUpdates);
         }
         
         setLastRecordResult({ nodeId, data: parsed.record });

         // --- MAP AUTO UPDATE TRIGGER ---
         const freshSession = useStore.getState().sessions.find(s => s.id === currentSessionId);
         if (freshSession?.autoMapUpdate) {
             // We trigger map update silently
             setTimeout(async () => {
                 try {
                     const mapVariables = {
                         Mode: AppMode.Map,
                         novelSetting: freshSession.context.novelSetting,
                         latestAiReply: cleanedContent,
                         mapView: JSON.stringify(freshSession.mapView)
                     };

                     // Don't use main loading state, use a separate toast or indicator if needed
                     // Or use a lightweight "syncing" state in the Map visualizer
                     const mapRes = await callAI(AppMode.Map, 'auto_map_update', mapVariables, undefined, settings.modelParameters, settings.bodyModelType);
                     const mapParsed = parseRecordResponse(mapRes.answer);
                     if (mapParsed && mapParsed.instructions) {
                         updateMap(mapParsed.instructions, 'ai');
                     }
                 } catch (e) {
                     console.warn("Auto Map Update failed", e);
                 }
             }, 100);
         }

      } else {
        openDialog({
            title: "Analysis Error",
            description: "Failed to parse the record response from AI.",
            singleButton: true,
            variant: 'destructive'
        });
      }
      
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        openDialog({
            title: "Connection Failed",
            description: `Analysis failed: ${e.message}`,
            singleButton: true,
            variant: 'destructive'
        });
      }
    } finally {
      setLoading(false);
      setRecordPending(nodeId, false);
      abortControllerRef.current = null;
    }
  }, [session, loading, currentSessionId, settings, setRecordPending, updateContext, updateSuggestions, checkApiKey, openDialog, addConflict, setLastRecordResult, updateMap]);


  const handleSend = useCallback(async (overrideQuery?: string, overrideMode?: AppMode) => {
    if (conflicts.length > 0) {
        openDialog({
            title: t('dialog.pendingConflicts'),
            description: t('dialog.conflictsDesc'),
            singleButton: true,
            variant: 'info'
        });
        return;
    }

    if ((!input.trim() && !overrideQuery) || !session || loading) return;

    // 检查用户是否已登录
    if (!authService.isAuthenticated()) {
        openDialog({
            title: '请先登录',
            description: '使用AI服务需要先登录您的账户',
            singleButton: true,
            variant: 'warning'
        });
        return;
    }

    // 检查 Body 模式使用次数限制
    if (mode === AppMode.Body) {
        const bodyCheck = authService.canUseBodyMode();
        if (!bodyCheck.allowed) {
            openDialog({
                title: '使用次数已达上限',
                description: bodyCheck.error || '今日使用次数已用完',
                singleButton: true,
                variant: 'warning'
            });
            return;
        }
        // 增加使用次数
        authService.incrementBodyUsage();
    }

    if (!checkApiKey()) return;

    let query = overrideQuery || input;
    const currentMode = overrideMode || mode;
    
    // Add User Message immediately
    // Note: We use the raw input which might contain [[REF:id:Title]] tags.
    // The MarkdownRenderer will handle displaying these nicely.
    if (!overrideQuery) {
        addMessage(Role.User, query, currentMode);
        setInput('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    }

    // --- Transform Query for Backend ---
    // If the query contains citation tags like [[REF:nodeId:Title]], replace them with full text blocks
    if (session) {
        // Regex to find all citation tags
        query = query.replace(/\[\[REF:([a-zA-Z0-9]+):(.*?)\]\]/g, (match, nodeId, title) => {
            const node = session.messages[nodeId];
            if (!node) return ''; // Should not happen if data is consistent
            
            const cleanContent = cleanThinking(node.content);
            return `\n\n<referenced_chapter>\n### ${title}\n${cleanContent}\n</referenced_chapter>\n\n`;
        });
    }

    setLoading(true);
    setTimeout(() => scrollToBottom(true), 10);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let streamNodeId = '';
    const startTime = Date.now();

    try {
      const freshState = useStore.getState();
      const currentSession = freshState.sessions.find(s => s.id === currentSessionId);
      
      if (!currentSession) throw new Error("Session lost");

      const chain = getHistoryChain(currentSession.messages, currentSession.currentLeafId);
      const historyForMemory = chain.slice(0, -1); 
      const llmMemory = formatLlmMemory(historyForMemory, settings.memoryRounds);

      // Generate relatedMap if in Body/Suggest mode
      let relatedMapContext = '';
      if (currentMode === AppMode.Body || currentMode === AppMode.Suggestion) {
          relatedMapContext = generateRelatedMapString(currentSession.mapView || { scopes:[], nodes:[], edges:[] });
      }

      const inputs = {
        Mode: currentMode,
        characterList: currentSession.context.characterList,
        longTermMemory: currentSession.context.longTermMemory,
        plotSummary: currentSession.context.plotSummary,
        novelSetting: currentSession.context.novelSetting,
        llmMemory: llmMemory,
        latestAiReply: '', 
        relatedMap: relatedMapContext, // Inject Map Context
        sys: { query } 
      };

      addMessage(Role.Assistant, '', currentMode);
      
      const updatedSession = useStore.getState().sessions.find(s => s.id === currentSessionId);
      streamNodeId = updatedSession!.currentLeafId!;

      let currentContent = '';
      let currentReasoning = '';
      await streamAI(
        currentMode,
        query,
        inputs,
        {
            onChunk: (chunk, reasoning) => {
                // 如果有reasoning内容且开启了显示推理
                if (reasoning && settings.showReasoning) {
                    // 追加推理内容而不是覆盖，因为推理是分块返回的
                    currentReasoning += reasoning;
                    // 将reasoning内容添加到消息中，使用think标签 (MarkdownRenderer使用<think>格式)
                    currentContent = `<think>\n${currentReasoning}\n</think>\n\n` + chunk;
                } else {
                    currentContent += chunk;
                }
                updateMessageContent(streamNodeId, currentContent);
            },
            onComplete: () => {
                setLoading(false);
                abortControllerRef.current = null;
                const duration = Date.now() - startTime;

                // 确保推理内容格式正确：如果有 reasoning 内容且以 </think> 结尾，确保格式正确以便 MarkdownRenderer 识别
                if (currentReasoning && settings.showReasoning) {
                    const hasThinkEnd = currentContent.includes('</think>');
                    if (!hasThinkEnd) {
                        // 如果没有结束标签，手动添加
                        currentContent = currentContent.trimEnd() + '\n</think>\n\n';
                        updateMessageContent(streamNodeId, currentContent);
                    }
                }

                updateMessageMetadata(streamNodeId, {
                    duration,
                    memoryRounds: settings.memoryRounds,
                    mode: currentMode
                });

                // --- FLASH MODE TRIGGER ---
                const freshSession = useStore.getState().sessions.find(s => s.id === currentSessionId);
                if (freshSession?.flashModeEnabled && currentMode === AppMode.Body) {
                    // Trigger Flash Mode Analysis (delayed to allow UI render)
                    setTimeout(() => {
                        handleRecordAnalysis(streamNodeId, currentContent, AppMode.Flash);
                    }, 100);
                }
            },
            onError: (err) => {
                console.error("Stream callback error", err);
            }
        },
        controller.signal,
        settings.modelParameters,
        settings.bodyModelType
      );

    } catch (error: any) {
      if (error.name === 'AbortError') {
         // Keep branch on abort
      } else {
         openDialog({
             title: t('dialog.generationError'),
             description: error.message,
             singleButton: true,
             variant: 'destructive'
         });
      }
    } finally {
        setLoading(false);
        abortControllerRef.current = null;
    }
  }, [conflicts, input, session, loading, checkApiKey, mode, addMessage, currentSessionId, settings.memoryRounds, settings.apiBaseUrl, settings.apiKey, updateMessageContent, updateMessageMetadata, openDialog, scrollToBottom, handleRecordAnalysis]);

  const triggerAiGenerationOnly = useCallback(async (query: string) => {
      if (!checkApiKey()) return;
      if (conflicts.length > 0) return; 

      setLoading(true);
      setTimeout(() => scrollToBottom(true), 10);
      
      const controller = new AbortController();
      abortControllerRef.current = controller;
      
      let streamNodeId = '';
      const startTime = Date.now();

      try {
        const freshState = useStore.getState();
        const currentSession = freshState.sessions.find(s => s.id === currentSessionId);
        if (!currentSession) return;

        const chain = getHistoryChain(currentSession.messages, currentSession.currentLeafId);
        const historyForMemory = chain.slice(0, -1); 
        const llmMemory = formatLlmMemory(historyForMemory, settings.memoryRounds);
        
        // Generate Related Map
        const relatedMapContext = generateRelatedMapString(currentSession.mapView || { scopes:[], nodes:[], edges:[] });

        const inputs = {
            Mode: mode,
            characterList: currentSession.context.characterList,
            longTermMemory: currentSession.context.longTermMemory,
            plotSummary: currentSession.context.plotSummary,
            novelSetting: currentSession.context.novelSetting,
            llmMemory: llmMemory,
            relatedMap: relatedMapContext,
            sys: { query }
        };

        addMessage(Role.Assistant, '', mode);
        const updatedSession = useStore.getState().sessions.find(s => s.id === currentSessionId);
        streamNodeId = updatedSession!.currentLeafId!;

        let currentContent = '';
        let currentReasoning = '';
        await streamAI(
            mode,
            query,
            inputs,
            {
                onChunk: (chunk, reasoning) => {
                    // 如果有reasoning内容且开启了显示推理
                    if (reasoning && settings.showReasoning) {
                        // 追加推理内容而不是覆盖，因为推理是分块返回的
                        currentReasoning += reasoning;
                        // 将reasoning内容添加到消息中，使用think标签 (MarkdownRenderer使用<think>格式)
                        currentContent = `<think>\n${currentReasoning}\n</think>\n\n` + chunk;
                    } else {
                        currentContent += chunk;
                    }
                    updateMessageContent(streamNodeId, currentContent);
                },
                onComplete: () => {
                    setLoading(false);
                    abortControllerRef.current = null;
                    const duration = Date.now() - startTime;

                    // 确保推理内容格式正确：如果有 reasoning 内容且以 </think> 结尾，确保格式正确以便 MarkdownRenderer 识别
                    if (currentReasoning && settings.showReasoning) {
                        const hasThinkEnd = currentContent.includes('</think>');
                        if (!hasThinkEnd) {
                            // 如果没有结束标签，手动添加
                            currentContent = currentContent.trimEnd() + '\n</think>\n\n';
                            updateMessageContent(streamNodeId, currentContent);
                        }
                    }

                    updateMessageMetadata(streamNodeId, {
                        duration,
                        memoryRounds: settings.memoryRounds,
                        mode: mode
                    });

                    // --- FLASH MODE TRIGGER ---
                    const freshSession = useStore.getState().sessions.find(s => s.id === currentSessionId);
                    if (freshSession?.flashModeEnabled && mode === AppMode.Body) {
                        setTimeout(() => {
                            handleRecordAnalysis(streamNodeId, currentContent, AppMode.Flash);
                        }, 100);
                    }
                },
                onError: (err) => {
                     console.error(err);
                }
            },
            controller.signal,
            settings.modelParameters,
            settings.bodyModelType
        );
      } catch (e: any) {
          if (e.name === 'AbortError') {
             // Keep branch on abort
          } else {
             openDialog({
                 title: t('dialog.generationError'),
                 description: e.message,
                 singleButton: true,
                 variant: 'destructive'
             });
          }
      } finally {
          setLoading(false);
          abortControllerRef.current = null;
      }
  }, [checkApiKey, conflicts, scrollToBottom, currentSessionId, settings.memoryRounds, settings.apiBaseUrl, settings.apiKey, mode, addMessage, updateMessageContent, updateMessageMetadata, openDialog, handleRecordAnalysis]);

  const handleEditSave = useCallback((node: MessageNode, newContent: string, resend: boolean) => {
    if (resend) {
        editMessage(node.id, newContent);
        setEditingNodeId(null);
        triggerAiGenerationOnly(newContent); 
    } else {
        updateMessageContent(node.id, newContent);
        setEditingNodeId(null);
    }
  }, [updateMessageContent, editMessage, triggerAiGenerationOnly]);

  const handleRegenerate = useCallback((node: MessageNode) => {
    if (!node.parentId) return;
    const parentId = node.parentId;
    if (parentId && session) {
        useStore.setState(state => ({
             sessions: state.sessions.map(s => s.id === state.currentSessionId ? { ...s, currentLeafId: parentId } : s)
        }));
        
        const parentNode = session.messages[parentId];
        const modeToUse = parentNode.metadata?.mode || parentNode.mode || mode;
        handleSend(parentNode.content, modeToUse); 
    }
  }, [session, mode, handleSend, currentSessionId]);

  const handleClearInput = () => {
    setInput('');
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.focus();
    }
  };

  // --- Citation Logic Helpers ---
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setInput(val);
      
      // Auto resize
      e.target.style.height = 'auto';
      e.target.style.height = `${Math.min(e.target.scrollHeight, 208)}px`;

      // Trigger citation menu on '/'
      if (val.endsWith('/')) {
          const bookmarkCount = session?.bookmarkedNodeIds?.length || 0;
          if (bookmarkCount > 0) {
              setShowCitationMenu(true);
          }
      } else {
          // Hide menu if user types other things (unless handled by menu)
          // Simple logic: hide if space is typed after /
          // Better: only hide if they delete the slash or complete a selection
          // For now, let's keep it open until selection or click-away (handled by backdrop/blur)
      }
  };

  const handleCitationSelect = (nodeId: string, title: string) => {
      // Remove the trailing slash and add the REF tag
      const newVal = input.slice(0, -1) + `[[REF:${nodeId}:${title}]] `;
      setInput(newVal);
      setShowCitationMenu(false);
      
      // Focus back and adjust height
      setTimeout(() => {
          if (textareaRef.current) {
              textareaRef.current.focus();
              textareaRef.current.style.height = 'auto';
              textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 208)}px`;
          }
      }, 0);
  };

  // Filter bookmarks for citation menu
  const availableCitations = useMemo(() => {
      if (!session) return [];
      const bookmarks = session.bookmarkedNodeIds || [];
      if (bookmarks.length === 0) return [];
      
      return bookmarks.map(id => {
          const node = session.messages[id];
          if (!node) return null;
          return {
              id,
              title: extractChapterTitle(node.content),
              snippet: cleanThinking(node.content).substring(0, 50) + "..."
          };
      }).filter(Boolean) as {id: string, title: string, snippet: string}[];
  }, [session]);

  return (
    <div className="flex-1 flex flex-col h-full relative bg-background transition-all duration-300 w-full overflow-hidden">
      {/* HEADER: Always Visible */}
      <div className="h-14 flex-shrink-0 flex items-center px-4 justify-between bg-background sticky top-0 z-20 border-b border-border/40 md:border-none">
         <Button variant="ghost" size="icon" className="md:hidden mr-2" onClick={() => toggleMobileSidebar()}>
             <Menu size={20}/>
         </Button>

         <div className="flex gap-2">
            {[AppMode.Setting, AppMode.Body].map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all whitespace-nowrap ${mode === m ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                >
                   {m === AppMode.Setting ? t('chat.settingMode') : t('chat.storyMode')}
                </button>
            ))}
         </div>

         <Button variant="ghost" size="icon" className="md:hidden ml-2" onClick={() => toggleMobileRightPanel()}>
             <Info size={20}/>
         </Button>
      </div>
      
      {/* COMPASS NAVIGATION BAR - Enhanced Physics & Interaction */}
      {chapterMarkers.length > 0 && (
          <div 
             className={`
                absolute top-14 left-0 right-0 z-20 
                bg-background/60 backdrop-blur-md border-b border-border/20 shadow-sm 
                h-12 flex items-center transition-all duration-500 ease-in-out
                ${showCompass ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'}
             `}
             onMouseEnter={activateCompass}
             onMouseLeave={() => { if (!navState.current.isDown && !navState.current.isMomentum) activateCompass(); }}
          >
            {/* Gradient Masks for Compass Effect */}
            <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
            
            <div 
                ref={navScrollRef}
                className={`
                    flex items-center gap-8 overflow-x-auto px-[50%] w-full h-full 
                    cursor-grab active:cursor-grabbing
                    [&::-webkit-scrollbar]:hidden
                `}
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                onMouseDown={onNavMouseDown}
                onMouseLeave={onNavMouseLeave}
                onMouseUp={onNavMouseUp}
                onMouseMove={onNavMouseMove}
            >
                {chapterMarkers.map((marker) => {
                    const isActive = activeMarkerId === marker.nodeId;
                    return (
                        <button
                            id={`nav-marker-${marker.nodeId}`}
                            key={marker.nodeId}
                            onClick={() => onMarkerClick(marker)}
                            className={`
                                flex-shrink-0 whitespace-nowrap text-sm transition-all duration-300 ease-out select-none flex items-center gap-1.5
                                ${isActive 
                                    ? 'text-foreground font-bold scale-110 opacity-100 transform' 
                                    : 'text-muted-foreground font-medium scale-90 opacity-40 hover:opacity-70 hover:scale-100'}
                            `}
                        >
                            {marker.label}
                            {marker.isBookmarked && <Star size={10} className="text-yellow-500 fill-yellow-500" />}
                        </button>
                    );
                })}
            </div>
            
            {/* Center Indicator */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary/80 rounded-t-full pointer-events-none" />
          </div>
      )}

      {!session ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center animate-in fade-in zoom-in duration-300">
             <div className="w-20 h-20 bg-secondary/50 rounded-full flex items-center justify-center mb-6">
                <MessageSquarePlus size={32} className="opacity-50"/>
             </div>
             <h3 className="text-lg font-bold mb-2 text-foreground">{t('chat.noStory')}</h3>
             <p className="max-w-xs mx-auto mb-6">{t('chat.readyToWrite')}</p>
             <Button className="md:hidden" onClick={() => toggleMobileSidebar(true)}>
                 {t('chat.openSidebar')}
             </Button>
        </div>
      ) : (
      <>
        {/* Messages Container (Virtual List) */}
        <div className="flex-1 w-full min-h-0 relative group/list">
             {visibleHistory.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/40 pointer-events-none select-none z-10">
                    <div className="text-center space-y-2 max-w-sm px-6 animate-in fade-in zoom-in duration-500">
                        <Info size={40} className="mx-auto mb-4 opacity-50"/>
                        <h3 className="text-xl font-bold">{t('chat.readyToWrite')}</h3>
                        <p className="text-sm">
                            {t('chat.settingMode')} <span className="font-bold text-foreground/60">{t('chat.settingMode')}</span> {t('chat.storyMode')} <span className="font-bold text-foreground/60">{t('chat.storyMode')}</span>
                        </p>
                    </div>
                </div>
             )}

             <Virtuoso
                key={currentSessionId} // Forces remount on session switch for instant bottom positioning
                ref={virtuosoRef}
                data={visibleHistory}
                initialTopMostItemIndex={{ index: Math.max(0, visibleHistory.length - 1), align: 'end' }}
                atBottomStateChange={handleAtBottomStateChange}
                rangeChanged={(range) => {
                    handleRangeChanged(range);
                }}
                increaseViewportBy={{ top: 0, bottom: 400 }}
                followOutput={mode === AppMode.Record || hasPendingRecord ? false : "auto"}
                atBottomThreshold={100} 
                onScroll={handleScroll}
                className="w-full h-full scroll-smooth"
                components={{
                    Header: () => <div className="h-8" />,
                    Footer: () => (
                        <>
                            <div className="h-4" />
                        </>
                    )
                }}
                itemContent={(index, node) => (
                    <div className="max-w-3xl mx-auto w-full">
                         <MessageBubble
                            node={node}
                            session={session}
                            isEditing={editingNodeId === node.id}
                            isStreaming={loading && index === visibleHistory.length - 1 && node.role === Role.Assistant}
                            showReasoning={settings.showReasoning}
                            onEditStart={handleEditStart}
                            onEditCancel={handleEditCancel}
                            onEditSave={handleEditSave}
                            onCopy={handleCopy}
                            onRegenerate={handleRegenerate}
                            onDelete={handleDelete}
                            onBranch={handleBranch}
                            onNavigate={handleNavigate}
                            onAddToSetting={handleAddToSetting}
                            onRecordAnalysis={handleRecordAnalysis}
                            onCanvasStart={handleCanvasStart}
                            onToggleBookmark={toggleBookmark}
                            copiedId={copiedId}
                            savedToSettingId={savedToSettingId}
                            mode={mode}
                         />
                    </div>
                )}
             />

             {/* Navigation Controls (Top) */}
             <div className={`absolute top-16 left-1/2 -translate-x-1/2 z-30 flex gap-2 transition-all duration-300 ease-in-out ${showNavControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
                 <button
                    onClick={scrollToTop}
                    className="bg-background/90 backdrop-blur border border-border shadow-lg p-2 rounded-full text-muted-foreground hover:text-primary hover:scale-105 transition-all"
                    title={t('chat.scrollTop')}
                 >
                     <ArrowUpToLine size={18}/>
                 </button>
                 <button
                    onClick={scrollToPrevious}
                    className="bg-background/90 backdrop-blur border border-border shadow-lg px-3 py-2 rounded-full text-muted-foreground hover:text-primary hover:scale-105 transition-all flex items-center gap-1 text-xs font-medium"
                    title={t('chat.prevMsg')}
                 >
                     <ArrowUp size={14}/> {t('chat.prevMsg')}
                 </button>
             </div>

             {/* Scroll to Bottom Button */}
             <button
                onClick={() => scrollToBottom(false)}
                className={`absolute bottom-6 right-6 z-20 bg-primary text-primary-foreground shadow-lg rounded-full w-10 h-10 flex items-center justify-center cursor-pointer border border-border hover:scale-110 transition-all duration-300 ease-in-out ${
                    showScrollButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
                } ${loading ? 'animate-bounce' : ''}`}
                title={t('chat.scrollBottom')}
            >
                <ArrowDown size={20} />
            </button>
        </div>
        
        <div className="p-4 pb-6 bg-background flex-shrink-0 border-t border-border/50 relative">
            
            {/* Citation Menu (Popup) */}
            {showCitationMenu && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowCitationMenu(false)} />
                    <div className="absolute bottom-full left-4 mb-2 w-72 bg-card border border-border rounded-xl shadow-2xl z-40 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-muted/30 px-3 py-2 border-b border-border text-xs font-bold text-muted-foreground flex items-center gap-2">
                            <Book size={12}/> {t('chat.reference')}
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                            {availableCitations.length === 0 ? (
                                <div className="p-4 text-center text-xs text-muted-foreground italic">{t('chat.noBookmarks')}</div>
                            ) : (
                                availableCitations.map(cite => (
                                    <button 
                                        key={cite.id} 
                                        className="w-full text-left p-3 hover:bg-muted/50 transition-colors border-b border-border/20 last:border-none"
                                        onClick={() => handleCitationSelect(cite.id, cite.title)}
                                    >
                                        <div className="text-sm font-bold text-foreground mb-0.5">{cite.title}</div>
                                        <div className="text-[10px] text-muted-foreground line-clamp-1">{cite.snippet}</div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}

            <div className="max-w-3xl mx-auto w-full relative">
                <div className="flex items-end bg-secondary rounded-[26px] pl-4 pr-2 py-2 shadow-sm transition-shadow focus-within:ring-1 focus-within:ring-ring/20 relative">
                    <textarea
                        ref={textareaRef}
                        className="flex-1 bg-transparent py-2.5 text-base focus:outline-none resize-none max-h-52 overflow-y-auto leading-6 [&::-webkit-scrollbar]:hidden"
                        rows={1}
                        style={{ minHeight: '44px' }}
                        placeholder={t('chat.placeholder')}
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                if (isMobile) {
                                    return;
                                }
                                if (!e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }
                        }}
                    />

                    {/* Clear Button */}
                    {input.length > 150 && (
                        <button
                            onClick={handleClearInput}
                            className="absolute top-[-10px] right-[-10px] bg-muted-foreground/20 hover:bg-muted-foreground/40 text-muted-foreground rounded-full p-1 transition-all"
                            title="Clear"
                        >
                            <X size={12} />
                        </button>
                    )}

                    <div className="flex-shrink-0 pb-1.5 pl-2 flex items-center gap-1">
                        {/* Polish / Runse Button */}
                         {!loading && input.trim() && (
                            <button
                                onClick={handlePolish}
                                className="w-8 h-8 flex items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all"
                                title={t('chat.polish')}
                            >
                                <Sparkles size={16} />
                            </button>
                         )}

                        {loading ? (
                            <button
                            onClick={handleStop}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-foreground text-background hover:opacity-90 transition-opacity"
                            title={t('chat.stop')}
                            >
                            <Square size={10} fill="currentColor" />
                            </button>
                        ) : (
                            <button
                            disabled={!input.trim()}
                            onClick={() => handleSend()}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-20 transition-colors"
                            >
                            <Send size={16} />
                            </button>
                        )}
                    </div>
                </div>
                <div className="text-[10px] text-muted-foreground mt-2 text-center opacity-70">
                    {isMobile ? t('chat.enterLineMobile') : t('chat.enterSend')}
                </div>
            </div>
        </div>
      </>
      )}

      {canvasNodeId && session?.messages[canvasNodeId] && (
          <CanvasEditor
            initialContent={session.messages[canvasNodeId].content}
            onSave={handleCanvasSave}
            onCancel={handleCanvasCancel}
          />
      )}
    </div>
  );
};
