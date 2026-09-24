import { useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Chip } from '@/components/ui/Chip';
import { Modal } from '@/components/ui/Modal';
import type { PhotoCategory } from '@/types';

const CATEGORIES: { value: PhotoCategory; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'side', label: 'Side' },
  { value: 'back', label: 'Back' },
];

export function ProgressPhotoSection() {
  const photos = useAppStore((s) => s.progressPhotos);
  const addProgressPhoto = useAppStore((s) => s.addProgressPhoto);
  const deleteProgressPhoto = useAppStore((s) => s.deleteProgressPhoto);
  const deleteAllProgressPhotos = useAppStore((s) => s.deleteAllProgressPhotos);

  const [category, setCategory] = useState<PhotoCategory>('front');
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categoryPhotos = photos.filter((p) => p.category === category).sort((a, b) => a.date.localeCompare(b.date));
  const viewing = photos.find((p) => p.id === viewingId);

  function handleFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => addProgressPhoto(category, reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleDeleteAll() {
    if (window.confirm("Delete all progress photos? This can't be undone.")) {
      deleteAllProgressPhotos();
    }
  }

  return (
    <div className="rounded-xl2 bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-fg">📸 Progress Photos</h2>
        {photos.length > 0 && (
          <button onClick={handleDeleteAll} className="text-xs font-medium text-red-500 hover:underline">
            Delete all
          </button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted">Stored privately on this device only.</p>

      <div className="mt-3 flex gap-2">
        {CATEGORIES.map((c) => (
          <Chip key={c.value} selected={category === c.value} onClick={() => setCategory(c.value)}>
            {c.label}
          </Chip>
        ))}
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-default text-muted transition hover:border-primary-300 hover:text-primary-600"
        >
          <Plus size={18} />
          <span className="text-[10px]">Add</span>
        </button>
        {categoryPhotos.map((p) => (
          <button key={p.id} onClick={() => setViewingId(p.id)} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl shadow-card">
            <img src={p.dataUrl} alt={`${p.category} progress ${p.date}`} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      {categoryPhotos.length >= 2 && (
        <button
          onClick={() => setCompareOpen(true)}
          className="mt-3 w-full rounded-lg bg-surface-alt py-2 text-xs font-semibold text-fg transition hover:bg-surface-alt2"
        >
          Compare Before / Current
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {/* Single photo viewer */}
      <Modal open={!!viewing} onClose={() => setViewingId(null)} size="sm">
        {viewing && (
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-fg capitalize">
                {viewing.category} · {viewing.date}
              </p>
              <button
                onClick={() => {
                  deleteProgressPhoto(viewing.id);
                  setViewingId(null);
                }}
                aria-label="Delete photo"
                className="text-red-500 hover:text-red-600"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <img src={viewing.dataUrl} alt={`${viewing.category} progress`} className="mt-3 w-full rounded-xl object-cover" />
          </div>
        )}
      </Modal>

      {/* Before/Current comparison */}
      {compareOpen && categoryPhotos.length >= 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setCompareOpen(false)}>
          <div className="relative w-full max-w-lg rounded-2xl bg-surface p-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setCompareOpen(false)} className="absolute right-3 top-3 text-muted hover:text-fg">
              <X size={18} />
            </button>
            <p className="mb-3 text-sm font-bold text-fg capitalize">{category} comparison</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <img src={categoryPhotos[0].dataUrl} alt="Before" className="aspect-square w-full rounded-xl object-cover" />
                <p className="mt-1.5 text-center text-xs text-muted">Before · {categoryPhotos[0].date}</p>
              </div>
              <div>
                <img
                  src={categoryPhotos[categoryPhotos.length - 1].dataUrl}
                  alt="Current"
                  className="aspect-square w-full rounded-xl object-cover"
                />
                <p className="mt-1.5 text-center text-xs text-muted">Current · {categoryPhotos[categoryPhotos.length - 1].date}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
