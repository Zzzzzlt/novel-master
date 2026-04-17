import React, { Component, ErrorInfo, ReactNode } from "react";
import { Trash2, AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };
  // Explicitly declare props to satisfy TS if Component interface resolution fails
  declare props: Readonly<Props>;

  constructor(props: Props) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  handleReset = () => {
    // Clear the specific key used by Zustand persist
    localStorage.removeItem('dify-novelist-storage');
    // Clear everything else just in case
    localStorage.clear();
    window.location.reload();
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-200 p-6 text-center font-sans">
          <div className="bg-zinc-900 border border-red-900/50 p-8 rounded-xl max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-300">
            <div className="mx-auto w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mb-6">
                <AlertTriangle className="text-red-500" size={32} />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-2">Application Error</h2>
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
              The application encountered a critical error, likely due to corrupted cached data. 
            </p>
            
            <div className="bg-black/50 border border-zinc-800 p-3 rounded text-xs font-mono text-red-300 mb-8 text-left overflow-auto max-h-32">
                {this.state.error?.message || "Unknown Error"}
            </div>
            
            <div className="space-y-3">
                <button
                  onClick={this.handleReset}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white px-4 py-3 rounded-lg font-bold transition-all shadow-lg shadow-red-900/20"
                >
                  <Trash2 size={18} />
                  Clear Data & Reset
                </button>
                
                <button
                    onClick={this.handleReload}
                    className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-3 rounded-lg font-medium transition-all"
                >
                    <RefreshCcw size={16} />
                    Try Reloading
                </button>
            </div>
            
            <p className="mt-6 text-[10px] text-zinc-600">
                Warning: "Clear Data" will remove all locally saved stories and settings.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}