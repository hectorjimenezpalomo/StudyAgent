/**
 * Tipos compartidos no derivados de Supabase.
 * Para tipos de la base de datos, ver lib/supabase/types.ts.
 */

export interface Document {
  id: string;
  user_id: string;
  title: string;
  storage_path: string;
  size_bytes: number;
  page_count: number | null;
  status: 'pending' | 'ingesting' | 'ready' | 'error';
  error_message: string | null;
  created_at: string;
  ingested_at: string | null;
}

export interface ChunkResult {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  page_number: number | null;
  similarity: number;
}

export interface QuizQuestion {
  question: string;
  options: [string, string, string, string];
  correct_index: 0 | 1 | 2 | 3;
  explanation: string;
}

export interface Flashcard {
  question: string;
  answer: string;
}
