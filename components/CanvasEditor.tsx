
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import { AppMode } from '../types';
import { streamAI } from '../services/aiService';
import { copyToClipboard } from '../utils'; // IMPORTED
import { Button } from './ui/Button';
import { 
  Check, Sparkles, Copy, Trash2, Scissors, 
  Send, Loader2, FileText, ChevronLeft, MousePointer2
} from 'lucide-react';

interface CanvasEditorProps {
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}

const CustomCheckbox = ({ checked, onChange }: { checked: boolean, onChange: () => void }) => (
    <div 
        onMouseDown={(e) => { 
            // Prevent focus loss from textarea
            e.preventDefault(); 
            e.stopPropagation(); 
            onChange(); 
        }}
        onClick={(e) => {
            // Prevent bubbling to parent container which triggers focus/scroll
            e.stopPropagation();
        }}
        className={`
            w-5 h-5 rounded-[6px] flex items-center justify-center cursor-pointer transition-all duration-200 group
            ${checked 
                ? 'bg-primary border border-primary text-primary-foreground shadow-sm scale-105' 
                : 'bg-muted/40 border border-border hover:border-primary/50 hover:bg-primary/10'}
        `}
    >
        <Check size={12} strokeWidth={3} className={`transition-transform duration-200 ${checked ? 'scale-100' : 'scale-0'}`} />
    </div>
);

export const CanvasEditor: React.FC<CanvasEditorProps> = ({ initialContent, onSave, onCancel }) => {
  const { settings, currentSessionId, sessions } = useStore();
  const session = sessions.find(s => s.id === currentSessionId);

  // Prevent background scroll to avoid viewport jitter
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
        document.body.style.overflow = '';
    };
  }, []);

  // Split think block from content for editing
  const [thinkBlock, setThinkBlock] = useState(() => {
     const match = initialContent.match(/^<think>[\s\S]*?<\/think>/i);
     return match ? match[0] : '';
  });
  
  const [content, setContent] = useState(() => {
     const match = initialContent.match(/^<think>[\s\S]*?<\/think>/i);
     return match ? initialContent.replace(match[0], '').trimStart() : initialContent;
  });

  const [checkedIndices, setCheckedIndices] = useState<Set<number>>(new Set());
  const [selectionRange, setSelectionRange] = useState<{start: number, end: number} | null>(null);
  
  const [aiInstruction, setAiInstruction] = useState('');
  const [isAiStreaming, setIsAiStreaming] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [content]);

  // Derived Paragraphs for Backdrop Rendering
  const paragraphs = useMemo(() => {
    const parts = content.split('\n');
    let currentIndex = 0;
    return parts.map((text, idx) => {
        const start = currentIndex;
        const length = text.length;
        const end = start + length;
        currentIndex = end + 1; // +1 for the newline char
        return { text, start, end, index: idx };
    });
  }, [content]);

  // Handle Selection Updates
  const handleSelect = () => {
      if (textareaRef.current) {
          const start = textareaRef.current.selectionStart;
          const end = textareaRef.current.selectionEnd;
          if (start !== end) {
              setSelectionRange({ start, end });
          } else {
              setSelectionRange(null);
          }
      }
  };

  const toggleCheck = (index: number) => {
    const next = new Set(checkedIndices);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setCheckedIndices(next);
  };

  const clearSelection = () => {
      setSelectionRange(null);
      setCheckedIndices(new Set());
  };

  const handleSaveInternal = () => {
      // Recombine think block and edited content
      const finalContent = thinkBlock 
        ? `${thinkBlock}\n\n${content}`
        : content;
      onSave(finalContent);
  };

  // Helper Actions for Toolbar
  const handleCopy = async () => {
      const textToCopy = getTargetText();
      if (textToCopy) {
          await copyToClipboard(textToCopy);
      }
  };
  
  const handleCut = async () => {
      // Complex logic to cut disjointed ranges is hard for simple textarea
      // We will fallback to only cutting selectionRange if it exists
      if (selectionRange) {
          const text = content.substring(selectionRange.start, selectionRange.end);
          await copyToClipboard(text);
          const newContent = content.substring(0, selectionRange.start) + content.substring(selectionRange.end);
          setContent(newContent);
          setSelectionRange(null);
      }
  };

  const handleDelete = () => {
       if (selectionRange) {
          const newContent = content.substring(0, selectionRange.start) + content.substring(selectionRange.end);
          setContent(newContent);
          setSelectionRange(null);
      }
  };

  const getTargetText = () => {
      if (selectionRange) {
          return content.substring(selectionRange.start, selectionRange.end);
      }
      
      const indices = Array.from(checkedIndices).sort((a: number, b: number) => a - b);
      if (indices.length > 0) {
          return indices.map(i => paragraphs[i]?.text).filter(Boolean).join('\n');
      }
      return "";
  };

  const executeAiEdit = async () => {
      if (!settings.apiKey || !session) return;
      
      let start = 0;
      let end = 0;
      let targetSegment = "";
      let workingContent = content;

      // Priority 1: Manual Selection (Cursor)
      if (selectionRange) {
          start = selectionRange.start;
          end = selectionRange.end;
          targetSegment = content.substring(start, end);
      } 
      // Priority 2: Checkboxes (Contiguous block preferred for simple logic)
      else if (checkedIndices.size > 0) {
          // Construct a segment from checked paragraphs
          // Note: If they are non-contiguous, this simple string replacement logic might break context.
          // For safety in this version, we will only take the *range* from the first checked to last checked.
          const indices = Array.from(checkedIndices).sort((a: number, b: number) => a - b);
          const firstP = paragraphs[indices[0]];
          const lastP = paragraphs[indices[indices.length - 1]];
          start = firstP.start;
          end = lastP.end;
          
          // Refine target segment to only include actually checked paragraphs? 
          // For "Edit", usually we want to rewrite the whole block.
          targetSegment = content.substring(start, end);
      } 
      // Priority 3: No Selection -> Warn or Fallback
      else {
          return;
      }
      
      if (!targetSegment.trim()) return;

      setIsAiStreaming(true);
      abortControllerRef.current = new AbortController();

      const prefix = workingContent.substring(0, start);
      const suffix = workingContent.substring(end);
      let accumulated = "";

      try {
          const variables = {
              Mode: AppMode.Edit,
              characterList: session.context.characterList,
              plotSummary: session.context.plotSummary,
              longTermMemory: session.context.longTermMemory,
              novelSetting: session.context.novelSetting,
              fullContext: content,
              targetSegment,
              userInstruction: aiInstruction.trim() || "请使用对应语言,润色其中文字"
          };

          // Show placeholder
          const placeholder = "(AI Editing...)";
          setContent(prefix + placeholder + suffix);

          await streamAI(
              AppMode.Edit,
              'edit',
              variables,
              {
                  onChunk: (chunk) => {
                      accumulated += chunk;

                      // Handle Think Block Stripping during stream (for the NEW content generated)
                      let textToInsert = accumulated;
                      // Regex to detect start of think block (case insensitive)
                      if (/^<think>/i.test(textToInsert)) {
                          const matchEnd = /<\/think>/i.exec(textToInsert);
                          if (matchEnd) {
                              // Block finished, strip it (and trim leading whitespace/newlines often left behind)
                              textToInsert = textToInsert.substring(matchEnd.index + matchEnd[0].length).replace(/^\n+/, '');
                          } else {
                              // Block ongoing, hide everything
                              textToInsert = "";
                          }
                      }

                      setContent(prefix + textToInsert + suffix);
                  },
                  onComplete: () => {
                      setIsAiStreaming(false);
                      clearSelection();
                      setAiInstruction('');
                      if (aiInputRef.current) {
                          aiInputRef.current.style.height = 'auto';
                      }

                      // Restore focus
                      setTimeout(() => {
                          if (textareaRef.current) {
                              textareaRef.current.focus();
                              const newPos = start + accumulated.length;
                              textareaRef.current.setSelectionRange(newPos, newPos);
                          }
                      }, 0);
                  },
                  onError: (err) => {
                      console.error(err);
                      setContent(prefix + targetSegment + suffix); // Revert
                      setIsAiStreaming(false);
                  }
              },
              abortControllerRef.current.signal
          );
      } catch (e) {
          setContent(prefix + targetSegment + suffix);
          setIsAiStreaming(false);
      }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const isMobile = window.matchMedia("(pointer:coarse)").matches || window.innerWidth < 768;
      
      if (e.key === 'Enter') {
          if (isMobile) {
              // Allow default behavior (newline)
              return;
          }
          if (!e.shiftKey) {
              e.preventDefault();
              executeAiEdit();
          }
      }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setAiInstruction(e.target.value);
      e.target.style.height = 'auto';
      e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const hasSelection = selectionRange !== null || checkedIndices.size > 0;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-zinc-50 dark:bg-zinc-950 flex flex-col animate-in fade-in duration-300">
      
      {/* Top Toolbar */}
      <div className="flex-shrink-0 h-16 bg-white dark:bg-zinc-900 border-b border-border shadow-sm px-4 flex items-center justify-between z-20">
         <div className="flex items-center gap-4">
             <Button variant="ghost" onClick={onCancel} className="gap-2 text-muted-foreground hover:text-foreground">
                 <ChevronLeft size={18}/> Back
             </Button>
             <div className="h-6 w-px bg-border mx-2" />
             <div className="flex items-center gap-1 text-sm font-medium text-foreground">
                 <FileText size={16} className="text-primary"/>
                 <span>Canvas Editor</span>
             </div>
         </div>

         <div className="flex items-center gap-3">
             <Button variant="ghost" onClick={onCancel}>Discard</Button>
             <Button onClick={handleSaveInternal} className="gap-2 shadow-lg shadow-primary/20">
                 <Check size={16}/> Save Changes
             </Button>
         </div>
      </div>

      {/* Main Workspace */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 cursor-text relative"
        onClick={() => textareaRef.current?.focus()}
      >
         <div className="w-full max-w-4xl mx-auto min-h-[100vh] bg-white dark:bg-zinc-900 shadow-xl border border-border/40 rounded-lg p-8 md:p-16 relative mb-24">
             
             <div className="relative min-h-[50vh]">
                 
                 {/* 
                    Layer 1: Backdrop (Highlights & Checkboxes) 
                    - Z-Index: 0
                    - Padding matches text indentation
                 */}
                 <div 
                    className="absolute inset-0 z-0 pl-[3.5rem] whitespace-pre-wrap break-words font-serif text-lg md:text-xl leading-relaxed text-transparent select-none pointer-events-none"
                    aria-hidden="true"
                 >
                    {paragraphs.map((p) => {
                        const isChecked = checkedIndices.has(p.index);
                        const hasContent = p.text.trim().length > 0;
                        
                        // Intersection Logic for Highlight
                        // We highlight if Checked OR Selected
                        
                        // 1. Calculate Cursor Intersection
                        let highlightStart = -1;
                        let highlightEnd = -1;
                        if (selectionRange) {
                             const selStart = selectionRange.start;
                             const selEnd = selectionRange.end;
                             if (selStart < p.end && selEnd > p.start) {
                                 highlightStart = Math.max(selStart, p.start) - p.start;
                                 highlightEnd = Math.min(selEnd, p.end) - p.start;
                             }
                        }

                        // 2. Determine "Marked" status
                        // If Checked, the whole paragraph is marked.
                        // If Cursor Selected, only that range is marked.
                        // We use a fluorescent style for both.
                        
                        const markClass = "bg-yellow-200/50 dark:bg-yellow-500/20 box-decoration-clone text-transparent rounded-sm";

                        return (
                            <div key={p.index} className="relative">
                                {/* Checkbox Gutter: Absolutely positioned relative to the line */}
                                {/* Pointer events auto enabled for the checkbox container */}
                                {hasContent && (
                                    <div className="absolute -left-[3.5rem] top-1.5 w-[3rem] flex justify-center pointer-events-auto z-50">
                                        <CustomCheckbox 
                                            checked={isChecked} 
                                            onChange={() => toggleCheck(p.index)} 
                                        />
                                    </div>
                                )}
                                
                                {/* Render Highlight Layers */}
                                {isChecked ? (
                                    <span className={markClass}>{p.text}</span>
                                ) : (
                                    highlightStart !== -1 ? (
                                        <>
                                            {p.text.substring(0, highlightStart)}
                                            <span className={markClass}>
                                                {p.text.substring(highlightStart, highlightEnd)}
                                            </span>
                                            {p.text.substring(highlightEnd)}
                                        </>
                                    ) : (
                                        p.text
                                    )
                                )}
                                {p.text === '' && <br/>} 
                            </div>
                        );
                    })}
                 </div>

                 {/* 
                    Layer 2: Textarea (Editing)
                    - Z-Index: 10
                    - Text visible, Background transparent
                    - Margin Left pushes it away from gutter, ensuring clicks on gutter fall through (or we rely on z-index)
                 */}
                 <textarea 
                    ref={textareaRef}
                    className="relative z-10 w-[calc(100%-3.5rem)] ml-[3.5rem] h-full bg-transparent resize-none border-none focus:ring-0 p-0 text-lg md:text-xl leading-relaxed font-serif text-zinc-800 dark:text-zinc-200 placeholder:text-muted-foreground/30 overflow-hidden outline-none whitespace-pre-wrap break-words"
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    onSelect={handleSelect}
                    placeholder="Start writing..."
                    readOnly={isAiStreaming}
                    spellCheck={false}
                 />
             </div>
             
             <div className="mt-12 flex justify-center opacity-30">
                <div className="w-16 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
            </div>
         </div>
      </div>

      {/* Bottom Floating AI Bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-[110] flex flex-col items-center gap-2">
          
          {/* Floating Context Toolbar (Separated from Input) */}
          {hasSelection && !isAiStreaming && (
             <div className="flex items-center gap-2 bg-white dark:bg-zinc-800 border border-border shadow-lg rounded-full px-4 py-1.5 animate-in fade-in slide-in-from-bottom-2 mb-1">
                 <Button variant="ghost" size="sm" onClick={handleCut} title="Cut" className="h-8 w-8 px-0 rounded-full"><Scissors size={14}/></Button>
                 <div className="w-px h-4 bg-border"/>
                 <Button variant="ghost" size="sm" onClick={handleCopy} title="Copy" className="h-8 w-8 px-0 rounded-full"><Copy size={14}/></Button>
                 <div className="w-px h-4 bg-border"/>
                 <Button variant="ghost" size="sm" onClick={handleDelete} title="Delete" className="h-8 w-8 px-0 rounded-full text-destructive hover:text-destructive"><Trash2 size={14}/></Button>
             </div>
          )}

          {/* AI Input Box */}
          <div className={`
              w-full bg-white dark:bg-zinc-800 border shadow-2xl rounded-2xl p-2 flex items-end gap-2 transition-all duration-300
              ${hasSelection ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border'}
          `}>
             <div className="pl-3 pr-2 pb-2.5 text-primary">
                {isAiStreaming ? <Loader2 size={20} className="animate-spin"/> : <Sparkles size={20}/>}
             </div>
             
             <textarea 
                ref={aiInputRef}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm md:text-base py-2.5 placeholder:text-muted-foreground/50 resize-none max-h-40 overflow-y-auto leading-6 [&::-webkit-scrollbar]:hidden"
                placeholder={hasSelection ? "Ask AI to modify highlighted text..." : "Select text or check paragraphs to edit..."}
                value={aiInstruction}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                disabled={isAiStreaming || !hasSelection}
                rows={1}
                style={{ minHeight: '44px' }}
             />

             <Button 
                size="sm" 
                className="rounded-xl w-10 h-10 mb-0.5 flex-shrink-0" 
                onClick={executeAiEdit} 
                disabled={isAiStreaming || !hasSelection}
             >
                <Send size={16}/>
             </Button>
          </div>
      </div>

    </div>,
    document.body
  );
};
