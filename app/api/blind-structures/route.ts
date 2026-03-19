import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAllBlindStructures, saveBlindStructure } from '@/lib/poker/blind-structures';
import { nanoid } from 'nanoid';

// GET /api/blind-structures
export async function GET() {
  const structures = getAllBlindStructures();
  return NextResponse.json({ structures });
}

// POST /api/blind-structures — admin only
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('poker_profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { name, description, levels } = body;

  if (!name || !Array.isArray(levels) || levels.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const structure = {
    id: nanoid(10),
    name: String(name).slice(0, 80),
    description: description ? String(description).slice(0, 200) : undefined,
    levels,
    isPreset: false,
    createdAt: Date.now(),
  };

  saveBlindStructure(structure);
  return NextResponse.json({ structure }, { status: 201 });
}
