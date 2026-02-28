'use client';

import { X, Shield, Cpu, Boxes, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export type PermissionMode = 'default' | 'acceptEdits' | 'planMode' | 'yolo';
export type ModelSetting = 'default' | 'adaptive' | 'sonnet' | 'opus';

export interface CustomWorker {
    name: string;        // 툴 이름 → ask_<name>
    binary: string;      // 실행 명령어 (e.g. "goose run")
    description: string; // Claude가 언제 쓸지 판단하는 설명
}

export interface BuiltinWorkers {
    gemini: boolean;
    codex: boolean;
    aider: boolean;
}

export interface ChatSettings {
    permissionMode: PermissionMode;
    model: ModelSetting;
    customWorkers: CustomWorker[];
    builtinWorkers: BuiltinWorkers;
}

interface ChatSettingsPanelProps {
    settings: ChatSettings;
    onSettingsChange: (settings: ChatSettings) => void;
    onClose: () => void;
    isClaudeEngine: boolean;
}

interface OptionItem<T> {
    id: T;
    labelKey: string;
    descKey: string;
    badge?: string;
    badgeColor?: string;
}

const PERMISSION_MODES: OptionItem<PermissionMode>[] = [
    { id: 'default', labelKey: 'permDefault', descKey: 'permDefaultDesc' },
    { id: 'acceptEdits', labelKey: 'permAcceptEdits', descKey: 'permAcceptEditsDesc', badge: 'Auto', badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
    { id: 'planMode', labelKey: 'permPlanMode', descKey: 'permPlanModeDesc', badge: 'Read-only', badgeColor: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' },
    { id: 'yolo', labelKey: 'permYolo', descKey: 'permYoloDesc', badge: 'YOLO', badgeColor: 'text-red-400 bg-red-500/10 border-red-500/30' },
];

const BUILTIN_WORKER_DEFS = [
    { key: 'gemini' as const, toolName: 'ask_gemini', labelKey: 'builtinGemini', descKey: 'builtinGeminiDesc', badge: 'Google', badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
    { key: 'codex' as const, toolName: 'ask_codex', labelKey: 'builtinCodex', descKey: 'builtinCodexDesc', badge: 'OpenAI', badgeColor: 'text-green-400 bg-green-500/10 border-green-500/30' },
    { key: 'aider' as const, toolName: 'ask_aider', labelKey: 'builtinAider', descKey: 'builtinAiderDesc', badge: 'Aider', badgeColor: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
];

const MODEL_OPTIONS: OptionItem<ModelSetting>[] = [
    { id: 'default', labelKey: 'modelDefault', descKey: 'modelDefaultDesc' },
    { id: 'adaptive', labelKey: 'modelAdaptive', descKey: 'modelAdaptiveDesc', badge: 'Smart', badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
    { id: 'sonnet', labelKey: 'modelSonnet', descKey: 'modelSonnetDesc', badge: 'Sonnet', badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
    { id: 'opus', labelKey: 'modelOpus', descKey: 'modelOpusDesc', badge: 'Opus', badgeColor: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
];

export function ChatSettingsPanel({ settings, onSettingsChange, onClose, isClaudeEngine }: ChatSettingsPanelProps) {
    const t = useTranslations('chatSettings');
    const [showAddForm, setShowAddForm] = useState(false);
    const [newWorker, setNewWorker] = useState({ name: '', binary: '', description: '' });

    function handleAddWorker() {
        const { name, binary, description } = newWorker;
        if (!name.trim() || !binary.trim() || !description.trim()) return;
        // 이름에서 공백/특수문자 제거 (툴 이름으로 사용)
        const safeName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const updated = [...settings.customWorkers, { name: safeName, binary: binary.trim(), description: description.trim() }];
        onSettingsChange({ ...settings, customWorkers: updated });
        setNewWorker({ name: '', binary: '', description: '' });
        setShowAddForm(false);
    }

    function handleRemoveWorker(idx: number) {
        const updated = settings.customWorkers.filter((_, i) => i !== idx);
        onSettingsChange({ ...settings, customWorkers: updated });
    }

    function handleToggleBuiltin(key: keyof BuiltinWorkers) {
        const updated = { ...settings.builtinWorkers, [key]: !settings.builtinWorkers[key] };
        onSettingsChange({ ...settings, builtinWorkers: updated });
    }

    function renderOptions<T extends string>(
        items: OptionItem<T>[],
        current: T,
        onChange: (val: T) => void,
        disabled: boolean,
    ) {
        return items.map((item) => {
            const selected = current === item.id;
            return (
                <button
                    key={item.id}
                    type="button"
                    onClick={() => !disabled && onChange(item.id)}
                    disabled={disabled}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all flex items-start gap-3 ${
                        disabled
                            ? 'border-gray-800 bg-gray-900/50 opacity-40 cursor-not-allowed'
                            : selected
                            ? 'border-blue-500/60 bg-blue-600/10'
                            : 'border-gray-700/60 bg-gray-800/40 hover:border-gray-600'
                    }`}
                >
                    {/* 라디오 도트 */}
                    <span className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                        selected ? 'border-blue-400' : 'border-gray-600'
                    }`}>
                        {selected && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                    </span>
                    <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-medium ${selected ? 'text-white' : 'text-gray-300'}`}>
                                {t(item.labelKey)}
                            </span>
                            {item.badge && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${item.badgeColor}`}>
                                    {item.badge}
                                </span>
                            )}
                        </span>
                        <span className="text-[11px] text-gray-500 mt-0.5 block">{t(item.descKey)}</span>
                    </span>
                </button>
            );
        });
    }

    return (
        <div className="absolute inset-0 z-30 flex justify-end">
            {/* 뒷배경 */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* 패널 */}
            <div className="relative z-10 w-full max-w-xs bg-gray-900 border-l border-gray-800 h-full overflow-y-auto shadow-2xl flex flex-col">
                {/* 헤더 */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
                    <h3 className="text-sm font-semibold text-white">{t('title')}</h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* 퍼미션 모드 */}
                    <section>
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Shield size={12} />
                            {t('permissionMode')}
                        </h4>
                        <div className="space-y-2">
                            {renderOptions(
                                PERMISSION_MODES,
                                settings.permissionMode,
                                (val) => onSettingsChange({ ...settings, permissionMode: val }),
                                !isClaudeEngine,
                            )}
                        </div>
                        {!isClaudeEngine && (
                            <p className="text-[11px] text-gray-600 mt-2">{t('claudeOnly')}</p>
                        )}
                    </section>

                    {/* 모델 선택 */}
                    <section>
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Cpu size={12} />
                            {t('model')}
                        </h4>
                        <div className="space-y-2">
                            {renderOptions(
                                MODEL_OPTIONS,
                                settings.model,
                                (val) => onSettingsChange({ ...settings, model: val }),
                                !isClaudeEngine,
                            )}
                        </div>
                        {!isClaudeEngine && (
                            <p className="text-[11px] text-gray-600 mt-2">{t('claudeOnly')}</p>
                        )}
                        {isClaudeEngine && (
                            <p className="text-[11px] text-gray-600 mt-2">{t('modelNote')}</p>
                        )}
                    </section>

                    {/* 커스텀 오케스트레이션 Worker */}
                    <section>
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Boxes size={12} />
                            {t('customWorkers')}
                        </h4>
                        {!isClaudeEngine ? (
                            <p className="text-[11px] text-gray-600">{t('claudeOnly')}</p>
                        ) : (
                            <div className="space-y-2">
                                {/* 빌트인 worker 목록 (Gemini, Codex, Aider) */}
                                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider pb-1">{t('builtinWorkers')}</p>
                                {BUILTIN_WORKER_DEFS.map((w) => {
                                    const enabled = settings.builtinWorkers[w.key];
                                    return (
                                        <div key={w.key} className={`flex items-start gap-2 px-3 py-2 rounded-xl border transition-colors ${enabled ? 'border-gray-700/60 bg-gray-800/40' : 'border-gray-800/60 bg-gray-900/30 opacity-60'}`}>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-xs font-mono ${enabled ? 'text-blue-400' : 'text-gray-600'}`}>{w.toolName}</span>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${w.badgeColor}`}>{w.badge}</span>
                                                </div>
                                                <p className="text-[11px] text-gray-500 mt-0.5">{t(w.descKey)}</p>
                                            </div>
                                            {/* 토글 스위치 */}
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={enabled}
                                                onClick={() => handleToggleBuiltin(w.key)}
                                                className={`relative mt-0.5 inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${enabled ? 'bg-blue-600' : 'bg-gray-700'}`}
                                            >
                                                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                                            </button>
                                        </div>
                                    );
                                })}

                                {/* 구분선 + 커스텀 worker */}
                                <div className="flex items-center gap-2 pt-1">
                                    <div className="h-px flex-1 bg-gray-800" />
                                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{t('customWorkersLabel')}</p>
                                    <div className="h-px flex-1 bg-gray-800" />
                                </div>

                                {/* 커스텀 worker 목록 */}
                                {settings.customWorkers.length === 0 && !showAddForm && (
                                    <p className="text-[11px] text-gray-600 py-1">{t('noCustomWorkers')}</p>
                                )}
                                {settings.customWorkers.map((w, idx) => (
                                    <div key={idx} className="flex items-start gap-2 px-3 py-2 rounded-xl border border-gray-700/60 bg-gray-800/40">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-mono text-green-400">ask_{w.name}</span>
                                                <span className="text-[10px] text-gray-500 truncate">{w.binary}</span>
                                            </div>
                                            <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{w.description}</p>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveWorker(idx)}
                                            className="p-1 text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                ))}

                                {/* 추가 폼 */}
                                {showAddForm && (
                                    <div className="space-y-2 px-3 py-3 rounded-xl border border-blue-500/30 bg-blue-500/5">
                                        <input
                                            type="text"
                                            placeholder={t('workerNamePlaceholder')}
                                            value={newWorker.name}
                                            onChange={e => setNewWorker(p => ({ ...p, name: e.target.value }))}
                                            className="w-full text-xs bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60"
                                        />
                                        <input
                                            type="text"
                                            placeholder={t('workerBinaryPlaceholder')}
                                            value={newWorker.binary}
                                            onChange={e => setNewWorker(p => ({ ...p, binary: e.target.value }))}
                                            className="w-full text-xs bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60"
                                        />
                                        <textarea
                                            placeholder={t('workerDescPlaceholder')}
                                            value={newWorker.description}
                                            onChange={e => setNewWorker(p => ({ ...p, description: e.target.value }))}
                                            rows={2}
                                            className="w-full text-xs bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 resize-none"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleAddWorker}
                                                disabled={!newWorker.name || !newWorker.binary || !newWorker.description}
                                                className="flex-1 text-xs py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
                                            >
                                                {t('workerAdd')}
                                            </button>
                                            <button
                                                onClick={() => { setShowAddForm(false); setNewWorker({ name: '', binary: '', description: '' }); }}
                                                className="flex-1 text-xs py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white transition-colors"
                                            >
                                                {t('workerCancel')}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* + 추가 버튼 */}
                                {!showAddForm && (
                                    <button
                                        onClick={() => setShowAddForm(true)}
                                        className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-xl border border-dashed border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors"
                                    >
                                        <Plus size={12} />
                                        {t('workerAddNew')}
                                    </button>
                                )}
                                <p className="text-[11px] text-gray-600">{t('workerHint')}</p>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
