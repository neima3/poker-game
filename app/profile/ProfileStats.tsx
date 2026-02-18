'use client';

import { useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Coins, Trophy, TrendingUp, Hash } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  prefix?: string;
  suffix?: string;
  colorClass?: string;
  delay?: number;
}

function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
}: {
  value: number;
  prefix?: string;
  suffix?: string;
}) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: 1400, bounce: 0 });
  const display = useTransform(spring, (v) =>
    `${prefix}${Math.round(v).toLocaleString()}${suffix}`
  );

  useEffect(() => {
    mv.set(value);
  }, [mv, value]);

  return <motion.span>{display}</motion.span>;
}

function StatCard({ title, value, icon, prefix, suffix, colorClass, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, type: 'spring', stiffness: 300, damping: 25 }}
    >
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
            {icon}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold tabular-nums ${colorClass ?? ''}`}>
            <AnimatedNumber value={value} prefix={prefix} suffix={suffix} />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface ProfileStatsProps {
  chips: number;
  handsPlayed: number;
  totalWinnings: number;
  username: string;
  isGuest?: boolean;
}

export function ProfileStats({ chips, handsPlayed, totalWinnings, username, isGuest }: ProfileStatsProps) {
  const avgPerHand = handsPlayed > 0 ? Math.round(totalWinnings / handsPlayed) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Username card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, type: 'spring', stiffness: 300, damping: 25 }}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Username
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-xl font-bold">
              {username}
              {isGuest && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  Guest
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          title="Chip Balance"
          value={chips}
          icon={<Coins className="h-4 w-4 text-gold" />}
          colorClass="text-gold"
          delay={0.05}
        />
        <StatCard
          title="Hands Played"
          value={handsPlayed}
          icon={<Trophy className="h-4 w-4" />}
          delay={0.1}
        />
        <StatCard
          title="Total Winnings"
          value={totalWinnings}
          icon={<TrendingUp className="h-4 w-4 text-green-400" />}
          colorClass="text-green-400"
          delay={0.15}
        />
        <StatCard
          title="Avg per Hand"
          value={avgPerHand}
          icon={<Coins className="h-4 w-4 text-muted-foreground" />}
          colorClass={avgPerHand >= 0 ? 'text-blue-400' : 'text-red-400'}
          delay={0.2}
        />
      </div>
    </div>
  );
}
