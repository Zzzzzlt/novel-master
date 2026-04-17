import React, { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { RightPanel } from './components/RightPanel';
import { GlobalDialog } from './components/ui/GlobalDialog';
import { ConflictResolver } from './components/ui/ConflictResolver';
import { OnboardingGuide } from './components/OnboardingGuide';
import { useStore } from './store/useStore';
import { setLanguage } from './utils/i18n';

const App: React.FC = () => {
  const { settings, showOnboarding, setShowOnboarding } = useStore();

  useEffect(() => {
    // Initialize language
    setLanguage(settings.language);

    // Initialize API key from store to window object for AI service
    if (settings.apiKey) {
      (window as any).__DEEPSEEK_API_KEY__ = settings.apiKey;
    }

    // Show onboarding if no API key is set
    if (!settings.apiKey && !showOnboarding) {
      setShowOnboarding(true);
    }

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
  }, [settings.theme, settings.language, settings.apiKey]);

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <ChatArea />
      <RightPanel />
      <GlobalDialog />
      <ConflictResolver />
      <OnboardingGuide
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
    </div>
  );
};

export default App;