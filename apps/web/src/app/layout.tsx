import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';

export const metadata: Metadata = {
  title: 'DevPilot — AI-Powered Social Media Command Center',
  description: 'Manage CodeCulture social media content, research trends, and schedule posts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-devpilot-bg text-devpilot-text antialiased selection:bg-devpilot-purple selection:text-white">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
