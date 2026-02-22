import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { TerminalChat } from '../src/components/TerminalChat';
import { io } from 'socket.io-client';

// Mock Next Router
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        back: jest.fn()
    })
}));

// Mock Socket.IO
jest.mock('socket.io-client', () => {
    return {
        io: jest.fn(() => ({
            emit: jest.fn(),
            on: jest.fn(),
            once: jest.fn(),
            disconnect: jest.fn()
        }))
    };
});

// Mock Wire Protocol
jest.mock('@pocket-ai/wire', () => ({
    generateECDHKeyPair: jest.fn().mockResolvedValue({ publicKey: 'mock-pub', privateKey: 'mock-priv' }),
    deriveSharedSecret: jest.fn().mockResolvedValue('mock-secret'),
    importPublicKey: jest.fn().mockResolvedValue('mock-imported-key'),
    exportPublicKey: jest.fn().mockResolvedValue('mock-exported-key'),
    encrypt: jest.fn(),
    decrypt: jest.fn()
}));

// Mock xterm since it fundamentally requires real DOM and canvas elements
jest.mock('xterm', () => ({
    Terminal: jest.fn().mockImplementation(() => ({
        loadAddon: jest.fn(),
        open: jest.fn(),
        dispose: jest.fn(),
        onData: jest.fn(),
        write: jest.fn(),
        writeln: jest.fn()
    }))
}));

jest.mock('xterm-addon-fit', () => ({
    FitAddon: jest.fn().mockImplementation(() => ({
        fit: jest.fn(),
    }))
}));

jest.mock('xterm-addon-web-links', () => ({
    WebLinksAddon: jest.fn()
}));

// Mock ResizeObserver
class MockResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
}
global.ResizeObserver = MockResizeObserver;

describe('TerminalChat', () => {
    let mockOnBack: jest.Mock;

    beforeEach(() => {
        mockOnBack = jest.fn();
        localStorage.clear();
        jest.clearAllMocks();
    });

    it('renders the back button and session id correctly', async () => {
        render(<TerminalChat sessionId="test-session-123" onBack={mockOnBack} />);

        await waitFor(() => {
            expect(screen.getByText('test')).toBeInTheDocument(); // test-session-123.split('-')[0] produces "test"
            expect(screen.getByText((content, element) => content.includes('연결 중'))).toBeInTheDocument();
        });
    });

    it('displays the connection loading mask initially', async () => {
        render(<TerminalChat sessionId="test-session-123" onBack={mockOnBack} />);

        await waitFor(() => {
            expect(screen.getByText('보안 연결 설정 중...')).toBeInTheDocument();
        });
    });

    it('initializes socket.io with the correct parameters', async () => {
        const testToken = 'mock-terminal-token';
        localStorage.setItem('pocket_ai_token', testToken);

        render(<TerminalChat sessionId="test-session-123" onBack={mockOnBack} />);

        await waitFor(() => {
            expect(io).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    reconnectionDelayMax: 5000,
                    reconnectionAttempts: Infinity
                })
            );
        });
    });
});
