'use client';

import React, { useMemo } from 'react';
import { diffLines, diffWordsWithSpace } from 'diff';

interface DiffToken {
    value: string;
    added?: boolean;
    removed?: boolean;
}

interface DiffLine {
    type: 'add' | 'remove' | 'normal';
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
    tokens?: DiffToken[];
}

interface DiffViewProps {
    oldText: string;
    newText: string;
    showLineNumbers?: boolean;
}

/**
 * Calculate inline diff tokens for a pair of lines
 */
function calculateInlineDiff(oldLine: string, newLine: string): DiffToken[] {
    const changes = diffWordsWithSpace(oldLine, newLine);
    return changes.map(change => ({
        value: change.value,
        added: change.added,
        removed: change.removed,
    }));
}

/**
 * Find best matching line for inline diff
 */
function findBestMatch(line: string, candidates: string[]): number {
    if (candidates.length === 0) return -1;

    // Simple heuristic: find line with most common characters
    let bestIndex = 0;
    let bestScore = 0;

    candidates.forEach((candidate, index) => {
        let score = 0;
        const minLen = Math.min(line.length, candidate.length);
        for (let i = 0; i < minLen; i++) {
            if (line[i] === candidate[i]) score++;
        }
        // Penalize length difference
        score -= Math.abs(line.length - candidate.length) * 0.5;

        if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
        }
    });

    // Only match if similarity is reasonable (at least 30% similar)
    const threshold = Math.max(line.length, candidates[bestIndex]?.length || 0) * 0.3;
    return bestScore >= threshold ? bestIndex : -1;
}

/**
 * Calculate unified diff with inline highlighting
 */
function calculateDiff(oldText: string, newText: string): DiffLine[] {
    const lineChanges = diffLines(oldText, newText);
    const result: DiffLine[] = [];

    let oldLineNum = 1;
    let newLineNum = 1;

    // Collect pending removals for potential pairing with additions
    const pendingRemovals: { line: string; lineNum: number; index: number }[] = [];

    lineChanges.forEach((change) => {
        const lines = change.value.split('\n').filter((line, index, arr) =>
            !(index === arr.length - 1 && line === '')
        );

        lines.forEach((line) => {
            if (change.removed) {
                pendingRemovals.push({
                    line,
                    lineNum: oldLineNum,
                    index: result.length
                });
                result.push({
                    type: 'remove',
                    content: line,
                    oldLineNumber: oldLineNum++,
                });
            } else if (change.added) {
                // Try to pair with a removal for inline diff
                if (pendingRemovals.length > 0) {
                    const removalIndex = findBestMatch(line, pendingRemovals.map(r => r.line));
                    if (removalIndex !== -1) {
                        const removal = pendingRemovals[removalIndex];
                        pendingRemovals.splice(removalIndex, 1);

                        // Calculate inline diff
                        const tokens = calculateInlineDiff(removal.line, line);

                        // Update the removal line with tokens (only removed parts)
                        result[removal.index].tokens = tokens.filter(t => !t.added);

                        // Add the addition line with tokens (only added parts)
                        result.push({
                            type: 'add',
                            content: line,
                            newLineNumber: newLineNum++,
                            tokens: tokens.filter(t => !t.removed),
                        });
                        return;
                    }
                }

                // No pairing found
                result.push({
                    type: 'add',
                    content: line,
                    newLineNumber: newLineNum++,
                });
            } else {
                // Context line (unchanged)
                pendingRemovals.length = 0; // Clear pending removals
                result.push({
                    type: 'normal',
                    content: line,
                    oldLineNumber: oldLineNum++,
                    newLineNumber: newLineNum++,
                });
            }
        });
    });

    return result;
}

export function DiffView({ oldText, newText, showLineNumbers = true }: DiffViewProps) {
    const lines = useMemo(() => calculateDiff(oldText, newText), [oldText, newText]);

    const renderLineContent = (line: DiffLine) => {
        const baseClass = line.type === 'add'
            ? 'text-emerald-300'
            : line.type === 'remove'
                ? 'text-red-300'
                : 'text-gray-400';

        if (line.tokens && line.tokens.length > 0) {
            return (
                <>
                    {line.tokens.map((token, idx) => {
                        if (token.added) {
                            return (
                                <span key={idx} className="bg-emerald-500/30 text-emerald-200">
                                    {token.value}
                                </span>
                            );
                        }
                        if (token.removed) {
                            return (
                                <span key={idx} className="bg-red-500/30 text-red-200">
                                    {token.value}
                                </span>
                            );
                        }
                        return <span key={idx} className={baseClass}>{token.value}</span>;
                    })}
                </>
            );
        }

        return <span className={baseClass}>{line.content}</span>;
    };

    return (
        <div className="font-mono text-xs overflow-x-auto">
            {lines.map((line, index) => {
                const bgClass = line.type === 'add'
                    ? 'bg-emerald-950/40'
                    : line.type === 'remove'
                        ? 'bg-red-950/40'
                        : '';

                const symbol = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
                const symbolClass = line.type === 'add'
                    ? 'text-emerald-400'
                    : line.type === 'remove'
                        ? 'text-red-400'
                        : 'text-gray-600';

                return (
                    <div key={index} className={`flex ${bgClass}`}>
                        {showLineNumbers && (
                            <span className="w-8 text-right pr-2 text-gray-600 select-none flex-shrink-0">
                                {line.type === 'remove'
                                    ? line.oldLineNumber
                                    : line.type === 'add'
                                        ? line.newLineNumber
                                        : line.oldLineNumber}
                            </span>
                        )}
                        <span className={`w-4 text-center select-none flex-shrink-0 ${symbolClass}`}>
                            {symbol}
                        </span>
                        <span className="flex-1 whitespace-pre">
                            {renderLineContent(line)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
