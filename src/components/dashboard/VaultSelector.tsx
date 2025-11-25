import { useEffect, useRef, useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Layers, Plus, Link2, Check, ChevronDown, Box, FolderGit2, AlertCircle, X } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useToastStore } from '../../store/toastStore';

export const VaultSelector = () => {
  const { vaults, currentVault, setCurrentVault, rootPath } = useAppStore(
    useShallow((state) => ({
      vaults: state.vaults,
      currentVault: state.currentVault,
      setCurrentVault: state.setCurrentVault,
      rootPath: state.rootPath,
    })),
  );
  const createVault = useAppStore((state) => state.createVault);
  const updateVault = useAppStore((state) => state.updateVault);
  const addToast = useToastStore((state) => state.addToast);

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newVaultName, setNewVaultName] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

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

  // Reset focus when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setFocusedIndex(-1);
      setIsCreating(false);
    }
  }, [isOpen]);

  const handleSelect = useCallback((id: string) => {
    const next = vaults.find((v) => v.id === id) || null;
    setCurrentVault(next);
    setIsOpen(false);
    // Return focus to trigger button for accessibility
    requestAnimationFrame(() => buttonRef.current?.focus());
  }, [vaults, setCurrentVault]);

  // Keyboard navigation for accessibility
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
        setFocusedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, vaults.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < vaults.length) {
          handleSelect(vaults[focusedIndex].id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        buttonRef.current?.focus();
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  }, [isOpen, focusedIndex, vaults, handleSelect]);

  const handleCreate = async () => {
    if (!newVaultName.trim()) return;

    try {
      setIsBusy(true);
      const created = await createVault(newVaultName.trim(), rootPath ? { rootPath } : {});
      if (created) {
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
    if (!rootPath || !currentVault || rootPath === 'DEMO_VAULT') return;
    try {
      setIsBusy(true);
      const nextConfig = { ...(currentVault.config || {}), rootPath } as any;
      await updateVault(currentVault.id, { config: nextConfig } as any);
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
    <div className="relative z-50" ref={dropdownRef} onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={currentVault ? `Current vault: ${currentVault.name}` : 'Select a vault'}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-150 border ${
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

      {/* Dropdown - CSS transitions instead of Framer Motion */}
      <div
        role="listbox"
        aria-label="Vault list"
        className={`absolute top-full left-0 mt-2 w-64 bg-base-100 rounded-xl shadow-xl border border-base-200 overflow-hidden flex flex-col
          transition-all duration-150 origin-top
          ${isOpen ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-[0.98] -translate-y-1 pointer-events-none'}
        `}
      >
            <div className="px-3 py-2 bg-base-200/30 border-b border-base-200 text-[10px] font-bold uppercase tracking-wider text-base-content/40 flex justify-between items-center">
              <span>Your Vaults</span>
              <span className="bg-base-200 px-1.5 py-0.5 rounded text-base-content/60">{vaults.length}</span>
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {vaults.map((v, index) => {
                const isActive = currentVault?.id === v.id;
                const isFocused = focusedIndex === index;
                return (
                  <button
                    key={v.id}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => handleSelect(v.id)}
                    onMouseEnter={() => setFocusedIndex(index)}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors duration-100 ${
                      isActive ? 'bg-primary/10 text-primary font-bold' : 'text-base-content/80'
                    } ${isFocused && !isActive ? 'bg-base-200/70' : ''}
                    hover:bg-base-200/50`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <Box size={14} className={isActive ? 'fill-primary/20 text-primary' : 'opacity-50'} />
                      <span className="truncate">{v.name}</span>
                    </div>
                    {isActive && <Check size={14} className="shrink-0" />}
                  </button>
                );
              })}
              {vaults.length === 0 && (
                <div className="px-4 py-6 text-center text-base-content/40 text-xs flex flex-col items-center gap-2">
                  <Layers size={24} className="opacity-20" />
                  <span>No vaults yet.</span>
                  <span className="text-[10px]">Create one to start syncing your notes.</span>
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
                    id="vault-name-input"
                    name="vaultName"
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
                <button
                  onClick={handleLinkRoot}
                  disabled={isBusy}
                  className="btn btn-xs btn-warning btn-outline w-full justify-start gap-2 bg-warning/5 transition-all duration-150"
                >
                  {isBusy ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <Link2 size={14} />
                  )}
                  Link "{rootPath!.split(/[\\/]/).pop()}" Here
                </button>
              )}
            </div>
          </div>
    </div>
  );
}
