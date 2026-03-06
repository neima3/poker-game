'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function QuickPlay() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleQuickPlay() {
    setLoading(true);
    try {
      // 1. Create a private quick-play table
      const createRes = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Quick Game ${Math.floor(Math.random() * 9000) + 1000}`,
          table_size: 6,
          small_blind: 25,
          big_blind: 50,
          min_buy_in: 1000,
          max_buy_in: 5000,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error ?? 'Failed to create table');

      const tableId = createData.table.id;

      // 2. Sit at the table
      const sitRes = await fetch(`/api/tables/${tableId}/sit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seat_number: 1, buy_in: 2500 }),
      });
      if (!sitRes.ok) {
        const sitData = await sitRes.json();
        throw new Error(sitData.error ?? 'Failed to sit');
      }

      // 3. Start with bots
      const startRes = await fetch(`/api/tables/${tableId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fill_bots: true, bot_difficulty: 'regular' }),
      });
      if (!startRes.ok) {
        // Navigate to table anyway — user can start manually
        toast.info('Navigate to table to start game');
      } else {
        toast.success('Game started! Good luck 🃏');
      }

      router.push(`/table/${tableId}`);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to start quick game');
      setLoading(false);
    }
  }

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Button
        onClick={handleQuickPlay}
        disabled={loading}
        size="lg"
        className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white gap-2 shadow-lg shadow-purple-900/30"
      >
        <Zap className="h-5 w-5" />
        {loading ? 'Setting up game…' : 'Quick Play vs Bots'}
      </Button>
    </motion.div>
  );
}
