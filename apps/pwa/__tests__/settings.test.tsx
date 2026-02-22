import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPage from '../src/app/settings/page';
import { useRouter } from 'next/navigation';

// Mock useRouter
jest.mock('next/navigation', () => ({
    useRouter: jest.fn(),
}));

describe('SettingsPage', () => {
    const mockRouter = {
        replace: jest.fn(),
    };

    beforeEach(() => {
        (useRouter as jest.Mock).mockReturnValue(mockRouter);
        // Clear mocks and local storage before each test
        jest.clearAllMocks();
        localStorage.clear();
        (navigator.clipboard.writeText as jest.Mock).mockClear();
    });

    it('redirects to login if no token is found in localStorage', () => {
        render(<SettingsPage />);
        expect(mockRouter.replace).toHaveBeenCalledWith('/login');
    });

    it('renders the settings page with token when token exists in localStorage', () => {
        const testToken = 'test-jwt-token-12345';
        localStorage.setItem('pocket_ai_token', testToken);

        render(<SettingsPage />);

        expect(screen.getByText('설정')).toBeInTheDocument();
        expect(screen.getByText('기본 프로필')).toBeInTheDocument();
        expect(screen.getByText(testToken)).toBeInTheDocument();
    });

    it('copies the token to clipboard when copy button is clicked', async () => {
        const testToken = 'test-jwt-token-12345';
        localStorage.setItem('pocket_ai_token', testToken);
        (navigator.clipboard.writeText as jest.Mock).mockResolvedValue(undefined);

        render(<SettingsPage />);

        const copyBtn = screen.getByText('토큰 복사하기');
        fireEvent.click(copyBtn);

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(testToken);

        // Assert UI changes to '복사됨!'
        await waitFor(() => {
            expect(screen.getByText('복사됨!')).toBeInTheDocument();
        });
    });

    it('removes token and redirects to login when logout is clicked', () => {
        localStorage.setItem('pocket_ai_token', 'test-jwt-token-12345');

        render(<SettingsPage />);

        const logoutBtn = screen.getByText('로그아웃', { selector: 'button' });
        fireEvent.click(logoutBtn);

        expect(localStorage.getItem('pocket_ai_token')).toBeNull();
        expect(mockRouter.replace).toHaveBeenCalledWith('/login');
    });
});
