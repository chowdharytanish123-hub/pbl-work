import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Fridge to Fork — Cook what you have', description: 'Indian food intelligence for your everyday kitchen.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
