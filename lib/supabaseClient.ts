import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
    'https://pouxujkhtbvkdwbzfvka.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvdXh1amtodGJ2a2R3YnpmdmthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxOTc4ODYsImV4cCI6MjA3MDc3Mzg4Nn0.rGCwH_zGfzRbaGeItLgnwEDX5SEVLG9j-yEiNHHTztk'
);