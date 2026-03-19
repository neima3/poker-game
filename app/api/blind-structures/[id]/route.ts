import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBlindStructure, saveBlindStructure, deleteBlindStructure } from '@/lib/poker/blind-structures';

const PRESET_IDS = new Set(['wsop-main-event', 'pokerstars-standard', 'home-game']);

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('poker_profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  return profile?.is_admin ? user : null;
}

// GET /api/blind-structures/[id]
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const structure = getBlindStructure(id);
  if (!structure) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ structure });
}

// PUT /api/blind-structures/[id] — admin only, cannot edit presets
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (PRESET_IDS.has(id)) {
    return NextResponse.json({ error: 'Cannot edit a built-in preset' }, { status: 400 });
  }

  const existing = getBlindStructure(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updated = {
    ...existing,
    name: body.name ? String(body.name).slice(0, 80) : existing.name,
    description: body.description !== undefined ? String(body.description).slice(0, 200) : existing.description,
    levels: Array.isArray(body.levels) && body.levels.length > 0 ? body.levels : existing.levels,
  };

  saveBlindStructure(updated);
  return NextResponse.json({ structure: updated });
}

// DELETE /api/blind-structures/[id] — admin only, cannot delete presets
export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (PRESET_IDS.has(id)) {
    return NextResponse.json({ error: 'Cannot delete a built-in preset' }, { status: 400 });
  }

  const deleted = deleteBlindStructure(id);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
