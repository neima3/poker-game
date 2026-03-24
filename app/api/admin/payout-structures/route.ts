import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  listPayoutStructures,
  setPayoutOverride,
  clearPayoutOverride,
  validatePayout,
} from '@/lib/poker/payout-structures';

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

// GET /api/admin/payout-structures
export async function GET() {
  const structures = listPayoutStructures();
  return NextResponse.json({ structures });
}

// POST /api/admin/payout-structures
// Body: { configId: string, payout: number[] }
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { configId, payout } = body;

  if (!configId || typeof configId !== 'string') {
    return NextResponse.json({ error: 'configId is required' }, { status: 400 });
  }

  try {
    validatePayout(payout);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  setPayoutOverride(configId, payout);
  return NextResponse.json({ ok: true, configId, payout });
}

// DELETE /api/admin/payout-structures?configId=sng-6
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const configId = req.nextUrl.searchParams.get('configId');
  if (!configId) {
    return NextResponse.json({ error: 'configId query param required' }, { status: 400 });
  }

  clearPayoutOverride(configId);
  return NextResponse.json({ ok: true, configId });
}
