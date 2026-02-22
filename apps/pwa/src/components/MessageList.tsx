import { useEffect, useRef } from 'react';
import { ToolCard } from './ToolCard';

type TextMsg = { kind: 'text'; id: string; content: string };
type ToolMsg = { kind: 'tool'; id: string; name: string; args: string; output?: string; status: 'running' | 'done' | 'error'; error?: string };
export type ChatMessage = TextMsg | ToolMsg;

export function MessageList({ messages }: { messages: ChatMessage[] }) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 font-mono text-sm">
            {messages.map(msg => {
                if (msg.kind === 'text') {
                    return (
                        <div key={msg.id} className="text-gray-200 whitespace-pre-wrap break-words leading-relaxed text-[13px]">
                            {msg.content}
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
