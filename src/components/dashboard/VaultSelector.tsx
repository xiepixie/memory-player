import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Layers, Plus, Link2, Check, ChevronDown, Box, FolderGit2, AlertCircle, X } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useToastStore } from '../../store/toastStore';
import { motion, AnimatePresence } from 'framer-motion';

export const VaultSelector = () => {
  const { vaults, currentVault, setCurrentVault, rootPath, loadVaults } = useAppStore(
    useShallow((state) => ({
      vaults: state.vaults,
      currentVault: state.currentVault,
      setCurrentVault: state.setCurrentVault,
      rootPath: state.rootPath,
      loadVaults: state.loadVaults,
    })),
  );
  const dataService = useAppStore((state) => state.dataService);
  const addToast = useToastStore((state) => state.addToast);

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newVaultName, setNewVaultName] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  const handleSelect = (id: string) => {
    const next = vaults.find((v) => v.id === id) || null;
    setCurrentVault(next);
    setIsOpen(false);
  };

  const handleCreate = async () => {
    if (!dataService || !newVaultName.trim()) return;

    try {
      setIsBusy(true);
      const created = await dataService.createVault(newVaultName.trim(), rootPath ? { rootPath } : {});
      await loadVaults();
      if (created) {
        setCurrentVault(created);
        addToast(`Vault "${created.name}" created`, 'success');
      }
      setIsCreating(false);
      setNewVaultName('');
      setIsOpen(false);
    } catch (e) {
      console.error('Failed to create vault', e);
      addToast('Failed to create vault', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleLinkRoot = async () => {
    if (!dataService || !rootPath || !currentVault || rootPath === 'DEMO_VAULT') return;
    try {
      setIsBusy(true);
      const nextConfig = { ...(currentVault.config || {}), rootPath } as any;
      await dataService.updateVault(currentVault.id, { config: nextConfig } as any);
      await loadVaults();
      addToast(`Linked "${rootPath.split(/[\\/]/).pop()}" to vault`, 'success');
      setIsOpen(false);
    } catch (e) {
      console.error('Failed to link folder to vault', e);
      addToast('Failed to link folder to vault', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const isRootLinked = currentVault && (currentVault.config as any)?.rootPath === rootPath;
  const hasRootPath = !!rootPath && rootPath !== 'DEMO_VAULT';

  return (
    <div className="relative z-50" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all border ${
          isOpen
            ? 'bg-base-100 border-primary/30 shadow-sm ring-1 ring-primary/10'
            : 'bg-base-200/50 border-transparent hover:bg-base-200 hover:border-base-300'
        }`}
      >
        <div
          className={`p-1 rounded-md ${
            currentVault ? 'bg-primary/10 text-primary' : 'bg-base-300 text-base-content/50'
          }`}
        >
          <Layers size={14} />
        </div>
        <div className="flex flex-col items-start text-left mr-1">
          <span className="text-xs font-bold leading-none max-w-[120px] truncate">
            {currentVault ? currentVault.name : 'Select Vault'}
          </span>
          {currentVault && hasRootPath && (
            <span className="text-[10px] leading-none mt-1 flex items-center gap-1 opacity-60">
              {isRootLinked ? (
                <>
                  <FolderGit2 size={8} />
                  Linked
                </>
              ) : (
                <>
                  <AlertCircle size={8} className="text-warning" />
                  Not Linked
                </>
              )}
            </span>
          )}
        </div>
        <ChevronDown
          size={12}
          className={`text-base-content/40 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.1 }}
            className="absolute top-full left-0 mt-2 w-64 bg-base-100 rounded-xl shadow-xl border border-base-200 overflow-hidden flex flex-col"
          >
            <div className="px-3 py-2 bg-base-200/30 border-b border-base-200 text-[10px] font-bold uppercase tracking-wider text-base-content/40 flex justify-between items-center">
              <span>Your Vaults</span>
              <span className="bg-base-200 px-1.5 py-0.5 rounded text-base-content/60">{vaults.length}</span>
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {vaults.map((v) => {
                const isActive = currentVault?.id === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => handleSelect(v.id)}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-base-200/50 transition-colors ${
                      isActive ? 'bg-primary/5 text-primary font-bold' : 'text-base-content/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <Box size={14} className={isActive ? 'fill-primary/20' : 'opacity-50'} />
                      <span className="truncate">{v.name}</span>
                    </div>
                    {isActive && <Check size={14} />}
                  </button>
                );
              })}
              {vaults.length === 0 && (
                <div className="px-4 py-6 text-center text-base-content/40 text-xs flex flex-col items-center gap-2">
                  <Layers size={24} className="opacity-20" />
                  No vaults yet. Create one to start syncing.
                </div>
              )}
            </div>
            <div className="divider my-0 h-px bg-base-200" />
            <div className="p-2 bg-base-200/30 space-y-2">
              {isCreating ? (
                <div className="flex items-center gap-1">
                  <input
                    ref={inputRef}
                    type="text"
                    className="input input-xs input-bordered flex-1 bg-base-100"
                    placeholder="Vault Name..."
                    value={newVaultName}
                    onChange={(e) => setNewVaultName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreate();
                      if (e.key === 'Escape') setIsCreating(false);
                    }}
                  />
                  <button
                    onClick={handleCreate}
                    disabled={!newVaultName.trim() || isBusy}
                    className="btn btn-xs btn-primary btn-square"
                  >
                    {isBusy ? <span className="loading loading-spinner loading-xs" /> : <Check size={14} />}
                  </button>
                  <button onClick={() => setIsCreating(false)} className="btn btn-xs btn-ghost btn-square">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="btn btn-xs btn-ghost w-full justify-start gap-2 text-base-content/60 hover:text-primary hover:bg-primary/5"
                >
                  <Plus size={14} />
                  Create New Vault
                </button>
              )}
              {hasRootPath && currentVault && !isRootLinked && !isCreating && (
                <motion.button
                  layout
                  onClick={handleLinkRoot}
                  disabled={isBusy}
                  className="btn btn-xs btn-warning btn-outline w-full justify-start gap-2 bg-warning/5"
                >
                  <Link2 size={14} />
                  Link "{rootPath!.split(/[\\/]/).pop()}" Here
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
