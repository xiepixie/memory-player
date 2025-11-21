import { Card, ReviewLog, createEmptyCard } from 'ts-fsrs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DataService, NoteMetadata } from './types';

export class SupabaseAdapter implements DataService {
  private supabase: SupabaseClient | null = null;

  constructor(private supabaseUrl: string, private supabaseKey: string) {}

  async init(): Promise<void> {
    if (!this.supabaseUrl || !this.supabaseKey) {
      console.warn("Supabase credentials missing. Adapter will not work.");
      return;
    }
    this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
    // Optional: Test connection or auth check
  }

  async saveReview(filepath: string, card: Card, log: ReviewLog): Promise<void> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    // Upsert card state
    const { error: cardError } = await this.supabase
      .from('cards')
      .upsert({
        filepath,
        ...card,
        last_reviewed: new Date().toISOString()
      }, { onConflict: 'filepath' });

    if (cardError) throw cardError;

    // Insert log
    const { error: logError } = await this.supabase
      .from('review_logs')
      .insert({
        filepath,
        ...log
      });

    if (logError) throw logError;
  }

  async getMetadata(filepath: string): Promise<NoteMetadata> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    const { data, error } = await this.supabase
      .from('cards')
      .select('*')
      .eq('filepath', filepath)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found"
      console.error('Supabase error fetching metadata', error);
    }

    if (!data) {
      return {
        filepath,
        card: createEmptyCard(),
      };
    }

    // Map database fields back to Card object if necessary
    // Assuming DB schema matches Card fields 1:1 for simplicity here
    return {
      filepath,
      card: data as unknown as Card, // You might need a mapper here
      lastReview: undefined, // Fetching last review log would require another query
    };
  }

  async getAllMetadata(): Promise<NoteMetadata[]> {
    if (!this.supabase) throw new Error("Supabase not initialized");

    const { data, error } = await this.supabase
      .from('cards')
      .select('*');

    if (error) throw error;

    return (data || []).map((row: any) => ({
      filepath: row.filepath,
      card: row as unknown as Card,
    }));
  }
}
