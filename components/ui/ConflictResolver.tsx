import React from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store/useStore';
import { ConflictType } from '../../types';
import { Button } from './Button';
import { ArrowRight, User, FileText, AlertTriangle } from 'lucide-react';
import { MarkdownRenderer } from '../MarkdownRenderer';

export const ConflictResolver: React.FC = () => {
    const { conflicts, resolveConflict } = useStore();

    if (conflicts.length === 0) return null;

    const currentConflict = conflicts[0];

    const handleResolve = (choice: 'keep_existing' | 'use_new') => {
        currentConflict.onResolve(choice);
        resolveConflict(currentConflict.id);
    };

    const renderDiff = () => {
        const { existingData, newData, key } = currentConflict.payload;

        if (currentConflict.type === ConflictType.CHARACTER) {
            return (
                <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="bg-muted/30 p-3 rounded-lg border border-border">
                        <div className="text-xs font-bold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                            <User size={12}/> Existing Character
                        </div>
                        <div className="text-sm font-medium">{key}</div>
                        <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto">
                            {JSON.stringify(existingData, null, 2)}
                        </div>
                    </div>
                    <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
                        <div className="text-xs font-bold text-primary uppercase mb-2 flex items-center gap-1">
                            <User size={12}/> New Version
                        </div>
                        <div className="text-sm font-medium">{key}</div>
                        <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto">
                            {JSON.stringify(newData, null, 2)}
                        </div>
                    </div>
                </div>
            );
        }

        // Record Overwrite
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div className="bg-muted/30 p-3 rounded-lg border border-border">
                    <div className="text-xs font-bold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                        <FileText size={12}/> Previous Record Result
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto">
                        <MarkdownRenderer content={typeof existingData === 'string' ? existingData : JSON.stringify(existingData)} className="text-xs" />
                    </div>
                </div>
                <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
                    <div className="text-xs font-bold text-primary uppercase mb-2 flex items-center gap-1">
                        <FileText size={12}/> New Record Result
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto">
                         <MarkdownRenderer content={typeof newData === 'string' ? newData : JSON.stringify(newData)} className="text-xs" />
                    </div>
                </div>
            </div>
        );
    };

    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card w-full max-w-2xl border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                
                <div className="p-4 border-b border-border bg-muted/20 flex items-center gap-3">
                    <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-full text-orange-600 dark:text-orange-400">
                        <AlertTriangle size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">{currentConflict.title}</h3>
                        <p className="text-sm text-muted-foreground">{currentConflict.description}</p>
                    </div>
                    <div className="ml-auto text-xs font-mono bg-background border px-2 py-1 rounded">
                        Remaining: {conflicts.length}
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {renderDiff()}
                    <p className="text-center text-sm text-muted-foreground mt-6 italic">
                        {currentConflict.type === ConflictType.CHARACTER 
                         ? "Select which version to keep. The other will be discarded."
                         : "You are re-recording on the same message. Do you want to keep the old result or overwrite it with the new one?"}
                    </p>
                </div>

                <div className="p-4 bg-muted/20 border-t border-border flex justify-end gap-3">
                    <Button variant="secondary" onClick={() => handleResolve('keep_existing')}>
                        Keep Existing
                    </Button>
                    <Button variant="primary" onClick={() => handleResolve('use_new')} className="gap-2">
                        Use New <ArrowRight size={14}/>
                    </Button>
                </div>

            </div>
        </div>,
        document.body
    );
};
