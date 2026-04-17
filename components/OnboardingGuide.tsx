import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import { Button } from './ui/Button';
import { t } from '../utils/i18n';
import { setLanguage } from '../utils/i18n';
import { validateApiKey } from '../services/aiService';
import { BookOpen, Key, Settings, Sparkles, ChevronRight, ChevronLeft, X, Globe, Zap, ArrowRight, Loader2, HelpCircle, FileText } from 'lucide-react';

interface OnboardingGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

const TOTAL_STEPS = 5;

export const OnboardingGuide: React.FC<OnboardingGuideProps> = ({ isOpen, onClose }) => {
  const { settings, setSettings, setShowOnboarding } = useStore();
  const [currentStep, setCurrentStep] = useState(1);
  const [languageInput, setLanguageInput] = useState(settings.language || 'zh');
  const [apiKeyInput, setApiKeyInput] = useState(settings.apiKey || '');
  const [validating, setValidating] = useState(false);
  const [apiKeyError, setApiKeyError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setLanguageInput(settings.language || 'zh');
      setApiKeyInput(settings.apiKey || '');
    }
  }, [isOpen, settings.apiKey]);

  // 当用户在步骤1选择语言时，立即应用更改
  useEffect(() => {
    if (isOpen && currentStep === 1 && languageInput !== (settings.language || 'zh')) {
      setLanguage(languageInput as 'en' | 'zh');
    }
  }, [languageInput, isOpen, currentStep]);

  const handleNext = async () => {
    // Step 2: 验证 API Key
    if (currentStep === 2 && apiKeyInput) {
      setApiKeyError('');
      setValidating(true);
      const result = await validateApiKey(apiKeyInput);
      setValidating(false);
      if (!result.valid) {
        setApiKeyError(result.error || 'API Key 验证失败');
        return;
      }
    }

    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFinish = async () => {
    // Validate API Key if provided
    if (apiKeyInput) {
      setValidating(true);
      const result = await validateApiKey(apiKeyInput);
      setValidating(false);
      if (!result.valid) {
        setApiKeyError(result.error || 'API Key 验证失败');
        setCurrentStep(2);
        return;
      }
    }

    // Apply language change
    if (languageInput !== settings.language) {
      setLanguage(languageInput as 'en' | 'zh');
    }
    // Apply API key change
    if (apiKeyInput) {
      (window as any).__DEEPSEEK_API_KEY__ = apiKeyInput;
    }
    // Save settings
    setSettings({
      language: languageInput,
      apiKey: apiKeyInput
    });
    onClose();
  };

  const handleSkip = () => {
    onClose();
  };

  if (!isOpen) return null;

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Globe size={32} className="text-primary" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold mb-2">{t('onboarding.step1Title')}</h3>
              <p className="text-muted-foreground">{t('onboarding.step1Desc')}</p>
            </div>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setLanguageInput('zh')}
                className={`px-6 py-3 rounded-lg border-2 transition-all ${
                  languageInput === 'zh'
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                中文
              </button>
              <button
                onClick={() => setLanguageInput('en')}
                className={`px-6 py-3 rounded-lg border-2 transition-all ${
                  languageInput === 'en'
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                English
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Key size={32} className="text-primary" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold mb-2">{t('onboarding.step2Title')}</h3>
              <p className="text-muted-foreground mb-4">{t('onboarding.step2Desc')}</p>
              <a
                href="https://platform.deepseek.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm inline-block mb-4"
              >
                {t('onboarding.step2Help', { url: 'https://platform.deepseek.com' })}
              </a>
            </div>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => { setApiKeyInput(e.target.value); setApiKeyError(''); }}
              placeholder={t('onboarding.step2Placeholder')}
              className={`w-full p-3 border rounded-lg bg-background focus:outline-none focus:ring-2 ${
                apiKeyError ? 'border-destructive focus:ring-destructive' : 'border-input focus:ring-primary'
              }`}
              disabled={validating}
              autoFocus
            />
            {apiKeyError && (
              <p className="text-sm text-destructive mt-2">{apiKeyError}</p>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Settings size={32} className="text-primary" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold mb-4">{t('onboarding.step3Title')}</h3>
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-card border border-border">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <BookOpen size={16} className="text-blue-500" />
                  </div>
                  <span className="font-bold">{t('chat.settingMode')}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t('onboarding.step3SettingDesc')}</p>
              </div>
              <div className="p-4 rounded-lg bg-card border border-border">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Sparkles size={16} className="text-green-500" />
                  </div>
                  <span className="font-bold">{t('chat.storyMode')}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t('onboarding.step3StoryDesc')}</p>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap size={32} className="text-primary" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold mb-4">{t('onboarding.step4Title')}</h3>
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-card border border-border text-left">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ArrowRight size={12} className="text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">{t('onboarding.step4RecordDesc')}</p>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-card border border-border text-left">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded bg-yellow-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Zap size={12} className="text-yellow-500" />
                  </div>
                  <p className="text-sm text-muted-foreground">{t('onboarding.step4FlashDesc')}</p>
                </div>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText size={32} className="text-primary" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold mb-2">{t('onboarding.step5Title')}</h3>
              <p className="text-muted-foreground">{t('onboarding.step5Desc')}</p>
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-card border border-border text-left">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                    <FileText size={16} className="text-green-500" />
                  </div>
                  <span className="font-bold">{t('onboarding.step5NewStory')}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t('onboarding.step5NewStoryDesc')}</p>
              </div>
              <a
                href="/help.html"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 rounded-lg bg-card border border-border text-left hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <HelpCircle size={16} className="text-blue-500" />
                  </div>
                  <span className="font-bold">{t('onboarding.step5HelpDoc')}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t('onboarding.step5HelpDocDesc')}</p>
              </a>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-card rounded-xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t('onboarding.step', { n: currentStep })}
            </span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xs font-medium text-muted-foreground">
              {t('onboarding.step', { n: TOTAL_STEPS })}
            </span>
          </div>
          <button
            onClick={handleSkip}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-6 min-h-[320px]">
          {renderStep()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-muted/30">
          <button
            onClick={handlePrev}
            disabled={currentStep === 1 || validating}
            className={`flex items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
              currentStep === 1 || validating
                ? 'text-muted-foreground/50 cursor-not-allowed'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <ChevronLeft size={16} />
            {t('onboarding.prev')}
          </button>

          <div className="flex gap-2">
            {currentStep < TOTAL_STEPS && (
              <button
                onClick={handleSkip}
                disabled={validating}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {t('onboarding.skip')}
              </button>
            )}
            <Button onClick={handleNext} className="gap-1" disabled={validating}>
              {validating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('onboarding.validating')}
                </>
              ) : (
                <>
                  {currentStep === TOTAL_STEPS ? t('onboarding.done') : t('onboarding.next')}
                  {currentStep < TOTAL_STEPS && <ChevronRight size={16} />}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
