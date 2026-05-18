import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'StudyAgent',
  description: 'Asistente de estudio con IA basado en tus apuntes',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
