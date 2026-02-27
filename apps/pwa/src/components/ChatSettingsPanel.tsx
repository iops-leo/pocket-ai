'use client';

import { X, Shield, Cpu } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type PermissionMode = 'default' | 'acceptEdits' | 'planMode' | 'yolo';
export type ModelSetting = 'default' | 'adaptive' | 'sonnet' | 'opus';

export interface ChatSettings {
    permissionMode: PermissionMode;
    model: ModelSetting;
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

const MODEL_OPTIONS: OptionItem<ModelSetting>[] = [
    { id: 'default', labelKey: 'modelDefault', descKey: 'modelDefaultDesc' },
    { id: 'adaptive', labelKey: 'modelAdaptive', descKey: 'modelAdaptiveDesc', badge: 'Smart', badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
    { id: 'sonnet', labelKey: 'modelSonnet', descKey: 'modelSonnetDesc', badge: 'Sonnet', badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
    { id: 'opus', labelKey: 'modelOpus', descKey: 'modelOpusDesc', badge: 'Opus', badgeColor: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
];

export function ChatSettingsPanel({ settings, onSettingsChange, onClose, isClaudeEngine }: ChatSettingsPanelProps) {
    const t = useTranslations('chatSettings');

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
                </div>
            </div>
        </div>
    );
}
