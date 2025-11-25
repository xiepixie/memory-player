import { memo } from 'react';
import { InlineCloze } from './InlineCloze';
import { MathClozeBlock } from './MathClozeBlock';
import { useIsRevealed, useCurrentClozeIndex, useClozeRevealStore } from '../../store/clozeRevealStore';

interface ClozeWithContextProps {
    type: 'inline' | 'math';
    id: number;
    clozeKey: string;
    hint?: string;
    children?: React.ReactNode;
    // Math-specific
    latex?: string;
}

/**
 * Wrapper that reads cloze state from Zustand store with fine-grained selectors.
 * 
 * Performance: Each ClozeWithContext only subscribes to its own key.
 * When revealed["1-0"] changes, only the component with key="1-0" re-renders.
 * 
 * This is a significant improvement over Context which re-renders ALL consumers.
 */
export const ClozeWithContext = memo(({
    type,
    id,
    clozeKey,
    hint,
    children,
    latex
}: ClozeWithContextProps) => {
    // Fine-grained subscription: only re-render when THIS key changes
    const baseRevealed = useIsRevealed(clozeKey);
    const currentClozeIndex = useCurrentClozeIndex();
    // Get stable action reference (won't cause re-render)
    const toggleReveal = useClozeRevealStore((state) => state.toggleReveal);
    
    const isTarget = currentClozeIndex !== null ? id === currentClozeIndex : true;
    const isContext = !isTarget;
    const revealed = currentClozeIndex !== null
        ? (isTarget ? baseRevealed : true)
        : baseRevealed;

    if (type === 'math' && latex) {
        const handleToggle = () => {
            const canToggle = currentClozeIndex === null || isTarget;
            if (canToggle) toggleReveal(clozeKey);
        };

        // DOM OPTIMIZATION: Pass id/clozeKey directly to MathClozeBlock, no wrapper div needed (-1 level)
        return (
            <MathClozeBlock
                id={id}
                clozeKey={clozeKey}
                latex={latex}
                isRevealed={revealed}
                isInteractive={isTarget}
                onToggle={handleToggle}
                className={isContext ? 'opacity-60' : undefined}
            />
        );
    }

    return (
        <InlineCloze
            id={id}
            clozeKey={clozeKey}
            isTarget={isTarget}
            isContext={isContext}
            isRevealed={revealed}
            hint={hint}
            onToggle={toggleReveal}
        >
            {children}
        </InlineCloze>
    );
});

ClozeWithContext.displayName = 'ClozeWithContext';
