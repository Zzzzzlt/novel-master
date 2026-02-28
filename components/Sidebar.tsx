
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import { Button } from './ui/Button';
import { AuthButton } from './AuthDialog';
import { authService } from '../services/auth';
import { Plus, Trash2, Settings, Download, Upload, MessageSquare, Moon, Sun, Laptop, X, Edit3, Check, FileText, ShieldOff } from 'lucide-react';
import { getHistoryChain, cleanThinking } from '../utils';
import { Role, AppMode } from '../types';
import { t } from '../utils/i18n';

export const Sidebar: React.FC = () => {
  const {
    sessions,
    currentSessionId,
    createSession,
    selectSession,
    deleteSession,
    importSession,
    renameSession,
    settings,
    setSettings,
    mobileSidebarOpen,
    toggleMobileSidebar,
    openDialog,
    showSettings,
    setShowSettings
  } = useStore();

  // Local state for settings form inputs, synced when modal opens
  const [apiKeyInput, setApiKeyInput] = useState(settings.apiKey);
  const [renderLimitInput, setRenderLimitInput] = useState(settings.renderMsgLimit);
  const [devModeInput, setDevModeInput] = useState(settings.developerMode);
  const [languageInput, setLanguageInput] = useState(settings.language);
  const [showReasoningInput, setShowReasoningInput] = useState(settings.showReasoning);

  // 模型配置状态
  const [bodyModelTypeInput, setBodyModelTypeInput] = useState(settings.bodyModelType || 'chat');
  const [temperatureInput, setTemperatureInput] = useState(settings.modelParameters?.temperature || 1.0);
  const [topPInput, setTopPInput] = useState(settings.modelParameters?.topP ?? 0.95);
  const [presencePenaltyInput, setPresencePenaltyInput] = useState(settings.modelParameters?.presencePenalty || 0);
  const [frequencyPenaltyInput, setFrequencyPenaltyInput] = useState(settings.modelParameters?.frequencyPenalty || 0);
  const [maxTokensInput, setMaxTokensInput] = useState(settings.modelParameters?.maxTokens || 4096);

  // Renaming state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Sync inputs when settings modal opens (via global state)
  useEffect(() => {
    if (showSettings) {
       setApiKeyInput(settings.apiKey);
       setRenderLimitInput(settings.renderMsgLimit || 0);
       // 根据用户角色设置开发者模式
       const canUseDevMode = authService.hasDevMode();
       setDevModeInput(canUseDevMode ? (settings.developerMode || false) : false);
       setLanguageInput(settings.language || 'en');
       // 根据用户角色设置推理显示 - 普通用户强制关闭
       const canShowReasoning = authService.canShowReasoning();
       setShowReasoningInput(canShowReasoning ? (settings.showReasoning || false) : false);
       // 同步模型配置
       setBodyModelTypeInput(settings.bodyModelType || 'chat');
       setTemperatureInput(settings.modelParameters?.temperature ?? 1.0);
       setTopPInput(settings.modelParameters?.topP ?? 1.0);
       setPresencePenaltyInput(settings.modelParameters?.presencePenalty ?? 0);
       setFrequencyPenaltyInput(settings.modelParameters?.frequencyPenalty ?? 0);
       setMaxTokensInput(settings.modelParameters?.maxTokens ?? 4096);
    }
  }, [showSettings, settings]);

  // 用户权限检查
  const isAdmin = authService.isAdmin();
  const canShowReasoning = authService.canShowReasoning();
  const canUseDevMode = authService.hasDevMode();

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const session = JSON.parse(event.target?.result as string);
        if (session.id && session.messages) {
          importSession(session);
        } else {
          openDialog({
              title: t('dialog.importError'),
              description: t('dialog.invalidFormat'),
              singleButton: true,
              variant: 'destructive'
          });
        }
      } catch (err) {
        openDialog({
              title: t('dialog.importError'),
              description: t('dialog.parseError'),
              singleButton: true,
              variant: 'destructive'
          });
      }
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const session = sessions.find(s => s.id === currentSessionId);
    if (!session) return;
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.name || 'session'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportNovel = () => {
    const session = sessions.find(s => s.id === currentSessionId);
    if (!session) return;

    // Get linear history based on current view
    const history = getHistoryChain(session.messages, session.currentLeafId);

    // Filter for Assistant messages in Body mode
    const storyParts = history
      .filter(node => {
          const isAssistant = node.role === Role.Assistant;
          const mode = node.metadata?.mode || node.mode;
          // We strictly want Body mode (Story content), excluding Setting mode or Record mode.
          return isAssistant && mode === AppMode.Body;
      })
      .map(node => cleanThinking(node.content).trim())
      .filter(text => text.length > 0);

    const fullText = `# ${session.name || 'Novel Draft'}\n\n${storyParts.join('\n\n')}`;

    const blob = new Blob([fullText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.name || 'novel'}_draft.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleTheme = () => {
    const modes: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system'];
    const currentIdx = modes.indexOf(settings.theme);
    const nextTheme = modes[(currentIdx + 1) % modes.length];

    setSettings({ theme: nextTheme });
    // Note: App.tsx handles the actual class application
  };

  const getThemeIcon = () => {
      switch(settings.theme) {
          case 'dark': return <Moon size={16} />;
          case 'system': return <Laptop size={16} />;
          default: return <Sun size={16} />;
      }
  };

  const getThemeLabel = () => {
      switch(settings.theme) {
          case 'dark': return t('theme.dark');
          case 'system': return t('theme.system');
          default: return t('theme.light');
      }
  };

  const openSettingsModal = () => {
    setShowSettings(true);
  };

  const saveSettings = () => {
    setSettings({
      apiKey: apiKeyInput,
      renderMsgLimit: Number(renderLimitInput),
      developerMode: devModeInput,
      language: languageInput,
      showReasoning: showReasoningInput,
      bodyModelType: bodyModelTypeInput,
      modelParameters: {
        temperature: temperatureInput,
        topP: topPInput,
        presencePenalty: presencePenaltyInput,
        frequencyPenalty: frequencyPenaltyInput,
        maxTokens: maxTokensInput
      }
    });
    setShowSettings(false);
  };

  const startRenaming = (e: React.MouseEvent, id: string, currentName: string) => {
      e.stopPropagation();
      setRenamingId(id);
      setRenameValue(currentName);
  };

  const submitRename = (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (renamingId && renameValue.trim()) {
          renameSession(renamingId, renameValue.trim());
      }
      setRenamingId(null);
  };

  return (
    <>
    {/* Mobile Overlay Backdrop */}
    {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden" onClick={() => toggleMobileSidebar(false)} />
    )}

    <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col transition-transform duration-300 transform
        ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 md:flex md:h-full
    `}>
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h1 className="font-bold text-lg">{t('app.title')}</h1>
        <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={toggleTheme} title={`${t('settings.language')}: ${getThemeLabel()}`}>
                {getThemeIcon()}
            </Button>
            {/* Mobile Close Button */}
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => toggleMobileSidebar(false)}>
                <X size={16}/>
            </Button>
        </div>
      </div>

      <div className="p-2">
        <Button
          className="w-full justify-start gap-2 dark:bg-neutral-300 dark:hover:bg-neutral-200 dark:text-black transition-colors"
          onClick={() => createSession()}
        >
          <Plus size={16} /> {t('sidebar.newStory')}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {sessions.map(s => (
          <div
            key={s.id}
            className={`group flex items-center justify-between p-2 rounded-md text-sm cursor-pointer hover:bg-accent ${currentSessionId === s.id ? 'bg-accent text-accent-foreground' : ''}`}
            onClick={() => selectSession(s.id)}
          >
             <div className="flex items-center gap-2 flex-1 min-w-0">
               <MessageSquare size={14} className="text-muted-foreground flex-shrink-0"/>

               {renamingId === s.id ? (
                   <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                       <input
                           className="w-full bg-background border border-input rounded px-1 py-0.5 text-xs"
                           value={renameValue}
                           onChange={e => setRenameValue(e.target.value)}
                           onKeyDown={e => e.key === 'Enter' && submitRename()}
                           autoFocus
                       />
                       <button onClick={submitRename} className="text-green-500 hover:text-green-600"><Check size={14}/></button>
                   </div>
               ) : (
                   <span className="truncate flex-1" onDoubleClick={(e) => startRenaming(e, s.id, s.name)}>{s.name}</span>
               )}
             </div>

             <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                {renamingId !== s.id && (
                    <button onClick={(e) => startRenaming(e, s.id, s.name)} className="p-1 hover:text-primary">
                        <Edit3 size={12}/>
                    </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} className="p-1 hover:text-destructive">
                    <Trash2 size={12} />
                </button>
             </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-border space-y-2">
        <div className="flex gap-2">
          <label className="flex-1">
             <Button variant="outline" size="sm" className="w-full gap-2 cursor-pointer" onClick={() => document.getElementById('import-file')?.click()}>
               <Upload size={14} /> {t('sidebar.import')}
             </Button>
             <input id="import-file" type="file" className="hidden" accept=".json" onChange={handleImport} />
          </label>
          <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={handleExport} disabled={!currentSessionId}>
             <Download size={14} /> {t('sidebar.backup')}
          </Button>
        </div>

        <Button variant="secondary" size="sm" className="w-full gap-2 justify-start" onClick={handleExportNovel} disabled={!currentSessionId}>
             <FileText size={14} /> {t('sidebar.exportNovel')}
        </Button>

        <div className="flex flex-col gap-2">
          <Button variant="ghost" size="sm" className="w-full gap-2 justify-start" onClick={openSettingsModal}>
            <Settings size={14} /> {t('sidebar.settings')}
          </Button>
          <AuthButton />
        </div>
      </div>

      {showSettings && createPortal(
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-card border border-border p-6 rounded-lg w-full max-w-md shadow-lg space-y-4 animate-in fade-in zoom-in duration-200">
             <h2 className="font-bold text-lg">{t('settings.title')}</h2>

             {/* API密钥 - 仅管理员可见 */}
             {isAdmin && (
               <div className="space-y-2">
                 <label className="text-sm font-medium">{t('settings.apiKey')}</label>
                 <input
                   type="password"
                   className="w-full p-2 border border-input rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                   value={apiKeyInput}
                   onChange={e => setApiKeyInput(e.target.value)}
                 />
               </div>
             )}

             {/* 模型类型选择 - 正文模式 */}
             <div className="space-y-2">
               <label className="text-sm font-medium">正文模式模型</label>
               <select
                 className="w-full p-2 border border-input rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                 value={bodyModelTypeInput}
                 onChange={e => setBodyModelTypeInput(e.target.value as 'chat' | 'reasoner')}
               >
                 <option value="chat">Chat 模型 (deepseek-chat)</option>
                 <option value="reasoner">Reasoner 模型 (deepseek-reasoner)</option>
               </select>
               <p className="text-xs text-muted-foreground">
                 Reasoner 模型具有更强的推理能力，适合复杂情节设计
               </p>
             </div>

             {/* 模型高级参数 */}
             <div className="space-y-3 pt-2 border-t border-border">
               <label className="text-sm font-medium">模型参数</label>

               {/* Temperature */}
               <div className="space-y-1">
                 <div className="flex justify-between text-xs">
                   <span>Temperature (随机性)</span>
                   <span className="text-muted-foreground">{temperatureInput}</span>
                 </div>
                 <input
                   type="range"
                   min="0"
                   max="2"
                   step="0.1"
                   className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                   value={temperatureInput}
                   onChange={e => setTemperatureInput(Number(e.target.value))}
                 />
               </div>

               {/* Top P */}
               <div className="space-y-1">
                 <div className="flex justify-between text-xs">
                   <span>Top P (核采样)</span>
                   <span className="text-muted-foreground">{topPInput}</span>
                 </div>
                 <input
                   type="range"
                   min="0"
                   max="1"
                   step="0.05"
                   className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                   value={topPInput}
                   onChange={e => setTopPInput(Number(e.target.value))}
                 />
               </div>

               {/* Presence Penalty */}
               <div className="space-y-1">
                 <div className="flex justify-between text-xs">
                   <span>Presence Penalty (话题创新)</span>
                   <span className="text-muted-foreground">{presencePenaltyInput}</span>
                 </div>
                 <input
                   type="range"
                   min="-2"
                   max="2"
                   step="0.1"
                   className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                   value={presencePenaltyInput}
                   onChange={e => setPresencePenaltyInput(Number(e.target.value))}
                 />
               </div>

               {/* Frequency Penalty */}
               <div className="space-y-1">
                 <div className="flex justify-between text-xs">
                   <span>Frequency Penalty (词汇多样)</span>
                   <span className="text-muted-foreground">{frequencyPenaltyInput}</span>
                 </div>
                 <input
                   type="range"
                   min="-2"
                   max="2"
                   step="0.1"
                   className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                   value={frequencyPenaltyInput}
                   onChange={e => setFrequencyPenaltyInput(Number(e.target.value))}
                 />
               </div>

               {/* Max Tokens - 改为选择框 */}
               <div className="space-y-1">
                 <label className="text-xs">Max Tokens (最大输出)</label>
                 <select
                   className="w-full p-2 text-sm border border-input rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                   value={maxTokensInput}
                   onChange={e => setMaxTokensInput(Number(e.target.value))}
                 >
                   <option value={4096}>4096 (默认)</option>
                   <option value={8192}>8192 (较长)</option>
                   <option value={16384}>无限制 (16384)</option>
                 </select>
               </div>
             </div>

             <div className="space-y-2">
               <label className="text-sm font-medium">{t('settings.maxMessages')}</label>
               <select
                   className="w-full p-2 border border-input rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                   value={renderLimitInput}
                   onChange={e => setRenderLimitInput(Number(e.target.value))}
               >
                   <option value="0">{t('settings.msgOptionAll')}</option>
                   <option value="10">{t('settings.msgOption10')}</option>
                   <option value="20">{t('settings.msgOption20')}</option>
                   <option value="50">{t('settings.msgOption50')}</option>
                   <option value="100">{t('settings.msgOption100')}</option>
               </select>
             </div>
             <div className="space-y-2">
               <label className="text-sm font-medium">{t('settings.language')}</label>
               <select
                   className="w-full p-2 border border-input rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                   value={languageInput}
                   onChange={e => setLanguageInput(e.target.value as 'en' | 'zh')}
               >
                   <option value="en">English</option>
                   <option value="zh">中文</option>
               </select>
             </div>
             {/* 显示推理内容选项 - 仅管理员可见 */}
             {canShowReasoning && (
               <div className="space-y-2 pt-2 border-t border-border">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                      <input
                          type="checkbox"
                          checked={showReasoningInput}
                          onChange={e => setShowReasoningInput(e.target.checked)}
                          className="rounded border-input text-primary focus:ring-primary"
                      />
                      {t('settings.showReasoning')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                     {t('settings.showReasoningDesc')}
                  </p>
               </div>
             )}
             {!canShowReasoning && (
               <div className="space-y-2 pt-2 border-t border-border opacity-50">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-not-allowed">
                      <ShieldOff className="w-4 h-4" />
                      {t('settings.showReasoning')}（普通用户不可用）
                  </label>
                  <p className="text-xs text-muted-foreground">
                     普通用户只能使用不显示推理内容模式
                  </p>
               </div>
             )}
             {/* 开发者模式选项 - 仅管理员可见 */}
             {canUseDevMode && (
               <div className="space-y-2 pt-2 border-t border-border">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                      <input
                          type="checkbox"
                          checked={devModeInput}
                          onChange={e => setDevModeInput(e.target.checked)}
                          className="rounded border-input text-primary focus:ring-primary"
                      />
                      {t('settings.developerMode')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                     {t('settings.developerModeDesc')}
                  </p>
               </div>
             )}
             {!canUseDevMode && (
               <div className="space-y-2 pt-2 border-t border-border opacity-50">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-not-allowed">
                      <ShieldOff className="w-4 h-4" />
                      {t('settings.developerMode')}（普通用户不可用）
                  </label>
                  <p className="text-xs text-muted-foreground">
                     普通用户无法使用开发者模式
                  </p>
               </div>
             )}
             <div className="flex gap-2 justify-end pt-4">
               <Button variant="outline" onClick={() => setShowSettings(false)}>{t('settings.cancel')}</Button>
               <Button onClick={saveSettings}>{t('settings.save')}</Button>
             </div>
           </div>
        </div>,
        document.body
      )}
    </div>
    </>
  );
};
