import { useAppStore } from '@/store/useAppStore';
import { saveTextFile, type SaveFileResult } from '@/utils/saveFile';
import { todayISO } from '@/utils/date';

/** The one export payload shape shared by every "export my data" entry point, and read back by importBackup. */
export async function exportBackup(): Promise<SaveFileResult> {
  const state = useAppStore.getState();
  const exportData = {
    exportedAt: new Date().toISOString(),
    profile: state.profile,
    diaryEntries: state.diaryEntries,
    favorites: state.favorites,
    weightLog: state.weightLog,
    measurements: state.measurements,
    progressPhotos: state.progressPhotos,
    waterLog: state.waterLog,
  };
  return saveTextFile(`nutrition-ai-export-${todayISO()}.json`, JSON.stringify(exportData, null, 2));
}
