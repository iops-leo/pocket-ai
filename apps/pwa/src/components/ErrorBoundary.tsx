'use client';

import { Component, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
    onReset?: () => void;
}

interface State {
    hasError: boolean;
    error: string;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: '' };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error: error?.message || String(error) };
    }

    handleReset = () => {
        this.setState({ hasError: false, error: '' });
        this.props.onReset?.();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-950 text-center gap-4">
                    <p className="text-red-400 text-sm font-medium">연결 오류가 발생했습니다</p>
                    <pre className="text-[10px] text-gray-500 bg-gray-900 rounded-lg p-3 max-w-xs overflow-auto text-left break-all whitespace-pre-wrap">
                        {this.state.error}
                    </pre>
                    <button
                        onClick={this.handleReset}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                    >
                        <RefreshCw size={14} />
                        재연결
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
