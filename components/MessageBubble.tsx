
import React, { useRef, useLayoutEffect, useState, useEffect } from 'react';
import { MessageNode, Role, AppMode, Session } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { cleanThinking } from '../utils';
import { t } from '../utils/i18n';
import { Button } from './ui/Button';
import { 
  Send, Edit2, RotateCw, GitBranch, ChevronLeft, ChevronRight, 
  Activity, Bot, Copy, Check, Trash2, Clock, Database, Tag, BookPlus, Maximize2, Star
} from 'lucide-react';

interface MessageBubbleProps {
  node: MessageNode;
  session: Session;
  isEditing: boolean;
  isStreaming?: boolean;
  showReasoning?: boolean;
  onEditStart: (nodeId: string, content: string) => void;
  onEditCancel: () => void;
  onEditSave: (node: MessageNode, newContent: string, resend: boolean) => void;

  // Actions
  onCopy: (id: string, content: string) => void;
  onRegenerate: (node: MessageNode) => void;
  onDelete: (nodeId: string) => void;
  onBranch: (nodeId: string) => void;
  onNavigate: (nodeId: string, direction: 'prev' | 'next') => void;
  onAddToSetting: (id: string, content: string) => void;
  onRecordAnalysis: (nodeId: string, content: string) => void;
  onCanvasStart: (nodeId: string) => void;
  onToggleBookmark: (nodeId: string) => void;

  // States
  copiedId: string | null;
  savedToSettingId: string | null;
  mode: AppMode;
}

export const MessageBubble = React.memo(({
  node,
  session,
  isEditing,
  isStreaming,
  showReasoning,
  onEditStart,
  onEditCancel,
  onEditSave,
  onCopy,
  onRegenerate,
  onDelete,
  onBranch,
  onNavigate,
  onAddToSetting,
  onRecordAnalysis,
  onCanvasStart,
  onToggleBookmark,
  copiedId,
  savedToSettingId,
  mode
}: MessageBubbleProps) => {
  // Use cleanThinking to strip <think> tags for the edit box
  const [editContent, setEditContent] = useState(cleanThinking(node.content));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const parent = node.parentId ? session.messages[node.parentId] : null;
  const siblingCount = parent ? parent.childrenIds.length : 0;
  const currentChildIndex = parent ? parent.childrenIds.indexOf(node.id) : 0;
  const isUser = node.role === Role.User;
  
  const metaDuration = node.metadata?.duration;
  const metaRounds = node.metadata?.memoryRounds;
  const metaMode = node.metadata?.mode || node.mode;

  const isBookmarked = (session.bookmarkedNodeIds || []).includes(node.id);

  // Sync state when entering edit mode or when node content updates externally
  useEffect(() => {
      if (isEditing) {
          setEditContent(cleanThinking(node.content));
      }
  }, [isEditing, node.content]);

  // Auto-resize textarea with debouncing to reduce scroll jumps
  useLayoutEffect(() => {
    if (isEditing && textareaRef.current) {
       const textarea = textareaRef.current;
       const lineHeight = 24; // Approximate line height
       const minLines = 4;
       const minHeight = minLines * lineHeight;

       // Calculate new height
       textarea.style.height = 'auto';
       const newHeight = Math.max(minHeight, textarea.scrollHeight);

       // Only update if there's a significant change to avoid jitter
       if (Math.abs(textarea.clientHeight - newHeight) > 10) {
           textarea.style.height = newHeight + 'px';
       }
    }
  }, [isEditing, editContent]);

  const formatDuration = (ms: number) => {
      if (ms < 1000) return `${ms}ms`;
      return `${(ms / 1000).toFixed(1)}s`;
  };

  const handleSave = () => {
    onEditSave(node, editContent, false);
  };

  const handleSaveAndSend = () => {
    onEditSave(node, editContent, true);
  };

  return (
    <div className={`group flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full mb-6 px-4`}>
        {!isUser && (
        <div className="flex items-center gap-2 mb-2 px-1 opacity-80 select-none">
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                <Bot size={14} />
            </div>
            <span className="text-sm font-medium">Novel Master</span>
        </div>
        )}

        {/* Thinking Indicator - Gemini style animation */}
        {/* 当 showReasoning=true 时：检查内容中是否有</think>标签，有则说明推理结束，不再显示思考中 */}
        {/* 当 showReasoning=false 时：检查内容是否为空（刚开始输出），有内容后自动隐藏思考中 */}
        {!isUser && isStreaming && (
            showReasoning ? !node.content.includes('</think>') : node.content.length === 0
        ) && (
            <div className="flex items-center gap-1.5 mt-2 ml-2">
                <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
                <span className="text-sm text-muted-foreground">{t('chat.thinking')}</span>
            </div>
        )}

        <div className={`${isUser ? (isEditing ? 'w-full' : 'flex flex-col items-end max-w-[90%] md:max-w-[85%]') : 'w-full'}`}>

            {isEditing ? (
                 <div className={`
                    w-full bg-card border border-border rounded-xl shadow-lg animate-in fade-in zoom-in-95 duration-200
                    ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'}
                 `}>
                    <div className="p-4">
                        <textarea
                            ref={textareaRef}
                            className="w-full bg-transparent border-none resize-none focus:outline-none text-base leading-relaxing p-0 font-sans transition-all duration-200"
                            style={{ minHeight: '60px' }}
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            placeholder="Edit message..."
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    handleSaveAndSend();
                                }
                            }}
                        />
                    </div>
                    <div className="flex items-center justify-end gap-2 px-4 pb-4">
                        <Button variant="ghost" size="sm" onClick={onEditCancel}>Cancel</Button>
                        <Button variant="outline" size="sm" onClick={handleSave}>Save</Button>
                        {isUser && (
                            <Button variant="primary" size="sm" onClick={handleSaveAndSend} className="gap-2">
                                <Send size={14} /> Save & Send
                            </Button>
                        )}
                        {!isUser && (
                             <Button variant="primary" size="sm" onClick={handleSaveAndSend} className="gap-2">
                                <Send size={14} /> Regenerate
                            </Button>
                        )}
                    </div>
                 </div>
            ) : (
                <div className={`
                    relative px-4 py-2.5 md:px-5 md:py-3.5 transition-opacity duration-300
                    ${isUser
                        ? 'bg-secondary rounded-[26px] text-foreground w-fit break-words'
                        : 'text-foreground pl-0 w-full'
                    }
                `}>

                    {/* 分支导航按钮 - 放在用户消息上方 */}
                    {isUser && siblingCount > 1 && (
                        <div className={`absolute -top-3 right-0 bg-background border border-border rounded-full px-2 py-0.5 flex items-center gap-1 text-[10px] shadow-sm text-foreground z-10`}>
                            <button onClick={() => onNavigate(node.id, 'prev')} disabled={currentChildIndex === 0} className="hover:text-primary disabled:opacity-30"><ChevronLeft size={10}/></button>
                            <span>{currentChildIndex + 1}/{siblingCount}</span>
                            <button onClick={() => onNavigate(node.id, 'next')} disabled={currentChildIndex === siblingCount - 1} className="hover:text-primary disabled:opacity-30"><ChevronRight size={10}/></button>
                        </div>
                    )}

                    <MarkdownRenderer content={node.content} className={isUser ? '!prose-none' : ''}/>
                </div>
            )}
        
            {!isUser && !isEditing && (
                <div className="flex flex-wrap items-center gap-4 mt-2 px-1">
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground uppercase tracking-wide font-medium select-none">
                        {metaDuration && (
                            <div className="flex items-center gap-1" title="Time Taken">
                                <Clock size={10} />
                                <span>{formatDuration(metaDuration)}</span>
                            </div>
                        )}
                        {metaRounds !== undefined && (
                            <div className="flex items-center gap-1" title="Memory Rounds (N)">
                                <Database size={10} />
                                <span>Mem: {metaRounds}</span>
                            </div>
                        )}
                        {metaMode && (
                            <div className="flex items-center gap-1" title="Mode Used">
                                <Tag size={10} />
                                <span>{metaMode === AppMode.Setting ? 'Setting' : 'Story'}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground">
                        <button onClick={() => onCopy(node.id, node.content)} title="Copy" className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors">
                            {copiedId === node.id ? <Check size={14} className="text-green-500"/> : <Copy size={14}/>}
                        </button>
                        
                        <button onClick={() => onToggleBookmark(node.id)} title={isBookmarked ? "Remove Bookmark" : "Bookmark Chapter"} className={`p-1 hover:bg-muted rounded transition-colors ${isBookmarked ? 'text-yellow-500 hover:text-yellow-600' : 'hover:text-foreground'}`}>
                            <Star size={14} fill={isBookmarked ? "currentColor" : "none"}/>
                        </button>

                        <button onClick={() => onRegenerate(node)} title="Regenerate" className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors"><RotateCw size={14}/></button>
                        
                        <button onClick={() => onEditStart(node.id, node.content)} title="Edit" className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors"><Edit2 size={14}/></button>
                        
                        <button onClick={() => onCanvasStart(node.id)} title="Canvas Mode" className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors"><Maximize2 size={14}/></button>

                        <button onClick={() => onBranch(node.id)} title="Branch" className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors"><GitBranch size={14}/></button>

                        <button onClick={() => onDelete(node.id)} title="Delete" className="p-1 hover:text-destructive hover:bg-destructive/10 rounded transition-colors"><Trash2 size={14}/></button>

                        {metaMode === AppMode.Setting && (
                            <button
                                onClick={() => onAddToSetting(node.id, node.content)}
                                title="Add to Novel Setting"
                                className="p-1 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                            >
                                {savedToSettingId === node.id ? <Check size={14} className="text-green-500"/> : <BookPlus size={14}/>}
                            </button>
                        )}

                        {mode === AppMode.Body && (
                            <button
                                onClick={() => onRecordAnalysis(node.id, node.content)}
                                title="Analyze & Record"
                                className={`p-1 hover:text-primary hover:bg-primary/10 rounded transition-colors flex items-center gap-1 ${node.isRecordPending ? 'animate-pulse text-primary' : ''}`}
                            >
                                <Activity size={14}/>
                            </button>
                        )}

                        {/* 分支导航按钮 - 放在最右侧 */}
                        {siblingCount > 1 && (
                            <div className="flex items-center gap-0.5 bg-muted/50 rounded-full px-2 py-0.5 text-[10px]">
                                <button onClick={() => onNavigate(node.id, 'prev')} disabled={currentChildIndex === 0} className="hover:text-primary disabled:opacity-30"><ChevronLeft size={10}/></button>
                                <span className="min-w-[24px] text-center">{currentChildIndex + 1}/{siblingCount}</span>
                                <button onClick={() => onNavigate(node.id, 'next')} disabled={currentChildIndex === siblingCount - 1} className="hover:text-primary disabled:opacity-30"><ChevronRight size={10}/></button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isUser && !isEditing && (
                <div className="flex items-center justify-end gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground pr-2">
                    <button onClick={() => onCopy(node.id, node.content)} title="Copy" className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors">
                        {copiedId === node.id ? <Check size={14} className="text-green-500"/> : <Copy size={14}/>}
                    </button>
                    <button onClick={() => onEditStart(node.id, node.content)} title="Edit" className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors"><Edit2 size={14}/></button>
                    <button onClick={() => onBranch(node.id)} title="Branch" className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors"><GitBranch size={14}/></button>
                    <button onClick={() => onDelete(node.id)} title="Delete" className="p-1 hover:text-destructive hover:bg-destructive/10 rounded transition-colors"><Trash2 size={14}/></button>
                </div>
            )}
        </div>
    </div>
  );
}, (prev, next) => {
    // Structural checks
    if (prev.node.id !== next.node.id) return false;
    if (prev.node.content !== next.node.content) return false;
    if (prev.isEditing !== next.isEditing) return false;
    if (prev.copiedId !== next.copiedId && (prev.copiedId === prev.node.id || next.copiedId === next.node.id)) return false;
    if (prev.savedToSettingId !== next.savedToSettingId && (prev.savedToSettingId === prev.node.id || next.savedToSettingId === next.node.id)) return false;
    if (prev.node.isRecordPending !== next.node.isRecordPending) return false;
    if (prev.node.metadata?.duration !== next.node.metadata?.duration) return false;
    
    // Check bookmark state via session prop (since we don't pass isBookmarked directly to memo check usually unless we flatten props)
    // But we are passing `session`.
    const prevBookmarked = (prev.session.bookmarkedNodeIds || []).includes(prev.node.id);
    const nextBookmarked = (next.session.bookmarkedNodeIds || []).includes(next.node.id);
    if (prevBookmarked !== nextBookmarked) return false;

    // Check function props to ensure no stale closures
    if (prev.onRecordAnalysis !== next.onRecordAnalysis) return false;
    if (prev.onRegenerate !== next.onRegenerate) return false;
    if (prev.onEditSave !== next.onEditSave) return false;
    if (prev.onDelete !== next.onDelete) return false;
    if (prev.onBranch !== next.onBranch) return false;
    if (prev.onToggleBookmark !== next.onToggleBookmark) return false;
    
    // Parent/Sibling checks for navigation UI
    const prevParent = prev.node.parentId ? prev.session.messages[prev.node.parentId] : null;
    const nextParent = next.node.parentId ? next.session.messages[next.node.parentId] : null;
    
    const prevSibCount = prevParent ? prevParent.childrenIds.length : 0;
    const nextSibCount = nextParent ? nextParent.childrenIds.length : 0;
    
    const prevIdx = prevParent ? prevParent.childrenIds.indexOf(prev.node.id) : 0;
    const nextIdx = nextParent ? nextParent.childrenIds.indexOf(next.node.id) : 0;
    
    if (prevSibCount !== nextSibCount) return false;
    if (prevIdx !== nextIdx) return false;

    return true; 
});
