import { useAppStore } from '../../store/appStore';

export const EditMode = () => {
  const { currentNote, currentFilepath } = useAppStore();

  if (!currentNote) return null;

  return (
    <div className="h-full flex flex-col p-4">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Edit: {currentFilepath}</h2>
            <div className="badge badge-warning">Read Only in this Version</div>
        </div>
        <textarea
            className="textarea textarea-bordered w-full h-full font-mono"
            value={currentNote.raw}
            readOnly
        />
    </div>
  );
};
