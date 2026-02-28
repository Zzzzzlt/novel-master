
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import { Button } from './ui/Button';
import { ChevronRight, ChevronLeft, Maximize2, Save, X, Edit3, Eye, Settings2, Loader2, Sparkles, Wand2, RefreshCw, Map as MapIcon, BookOpen, Activity, AlertCircle, ExternalLink, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { MarkdownRenderer } from './MarkdownRenderer';
import { NovelContext, MessageNode, AppMode, Role, Suggestion } from '../types';
import { getHistoryChain, parseRecordResponse, cleanThinking, executeMapInstructions } from '../utils';
import { callAI } from '../services/aiService';
import { MapVisualizer } from './MapVisualizer';
import { t } from '../utils/i18n';

const VisualizerError: React.FC<{ onShowHelp: () => void }> = ({ onShowHelp }) => (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-600 dark:text-orange-400 text-sm mb-4">
        <AlertCircle size={16} />
        <span className="flex-1">Format mismatch. Showing raw text.</span>
        <button onClick={onShowHelp} className="underline text-xs font-bold hover:text-orange-500">
            See Correct Format
        </button>
    </div>
);

const FormatHelpModal: React.FC<{ type: 'char' | 'plot', onClose: () => void }> = ({ type, onClose }) => (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-card border border-border rounded-xl p-6 max-w-lg w-full shadow-2xl space-y-4 relative">
             <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"><X size={18}/></button>
             <h3 className="font-bold text-lg">Expected Format: {type === 'char' ? 'Character List' : 'Plot/Memory'}</h3>
             <div className="bg-muted/50 p-3 rounded-lg text-xs font-mono whitespace-pre-wrap overflow-x-auto border border-border/50">
{type === 'char' ? `[
  {
    "CharacterName": "Name | Age/Role | Personality | Appearance | Traits"
  },
  {
    "AnotherChar": "..."
  }
]` : `Plot:
Chapter 1 | Time | Place | Person | Event

Memory:
Chapter 1 | Char1 | Char2 : Detail 1; Detail 2; Detail 3
(Use ':' to separate header, ';' for details)`}
             </div>
             <p className="text-sm text-muted-foreground">The AI will usually output this format automatically. You can manually edit the content to match this structure for better visualization.</p>
        </div>
    </div>
);

const ExpandedModal: React.FC<{
  title: string;
  content: string;
  onClose: () => void;
  onSave: (val: string) => void;
  isJson?: boolean;
  fieldKey: string;
}> = ({ title, content, onClose, onSave, isJson, fieldKey }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);
  const [showFormatHelp, setShowFormatHelp] = useState(false);

  useEffect(() => {
    setEditValue(content);
  }, [content]);

  const renderVisualizedContent = () => {
      // (Rendering logic kept same as previous)
      if (fieldKey === 'plotSummary' || fieldKey === 'longTermMemory') {
          const lines = content.split('\n').filter(l => l.trim());
          const hasStructure = lines.some(l => l.includes('|') || l.includes(':') || l.includes('：'));
          if (hasStructure) {
              return (
                  <div className="space-y-3">
                      {lines.map((line, idx) => {
                          if (fieldKey === 'plotSummary') {
                              const parts = line.split('|').map(p => p.trim());
                              if (!line.includes('|')) return <p key={idx} className="text-sm text-muted-foreground">{line}</p>;
                              return (
                                  <div key={idx} className="bg-card border border-border p-4 rounded-lg shadow-sm">
                                      <div className="flex flex-wrap items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                          {parts[0] && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded">{parts[0]}</span>}
                                          {parts[1] && <span className="flex items-center gap-1 border border-border px-2 py-0.5 rounded">{parts[1]}</span>}
                                          {parts[2] && <span className="flex items-center gap-1 border border-border px-2 py-0.5 rounded">{parts[2]}</span>}
                                      </div>
                                      <div className="font-medium text-foreground">{parts.slice(3).join(' - ')}</div>
                                  </div>
                              );
                          } else {
                               const colonMatch = line.match(/[:：]/);
                               let tags: string[] = [];
                               let detailsRaw = "";
                               if (colonMatch && colonMatch.index !== undefined) {
                                   const header = line.substring(0, colonMatch.index);
                                   detailsRaw = line.substring(colonMatch.index + 1);
                                   tags = header.split('|').map(t => t.trim()).filter(Boolean);
                               } else {
                                   const parts = line.split('|').map(t => t.trim());
                                   if (parts.length > 1) { tags = parts.slice(0, -1); detailsRaw = parts[parts.length - 1]; }
                                   else { detailsRaw = line; }
                               }
                               const details = detailsRaw.split(/[;；]/).map(d => d.trim()).filter(Boolean);
                               return (
                                   <div key={idx} className="bg-card border border-border p-3 rounded-lg shadow-sm flex flex-col gap-3">
                                       {tags.length > 0 && (
                                           <div className="flex flex-wrap gap-1.5 border-b border-border/40 pb-2">
                                               {tags.map((t, i) => (
                                                   <span key={i} className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${i === 0 ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground border-border/50'}`}>{t}</span>
                                               ))}
                                           </div>
                                       )}
                                       <div className="space-y-1.5">
                                           {details.length > 0 ? details.map((detail, i) => <div key={i} className="flex gap-2 text-sm text-foreground/90 leading-relaxed"><span className="text-primary/40 mt-1.5 text-[10px]">•</span><span>{detail}</span></div>) : <p className="text-sm text-muted-foreground italic">No details provided.</p>}
                                       </div>
                                   </div>
                               );
                          }
                      })}
                  </div>
              );
          } else {
             return <><VisualizerError onShowHelp={() => setShowFormatHelp(true)} /><MarkdownRenderer content={content} /></>;
          }
      }
      if (isJson) {
          try {
              const parsed = JSON.parse(content);
              if (Array.isArray(parsed)) {
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {parsed.map((char: any, idx: number) => {
                       const entries = Object.entries(char);
                       if (entries.length === 0) return null;
                       const [name, rawDetails] = entries[0];
                       const details = typeof rawDetails === 'string' ? rawDetails : JSON.stringify(rawDetails);
                       const parts = details.split('|').map(p => p.trim()).filter(Boolean);
                       return (
                         <div key={idx} className="border border-border p-4 rounded-xl bg-card shadow-sm hover:shadow-md transition-shadow">
                           <h4 className="font-bold text-lg mb-3 text-primary border-b border-border/50 pb-2">{name}</h4>
                           <div className="space-y-2">
                               {parts.map((part, i) => <div key={i} className="text-sm text-muted-foreground bg-muted/30 p-2 rounded flex gap-2"><span className="text-primary/50">•</span><span>{part}</span></div>)}
                           </div>
                         </div>
                       )
                    })}
                  </div>
                );
              }
            } catch (e) {
              return <><VisualizerError onShowHelp={() => setShowFormatHelp(true)} /><MarkdownRenderer content={content} /></>;
            }
      }
      return <MarkdownRenderer content={content} />;
  };

  const handleSave = () => { onSave(editValue); setIsEditing(false); };

  return createPortal(
    <>
    {showFormatHelp && <FormatHelpModal type={isJson ? 'char' : 'plot'} onClose={() => setShowFormatHelp(false)} />}
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 md:p-8">
      <div className="bg-card w-full max-w-5xl h-[85vh] border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-accordion-down relative">
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-3">
             <h2 className="text-xl font-bold">{title}</h2>
             {!isEditing ? <Button variant="ghost" size="sm" onClick={() => { setEditValue(content); setIsEditing(true); }} className="gap-1 text-xs"><Edit3 size={14}/> Edit</Button> : <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} className="gap-1 text-xs"><Eye size={14}/> Preview</Button>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X size={20}/></Button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-background/50">
           {isEditing ? <textarea className="w-full h-full min-h-[50vh] p-4 bg-background border border-input rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20" value={editValue} onChange={e => setEditValue(e.target.value)} /> : renderVisualizedContent()}
        </div>
        {isEditing && <div className="p-4 border-t border-border flex justify-end gap-2 bg-background"><Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button><Button onClick={handleSave} className="gap-2"><Save size={16}/> Save Changes</Button></div>}
      </div>
    </div>
    </>,
    document.body
  );
};

const getPreviewText = (content: string, type: 'json' | 'lines', itemLabel: string): string | null => {
    if (!content || !content.trim()) return null;
    let count = 0;
    if (type === 'json') { try { const parsed = JSON.parse(content); count = Array.isArray(parsed) ? parsed.length : 0; } catch { return "Raw Data"; } }
    else { count = content.split('\n').filter(l => l.trim()).length; }
    if (count === 0) return null;
    if (itemLabel === 'Memory') return `${count} Memor${count !== 1 ? 'ies' : 'y'}`;
    if (itemLabel === 'Entry') return `${count} Entr${count !== 1 ? 'ies' : 'y'}`;
    return `${count} ${itemLabel}${count !== 1 ? 's' : ''}`;
};

const ContextFieldTrigger: React.FC<{ label: string; preview: string | null; onClick: () => void; isRecordPending: boolean; }> = ({ label, preview, onClick, isRecordPending }) => (
    <div onClick={onClick} className={`group border rounded-lg p-3 bg-card/50 hover:bg-accent/50 cursor-pointer transition-all relative overflow-hidden ${isRecordPending ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border/50 hover:border-primary/30'}`}>
      {isRecordPending && <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] z-10 flex items-center justify-center animate-in fade-in duration-300"><div className="flex flex-col items-center gap-2"><div className="relative"><Loader2 size={20} className="text-primary animate-spin" /><Sparkles size={10} className="text-primary absolute -top-1 -right-2 animate-pulse" /></div><span className="text-[10px] font-bold text-primary tracking-widest uppercase animate-pulse">Analyzing</span></div></div>}
      <div className="flex items-center justify-between mb-2"><label className="text-xs font-bold uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors">{label}</label><Maximize2 size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" /></div>
      <div className={`text-sm h-6 font-mono flex items-center overflow-hidden text-ellipsis ${preview ? 'text-primary font-medium' : 'text-muted-foreground italic'}`}>{preview || "Empty..."}</div>
    </div>
);

// --- MAIN RIGHT PANEL ---

export const RightPanel: React.FC = () => {
  const {
      sessions, currentSessionId, updateContext, mobileRightPanelOpen,
      toggleMobileRightPanel, settings, setSettings, updateSuggestions, openDialog,
      toggleAutoMapUpdate, updateMap, toggleFlashMode
  } = useStore();
  const session = sessions.find(s => s.id === currentSessionId);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'context' | 'map'>('context');
  const [expandedField, setExpandedField] = useState<{title: string, field: keyof NovelContext, content: string, isJson?: boolean} | null>(null);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [mapUpdating, setMapUpdating] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [localMemoryRounds, setLocalMemoryRounds] = useState(settings.memoryRounds.toString());

  useEffect(() => { setLocalMemoryRounds(settings.memoryRounds.toString()); }, [settings.memoryRounds]);

  const handleMemoryBlur = () => {
    let val = parseFloat(localMemoryRounds);
    if (isNaN(val) || val < 0) val = 0;
    const normalized = Math.floor(val);
    setSettings({ memoryRounds: normalized });
    setLocalMemoryRounds(normalized.toString());
  };

  const isPending = useMemo(() => {
     if (!session) return false;
     const history = getHistoryChain(session.messages, session.currentLeafId);
     return history.some(n => n.isRecordPending);
  }, [session]);

  const handleGenerateSuggestions = async () => {
      if (!session || !settings.apiKey) { openDialog({ title: t('dialog.apiRequired'), description: t('dialog.apiDesc'), singleButton: true }); return; }
      setSuggestionLoading(true);
      try {
          const history = getHistoryChain(session.messages, session.currentLeafId);
          const lastAssistantMsg = [...history].reverse().find(n => n.role === Role.Assistant);
          const latestReply = lastAssistantMsg ? cleanThinking(lastAssistantMsg.content) : '';
          const variables = { Mode: AppMode.Suggestion, novelSetting: session.context.novelSetting, plotSummary: session.context.plotSummary, characterList: session.context.characterList, longTermMemory: session.context.longTermMemory, latestAiReply: latestReply, suggestQuery: suggestionQuery || "Next plot suggestions", };
          const response = await callAI(AppMode.Suggestion, 'suggestion', variables);
          const parsed = parseRecordResponse(response.answer);

          if (parsed && parsed.suggestion) {
              // Sanitize: Ensure flat object of strings
              const safeSuggestions: Suggestion = {};
              if (typeof parsed.suggestion === 'object' && parsed.suggestion !== null) {
                  Object.entries(parsed.suggestion).forEach(([k, v]) => {
                      if (typeof v === 'string') {
                          safeSuggestions[k] = v;
                      } else if (typeof v === 'object' && v !== null) {
                          safeSuggestions[k] = JSON.stringify(v);
                      } else {
                          safeSuggestions[k] = String(v);
                      }
                  });
                  updateSuggestions(safeSuggestions);
              } else {
                  throw new Error("Invalid suggestions format");
              }
          } else {
              throw new Error("Failed to parse suggestions from AI response");
          }
      } catch (err: any) { openDialog({ title: t('dialog.suggestionFailed'), description: err.message, singleButton: true, variant: 'destructive' }); } finally { setSuggestionLoading(false); }
  };

  const handleManualMapUpdate = async () => {
    if (!session || !settings.apiKey) return;
    setMapUpdating(true);
    try {
        const history = getHistoryChain(session.messages, session.currentLeafId);
        const lastAssistantMsg = [...history].reverse().find(n => n.role === Role.Assistant);
        const latestReply = lastAssistantMsg ? cleanThinking(lastAssistantMsg.content) : '';
        const variables = { Mode: AppMode.Map, novelSetting: session.context.novelSetting, latestAiReply: latestReply, mapView: JSON.stringify(session.mapView) };
        const response = await callAI(AppMode.Map, 'update_map', variables);
        const parsed = parseRecordResponse(response.answer);
        if (parsed && parsed.instructions) { updateMap(parsed.instructions, 'ai'); } else { throw new Error("Invalid Map Instructions Format. Expected { instructions: [...] }"); }
    } catch (err: any) { openDialog({ title: t('dialog.mapUpdateFailed'), description: err.message, singleButton: true, variant: 'destructive' }); } finally { setMapUpdating(false); }
  };

  if (isCollapsed) {
    return <div className="hidden md:flex w-12 border-l border-border bg-card flex-col items-center py-4 gap-4 h-full"><Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)}><ChevronLeft size={20} /></Button><div className="h-full flex items-center justify-center pb-20"><span className="transform -rotate-90 whitespace-nowrap text-xs font-bold tracking-widest text-muted-foreground select-none">PANEL</span></div></div>;
  }

  const renderContextTab = () => {
      if (!session) return null;
      const handleUpdate = (val: string) => { if (expandedField) { updateContext({ [expandedField.field]: val }); setExpandedField(null); } };
      const insertSuggestion = (text: string) => { const event = new CustomEvent('insertSuggestion', { detail: text }); window.dispatchEvent(event); if (window.innerWidth < 768) { toggleMobileRightPanel(false); } };

      // Strict check to ensure suggestions is a valid object before rendering
      const hasSuggestions = session.suggestions && typeof session.suggestions === 'object' && Object.keys(session.suggestions).length > 0;

      return (
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="p-4 bg-muted/20 rounded-xl border border-border space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><Settings2 size={12} /><span>{t('rightPanel.memoryConfig')}</span></div>
                <div className="flex items-center justify-between gap-4"><label className="text-sm text-foreground/80">{t('rightPanel.memoryRounds')}</label><div className="flex items-center gap-2"><input type="number" min="0" max="50" step="1" className="w-16 p-1 text-center border border-input rounded bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary" value={localMemoryRounds} onChange={e => setLocalMemoryRounds(e.target.value)} onBlur={handleMemoryBlur} /></div></div>

                <div className="h-px bg-border/50 my-2" />

                {/* Flash Mode Toggle (Context Tab) */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Zap size={14} className={session.flashModeEnabled ? "text-yellow-500" : "text-muted-foreground"} />
                        <label className="text-sm text-foreground/80 cursor-pointer" onClick={() => toggleFlashMode()}>{t('rightPanel.fastCreation')}</label>
                    </div>
                    <div
                        onClick={() => toggleFlashMode()}
                        className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${session.flashModeEnabled ? 'bg-yellow-500' : 'bg-zinc-700'}`}
                    >
                        <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${session.flashModeEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                </div>
            </div>
            <div className="relative group rounded-xl overflow-hidden border border-primary/10 bg-primary/5">
                <div className="p-4 space-y-3">
                    <h3 className="text-sm font-bold text-primary flex items-center gap-2">{t('rightPanel.aiSuggestions')}</h3>
                    <textarea className="w-full text-xs p-2 rounded border border-primary/20 bg-background/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none min-h-[40px]" placeholder={t('rightPanel.guidance')} rows={2} value={suggestionQuery} onChange={(e) => setSuggestionQuery(e.target.value)} />
                    <Button size="sm" className={`w-full gap-2 ${hasSuggestions ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80' : 'bg-primary text-primary-foreground'}`} onClick={handleGenerateSuggestions} disabled={suggestionLoading}>{suggestionLoading ? <><Loader2 size={14} className="animate-spin"/> {t('chat.thinking')}</> : hasSuggestions ? <><RefreshCw size={14}/> {t('rightPanel.regenerate')}</> : <><Wand2 size={14}/> {t('rightPanel.generate')}</>}</Button>
                    {hasSuggestions && (
                        <div className="flex flex-col gap-2 mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
                            {Object.entries(session.suggestions || {}).map(([key, value]) => {
                                // Defensive check to ensure value is renderable (string)
                                const displayValue = typeof value === 'string' ? value : JSON.stringify(value);
                                return (
                                    <button key={key} onClick={() => insertSuggestion(displayValue)} className="text-left text-xs p-3 rounded-lg border border-background bg-background hover:border-primary/50 hover:shadow-sm transition-all group">
                                        <span className="font-bold mr-2 text-primary bg-primary/10 px-1.5 rounded inline-block mb-1">{key}</span>
                                        <div className="text-muted-foreground group-hover:text-foreground prose prose-sm dark:prose-invert max-w-none">
                                            <ReactMarkdown>{displayValue}</ReactMarkdown>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            <div className="space-y-3">
                <ContextFieldTrigger label={t('rightPanel.plotSummary')} preview={getPreviewText(session.context.plotSummary, 'lines', 'Record')} isRecordPending={isPending} onClick={() => setExpandedField({ title: t('rightPanel.plotSummary'), field: 'plotSummary', content: session.context.plotSummary })} />
                <ContextFieldTrigger label={t('rightPanel.characterList')} preview={getPreviewText(session.context.characterList, 'json', 'Character')} isRecordPending={isPending} onClick={() => setExpandedField({ title: t('rightPanel.characterList'), field: 'characterList', content: session.context.characterList, isJson: true })} />
                <ContextFieldTrigger label={t('rightPanel.longTermMemory')} preview={getPreviewText(session.context.longTermMemory, 'lines', 'Memory')} isRecordPending={isPending} onClick={() => setExpandedField({ title: t('rightPanel.longTermMemory'), field: 'longTermMemory', content: session.context.longTermMemory })} />
                <ContextFieldTrigger label={t('rightPanel.novelSetting')} preview={getPreviewText(session.context.novelSetting, 'lines', 'Entry')} isRecordPending={isPending} onClick={() => setExpandedField({ title: t('rightPanel.novelSetting'), field: 'novelSetting', content: session.context.novelSetting })} />
            </div>
            {expandedField && <ExpandedModal title={expandedField.title} content={session.context[expandedField.field]} isJson={expandedField.isJson} fieldKey={expandedField.field} onClose={() => setExpandedField(null)} onSave={handleUpdate} />}
        </div>
      );
  };

  const renderMapTab = () => {
      if (!session) return null;
      return (
          <div className="flex-1 flex flex-col h-full bg-zinc-950 relative items-center justify-center p-6 text-center border-t border-zinc-900">
               <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6 border border-zinc-800 shadow-inner">
                   <MapIcon size={32} className="text-cyan-500 opacity-80" />
               </div>

               <h3 className="text-zinc-300 font-bold mb-2 tracking-wide">{t('rightPanel.neuralMap')}</h3>
               <p className="text-zinc-500 text-xs mb-8 max-w-[220px] leading-relaxed">
                   Visualize your story setting and plot structure in an interactive, blueprint-style node editor.
               </p>

               <div className="flex flex-col gap-3 w-full max-w-[200px]">
                   <Button onClick={() => setIsMapExpanded(true)} className="gap-2 bg-cyan-600 hover:bg-cyan-500 text-white border-none shadow-lg shadow-cyan-900/20">
                       <Maximize2 size={16}/> {t('rightPanel.openMap')}
                   </Button>

                   <Button
                        variant="secondary"
                        onClick={handleManualMapUpdate}
                        disabled={mapUpdating}
                        className="gap-2 bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800"
                    >
                        {mapUpdating ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
                        {t('rightPanel.updateMap')}
                   </Button>
               </div>

               <div className="mt-8 flex flex-col gap-3 w-full px-4">
                   <div className="flex items-center gap-3 bg-zinc-900/50 p-2 rounded-lg border border-zinc-800">
                       <div className={`w-2 h-2 rounded-full flex-shrink-0 ${session.autoMapUpdate ? 'bg-green-500 animate-pulse' : 'bg-zinc-700'}`} />
                       <button
                           onClick={() => toggleAutoMapUpdate()}
                           className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:text-white transition-colors flex-1 text-left"
                       >
                           {t('rightPanel.autoSync')}: {session.autoMapUpdate ? 'ON' : 'OFF'}
                       </button>
                   </div>
               </div>

               {isMapExpanded && (
                   <MapVisualizer
                        data={session.mapView}
                        isExpanded={true}
                        onClose={() => setIsMapExpanded(false)}
                   />
               )}
          </div>
      );
  };

  return (
    <>
      {mobileRightPanelOpen && <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden" onClick={() => toggleMobileRightPanel(false)} />}
      <div className={`fixed inset-y-0 right-0 z-50 w-80 bg-card border-l border-border flex flex-col transition-transform duration-300 transform ${mobileRightPanelOpen ? 'translate-x-0' : 'translate-x-full'} md:relative md:translate-x-0 md:flex md:w-96 md:h-full`}>
        <div className="h-14 border-b border-border flex items-center justify-between px-2 bg-card/50 backdrop-blur flex-shrink-0">
          <div className="flex gap-1 bg-muted/30 p-1 rounded-lg">
             <button onClick={() => setActiveTab('context')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${activeTab === 'context' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}><BookOpen size={14} /> {t('rightPanel.context')}</button>
             <button onClick={() => setActiveTab('map')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${activeTab === 'map' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}><MapIcon size={14} /> {t('rightPanel.mapView')}</button>
          </div>
          <div className="flex gap-1">
             <Button variant="ghost" size="icon" className="md:hidden" onClick={() => toggleMobileRightPanel(false)}><X size={18} /></Button>
             <Button variant="ghost" size="icon" className="hidden md:flex" onClick={() => setIsCollapsed(true)}><ChevronRight size={18} /></Button>
          </div>
        </div>
        {session ? (activeTab === 'context' ? renderContextTab() : renderMapTab()) : <div className="p-4 text-sm text-muted-foreground">{t('dialog.selectSession')}</div>}
      </div>
    </>
  );
};
