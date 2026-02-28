import React from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store/useStore';
import { Button } from './Button';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export const GlobalDialog: React.FC = () => {
  const { dialog, closeDialog } = useStore();
  
  if (!dialog.isOpen) return null;

  const handleConfirm = () => {
      if (dialog.onConfirm) {
          dialog.onConfirm();
      }
      closeDialog();
  };

  const getIcon = () => {
      switch(dialog.variant) {
          case 'destructive': return <AlertCircle className="text-destructive" size={28} />;
          case 'info': return <Info className="text-primary" size={28} />;
          default: return <AlertTriangle className="text-orange-500" size={28} />;
      }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-sm border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-border/50 flex items-center justify-between bg-muted/20">
             <div className="flex items-center gap-3">
                 {getIcon()}
                 <h3 className="font-bold text-lg">{dialog.title}</h3>
             </div>
             {!dialog.singleButton && (
                 <button onClick={closeDialog} className="text-muted-foreground hover:text-foreground">
                     <X size={20} />
                 </button>
             )}
        </div>

        {/* Content */}
        <div className="p-6">
            <p className="text-muted-foreground text-sm leading-relaxed">
                {dialog.description}
            </p>
        </div>

        {/* Footer */}
        <div className="p-4 bg-muted/20 flex justify-end gap-2 border-t border-border/50">
            {!dialog.singleButton && (
                <Button variant="ghost" onClick={closeDialog}>
                    {dialog.cancelLabel || 'Cancel'}
                </Button>
            )}
            <Button 
                variant={dialog.variant === 'destructive' ? 'destructive' : 'primary'}
                onClick={handleConfirm}
                autoFocus
            >
                {dialog.confirmLabel || (dialog.singleButton ? 'OK' : 'Confirm')}
            </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};
