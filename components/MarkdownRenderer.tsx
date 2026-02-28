
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import { ChevronDown, ChevronRight, Brain, BookOpen } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const ThinkBlock: React.FC<{ content: string; isFinished: boolean }> = ({ content, isFinished }) => {
  // 初始状态：如果是正在推理中（isFinished=false），默认展开；推理结束则折叠
  const [isOpen, setIsOpen] = useState(!isFinished);
  const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false);

  // Auto-collapse when thinking is finished
  useEffect(() => {
    if (isFinished && !hasAutoCollapsed) {
      setIsOpen(false);
      setHasAutoCollapsed(true);
    }
  }, [isFinished, hasAutoCollapsed]);

  if (!content) return null;

  return (
    <div className="my-2 rounded-md border border-border bg-muted/30 overflow-hidden mb-6">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 p-2 text-xs font-bold uppercase tracking-wider text-muted-foreground bg-muted/50 hover:bg-muted/70 transition-colors select-none"
      >
        <div className="flex items-center gap-1">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Brain size={14} className="opacity-70" />
        </div>
        Thinking Process {isFinished ? '' : '(Thinking...)'}
      </button>
      {isOpen && (
        <div className="p-4 text-sm text-muted-foreground italic border-t border-border/50 bg-background/50">
           <div className="prose dark:prose-invert max-w-none text-xs leading-relaxed font-mono">
             <ReactMarkdown 
               rehypePlugins={[rehypeRaw, rehypeHighlight]}
             >
               {content}
             </ReactMarkdown>
           </div>
        </div>
      )}
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  let thoughtContent = '';
  let mainContent = content;
  let isThinkFinished = false;

  const thinkRegex = /^<think>([\s\S]*?)(?:<\/think>|$)/;
  const match = content.match(thinkRegex);

  if (match) {
    thoughtContent = match[1];
    if (match[0].endsWith('</think>')) {
        isThinkFinished = true;
        mainContent = content.substring(match[0].length);
    } else {
        isThinkFinished = false;
        mainContent = ''; 
    }
  }

  if (isThinkFinished && mainContent) {
      mainContent = mainContent.replace(/^\n+/, '');
  }

  // Pre-process REF tags for rendering as custom HTML/Components inside markdown
  // Pattern: [[REF:nodeId:Title]]
  // We can't easily inject React components into ReactMarkdown string, but we can replace with HTML if we use rehype-raw
  // Or better, we parse it out. Since we are using rehype-raw, we can try injecting HTML span.
  const processedMainContent = mainContent.replace(
      /\[\[REF:([a-zA-Z0-9]+):(.*?)\]\]/g, 
      '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20 align-middle select-none mr-1 mb-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg> $2</span>'
  );

  return (
    <div className={`prose dark:prose-invert max-w-none text-base leading-7 tracking-wide text-foreground/90 ${className}`}>
      {thoughtContent && (
        <ThinkBlock content={thoughtContent} isFinished={isThinkFinished} />
      )}
      
      {mainContent && (
        <ReactMarkdown 
          rehypePlugins={[rehypeRaw, rehypeHighlight]}
          components={{
              blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary/50 pl-4 italic bg-muted/50 p-3 rounded my-4" {...props} />,
              p: ({node, ...props}) => <p className="mb-4 last:mb-0" {...props} />,
              h1: ({node, ...props}) => <h1 className="text-2xl font-bold mt-6 mb-4" {...props} />,
              h2: ({node, ...props}) => <h2 className="text-xl font-bold mt-5 mb-3" {...props} />,
              h3: ({node, ...props}) => <h3 className="text-lg font-bold mt-4 mb-2" {...props} />,
              ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-4 space-y-1" {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal pl-6 mb-4 space-y-1" {...props} />,
          }}
        >
          {processedMainContent}
        </ReactMarkdown>
      )}
    </div>
  );
};
