import { useEffect, useRef } from 'react';
import { ToolCard } from './ToolCard';

type TextMsg = { kind: 'text'; id: string; content: string; role: 'user' | 'assistant' };
type ToolMsg = { kind: 'tool'; id: string; name: string; args: string; output?: string; status: 'running' | 'done' | 'error'; error?: string };
export type ChatMessage = TextMsg | ToolMsg;

export function MessageList({ messages }: { messages: ChatMessage[] }) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
            {messages.map(msg => {
                if (msg.kind === 'text') {
                    if (msg.role === 'user') {
                        return (
                            <div key={msg.id} className="flex justify-end">
                                <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed shadow-sm">
                                    <p className="whitespace-pre-wrap break-words">{msg.content.trimEnd()}</p>
                                </div>
                            </div>
                        );
                    }
                    // assistant
                    return (
                        <div key={msg.id} className="flex justify-start">
                            <div className="max-w-[90%] bg-gray-800/80 border border-gray-700/50 text-gray-100 rounded-2xl rounded-bl-md px-4 py-2.5 text-[13px] font-mono leading-relaxed shadow-sm">
                                <p className="whitespace-pre-wrap break-words">{msg.content.trimEnd()}</p>
                            </div>
                        </div>
                    );
                }
                return (
                    <ToolCard
                        key={msg.id}
                        name={msg.name}
                        args={msg.args}
                        output={msg.output}
                        status={msg.status}
                        error={msg.error}
                    />
                );
            })}
            <div ref={bottomRef} />
        </div>
    );
}
