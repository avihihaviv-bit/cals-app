import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Download, Laptop2, Moon, Sun, Trash2, Upload } from 'lucide-react';
import { useAppStore, type BackupData } from '@/store/useAppStore';
import { useLocaleStore, type Language } from '@/store/useLocaleStore';
import { useSettingsStore, type ThemeMode, type NotificationSettings } from '@/store/useSettingsStore';
import { useTargets } from '@/hooks/useTargets';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { exportBackup } from '@/utils/backup';
import type { UserProfile } from '@/types';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop2 },
];

const NOTIFICATION_ROWS: { key: keyof NotificationSettings; label: string; hint: string }[] = [
  { key: 'weeklyCheckIn', label: 'Weekly check-in', hint: 'Gentle reminder to update your weight/profile once a week.' },
  { key: 'mealReminders', label: 'Meal reminders', hint: 'Nudges to log meals around typical meal times.' },
  { key: 'dailySummary', label: 'Daily summary', hint: 'End-of-day recap of how you ate.' },
  { key: 'aiRecommendations', label: 'AI recommendations', hint: 'Occasional "what to eat next" suggestions.' },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const profile = useAppStore((s) => s.profile) as UserProfile;
  const resetAllData = useAppStore((s) => s.resetAllData);
  const clearDiaryHistory = useAppStore((s) => s.clearDiaryHistory);
  const clearWeightHistory = useAppStore((s) => s.clearWeightHistory);
  const importBackup = useAppStore((s) => s.importBackup);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const language = useLocaleStore((s) => s.language);
  const setLanguage = useLocaleStore((s) => s.setLanguage);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const notifications = useSettingsStore((s) => s.notifications);
  const setNotification = useSettingsStore((s) => s.setNotification);
  const { targets, hasProfile } = useTargets();

  async function handleExportData() {
    const result = await exportBackup();
    if (!result.ok) {
      setImportMessage({
        ok: false,
        text: result.reason === 'declined' ? 'Export cancelled.' : "Couldn't save the file — try again.",
      });
    } else {
      setImportMessage(null);
    }
  }

  function handleImportFile(file: File | undefined) {
    if (!file) return;
    setImportMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as BackupData;
        if (!data.profile && !data.diaryEntries) {
          setImportMessage({ ok: false, text: "That doesn't look like a Nutrition AI backup file." });
          return;
        }
        if (!window.confirm('This replaces your current profile and history on this device with the data in this backup. Continue?')) {
          return;
        }
        importBackup(data);
        setImportMessage({ ok: true, text: 'Data restored ✓' });
      } catch {
        setImportMessage({ ok: false, text: "Couldn't read that file — make sure it's a backup exported from this app." });
      }
    };
    reader.readAsText(file);
  }

  function handleDeleteFoodHistory() {
    if (window.confirm('This permanently deletes your food diary history from this device. Continue?')) {
      clearDiaryHistory();
    }
  }

  function handleDeleteWeightHistory() {
    if (window.confirm('This permanently deletes your weight-log history from this device. Continue?')) {
      clearWeightHistory();
    }
  }

  function handleDeleteAccount() {
    if (window.confirm('This permanently deletes your profile, diary history, measurements, photos, and favorites from this device. This cannot be undone. Continue?')) {
      resetAllData();
      navigate('/');
    }
  }

  return (
    <div className="space-y-6 pb-6">
      <header>
        <h1 className="text-2xl font-bold text-fg">Settings</h1>
        <p className="mt-1 text-sm text-muted">Everything here is stored only on this device — nothing is uploaded.</p>
      </header>

      {/* Profile */}
      <SettingsSection emoji="👤" title="Profile">
        <button
          onClick={() => navigate('/profile')}
          className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface-alt p-3.5 text-left transition hover:bg-surface-alt2"
        >
          <div>
            <p className="text-sm font-semibold text-fg">{profile.name || 'My profile'}</p>
            <p className="text-xs text-muted">
              {profile.age} yrs · {profile.heightCm}cm · {profile.weightKg}kg · goal: {profile.goal}
            </p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-faint" />
        </button>
      </SettingsSection>

      {/* Nutrition */}
      <SettingsSection emoji="🧮" title="Nutrition">
        <div className="rounded-xl bg-surface-alt p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-fg">
              {profile.customProteinTargetG != null ? 'Custom targets' : 'Automatic targets'}
            </p>
            <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-semibold text-primary-700">
              {profile.customProteinTargetG != null ? 'Custom' : 'Auto'}
            </span>
          </div>
          {hasProfile && (
            <p className="mt-1 text-xs text-muted">
              ~{targets.calories.toLocaleString()} kcal · {targets.proteinG}g protein · {targets.carbsG}g carbs · {targets.fatG}g fat
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => navigate('/profile')}>
              Adjust targets
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate('/coach?view=debug')}>
              See how it&apos;s calculated
            </Button>
          </div>
        </div>
      </SettingsSection>

      {/* Appearance */}
      <SettingsSection emoji="🎨" title="Appearance">
        <p className="mb-2 text-xs text-muted">Theme</p>
        <div className="flex flex-wrap gap-2">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <Chip key={value} selected={theme === value} onClick={() => setTheme(value)}>
              <span className="flex items-center gap-1.5">
                <Icon size={14} />
                {label}
              </span>
            </Chip>
          ))}
        </div>
      </SettingsSection>

      {/* Language */}
      <SettingsSection emoji="🌐" title="Language">
        <div className="flex gap-2">
          {(['en', 'he'] as Language[]).map((lng) => (
            <Chip key={lng} selected={language === lng} onClick={() => setLanguage(lng)}>
              {lng === 'en' ? 'English' : 'עברית'}
            </Chip>
          ))}
        </div>
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection emoji="🔔" title="Notifications">
        <div className="space-y-1">
          {NOTIFICATION_ROWS.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">{row.label}</p>
                <p className="text-xs text-muted">{row.hint}</p>
              </div>
              <Toggle
                checked={notifications[row.key]}
                onChange={(v) => setNotification(row.key, v)}
                label={row.label}
              />
            </div>
          ))}
        </div>
      </SettingsSection>

      {/* Privacy */}
      <SettingsSection emoji="🔐" title="Privacy">
        <div className="mb-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            Your data lives only in this browser on this device — there&apos;s no account or server copy. If your phone or
            browser ever clears site data (this can happen with bookmarked/home-screen pages), it&apos;s gone unless you&apos;ve
            exported a backup. Export a copy below, then use Import to restore it any time.
          </span>
        </div>
        <div className="space-y-2">
          <PrivacyRow label="Delete food history" onClick={handleDeleteFoodHistory} />
          <PrivacyRow label="Delete weight history" onClick={handleDeleteWeightHistory} />
          <div className="rounded-xl bg-surface-alt p-3.5">
            <p className="text-sm font-medium text-fg">Delete AI history</p>
            <p className="mt-0.5 text-xs text-muted">
              Your chat with the AI assistant isn&apos;t saved between sessions — there&apos;s nothing stored to delete.
            </p>
          </div>
          <button
            onClick={handleExportData}
            className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface-alt p-3.5 text-left transition hover:bg-surface-alt2"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-fg">
              <Download size={15} /> Export my data (backup)
            </span>
            <ChevronRight size={16} className="text-faint" />
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface-alt p-3.5 text-left transition hover:bg-surface-alt2"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-fg">
              <Upload size={15} /> Import data (restore backup)
            </span>
            <ChevronRight size={16} className="text-faint" />
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              handleImportFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {importMessage && (
            <p className={`px-1 text-xs ${importMessage.ok ? 'text-primary-600' : 'text-red-600'}`}>{importMessage.text}</p>
          )}
          <button
            onClick={handleDeleteAccount}
            className="flex w-full items-center justify-between gap-3 rounded-xl bg-red-50 p-3.5 text-left transition hover:bg-red-100"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-red-600">
              <Trash2 size={15} /> Delete account & all data
            </span>
            <ChevronRight size={16} className="text-red-400" />
          </button>
        </div>
      </SettingsSection>
    </div>
  );
}

function PrivacyRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface-alt p-3.5 text-left transition hover:bg-surface-alt2"
    >
      <span className="flex items-center gap-2 text-sm font-medium text-fg">
        <Trash2 size={15} className="text-muted" /> {label}
      </span>
      <ChevronRight size={16} className="text-faint" />
    </button>
  );
}

function SettingsSection({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl2 bg-surface p-4 shadow-card">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-fg">
        <span>{emoji}</span> {title}
      </h2>
      {children}
    </section>
  );
}
