import React, { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { RightPanel } from './components/RightPanel';
import { GlobalDialog } from './components/ui/GlobalDialog';
import { ConflictResolver } from './components/ui/ConflictResolver';
import { AuthDialog, AuthButton } from './components/AuthDialog';
import { useStore } from './store/useStore';
import { setLanguage } from './utils/i18n';
import { authService } from './services/auth';

const App: React.FC = () => {
  const { settings } = useStore();
  const [isAuthReady, setIsAuthReady] = useState(false);

  // 初始化认证服务
  useEffect(() => {
    authService.init().then(() => {
      setIsAuthReady(true);
    });
  }, []);

  useEffect(() => {
    // Initialize language
    setLanguage(settings.language);

    const applyTheme = () => {
      let isDark = false;

      if (settings.theme === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      } else {
        isDark = settings.theme === 'dark';
      }

      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();

    // Listener for system theme changes if in system mode
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (settings.theme === 'system') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [settings.theme, settings.language]);

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <ChatArea />
      <RightPanel />
      <GlobalDialog />
      <ConflictResolver />
    </div>
  );
};

export default App;