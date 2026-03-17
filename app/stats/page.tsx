import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BarChart3, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { StatsCharts } from './StatsCharts';

export const dynamic = 'force-dynamic';

export default async function StatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BarChart3 className="h-6 w-6 text-gold" />
            Player Statistics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visual analytics for your gameplay
          </p>
        </div>
        <Link
          href="/lobby"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Lobby
        </Link>
      </div>

      <StatsCharts />
    </div>
  );
}
