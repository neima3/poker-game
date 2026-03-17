'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, MapPin, Eye, Trophy, Filter, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface StatsData {
  winRateOverTime: Array<{ hand: number; winRate: number; date: string }>;
  positionProfitability: Array<{ label: string; profit: number; hands: number }>;
  showdownData: Array<{ name: string; value: number; fill: string }>;
  biggestPots: Array<{ potSize: number; date: string; isWin: boolean; stakes: string }>;
  stakesOptions: string[];
  totalHands: number;
}

const PIE_COLORS = ['hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)', 'hsl(48, 96%, 53%)'];

function ChartCard({
  title,
  icon,
  delay,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, type: 'spring', stiffness: 260, damping: 24 }}
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
            {icon}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </motion.div>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-card px-3 py-2 shadow-xl text-sm">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }} className="font-medium">
          {entry.name}: {entry.value.toLocaleString()}
          {entry.name === 'Win Rate' ? '%' : ''}
        </p>
      ))}
    </div>
  );
}

export function StatsCharts() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stakesFilter, setStakesFilter] = useState<string>('all');

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/stats');
        if (!res.ok) throw new Error('Failed to load stats');
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  // Filter biggest pots by stakes
  const filteredBiggestPots = useMemo(() => {
    if (!data) return [];
    if (stakesFilter === 'all') return data.biggestPots;
    return data.biggestPots.filter((p) => p.stakes === stakesFilter);
  }, [data, stakesFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading analytics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!data || data.totalHands === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">No hands played yet. Play some hands to see your stats!</p>
      </div>
    );
  }

  // Sample win rate data at intervals for readability
  const winRateSampled =
    data.winRateOverTime.length > 50
      ? data.winRateOverTime.filter(
          (_, i) => i % Math.ceil(data.winRateOverTime.length / 50) === 0 || i === data.winRateOverTime.length - 1
        )
      : data.winRateOverTime;

  return (
    <div className="flex flex-col gap-6">
      {/* Stakes filter */}
      {data.stakesOptions.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-2 flex-wrap"
        >
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Stakes:</span>
          <Button
            variant={stakesFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStakesFilter('all')}
            className="h-7 text-xs"
          >
            All
          </Button>
          {data.stakesOptions.map((s) => (
            <Button
              key={s}
              variant={stakesFilter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStakesFilter(s)}
              className="h-7 text-xs"
            >
              {s}
            </Button>
          ))}
        </motion.div>
      )}

      {/* Charts grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1. Win Rate Over Time */}
        <ChartCard
          title="Win Rate Over Time"
          icon={<TrendingUp className="h-4 w-4 text-emerald-400" />}
          delay={0.05}
        >
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={winRateSampled}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                <XAxis
                  dataKey="hand"
                  tick={{ fill: 'hsl(0 0% 63%)', fontSize: 12 }}
                  label={{ value: 'Hand #', position: 'insideBottomRight', offset: -5, fill: 'hsl(0 0% 50%)' }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: 'hsl(0 0% 63%)', fontSize: 12 }}
                  label={{ value: 'Win %', angle: -90, position: 'insideLeft', fill: 'hsl(0 0% 50%)' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="winRate"
                  name="Win Rate"
                  stroke="hsl(142, 71%, 45%)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'hsl(142, 71%, 45%)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* 2. Position Profitability */}
        <ChartCard
          title="Position Profitability"
          icon={<MapPin className="h-4 w-4 text-blue-400" />}
          delay={0.1}
        >
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.positionProfitability} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                <XAxis
                  type="number"
                  tick={{ fill: 'hsl(0 0% 63%)', fontSize: 12 }}
                  label={{ value: 'Profit (chips)', position: 'insideBottomRight', offset: -5, fill: 'hsl(0 0% 50%)' }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={100}
                  tick={{ fill: 'hsl(0 0% 63%)', fontSize: 12 }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as { label: string; profit: number; hands: number };
                    return (
                      <div className="rounded-lg border border-border/60 bg-card px-3 py-2 shadow-xl text-sm">
                        <p className="font-medium">{d.label}</p>
                        <p className={d.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          Profit: {d.profit >= 0 ? '+' : ''}{d.profit.toLocaleString()}
                        </p>
                        <p className="text-muted-foreground">Hands: {d.hands}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="profit" radius={[0, 4, 4, 0]}>
                  {data.positionProfitability.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.profit >= 0 ? 'hsl(142, 71%, 45%)' : 'hsl(0, 84%, 60%)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* 3. Showdown Frequency */}
        <ChartCard
          title="Showdown Frequency"
          icon={<Eye className="h-4 w-4 text-purple-400" />}
          delay={0.15}
        >
          <div className="h-[280px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.showdownData.filter((d) => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {data.showdownData
                    .filter((d) => d.value > 0)
                    .map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as { name: string; value: number };
                    return (
                      <div className="rounded-lg border border-border/60 bg-card px-3 py-2 shadow-xl text-sm">
                        <p className="font-medium">{d.name}</p>
                        <p className="text-muted-foreground">{d.value} hands</p>
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', color: 'hsl(0 0% 63%)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* 4. Biggest Pots */}
        <ChartCard
          title="Biggest Pots"
          icon={<Trophy className="h-4 w-4 text-gold" />}
          delay={0.2}
        >
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredBiggestPots}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
                <XAxis
                  dataKey="potSize"
                  tickFormatter={(_, i) => `#${i + 1}`}
                  tick={{ fill: 'hsl(0 0% 63%)', fontSize: 12 }}
                />
                <YAxis
                  tick={{ fill: 'hsl(0 0% 63%)', fontSize: 12 }}
                  label={{ value: 'Pot Size', angle: -90, position: 'insideLeft', fill: 'hsl(0 0% 50%)' }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as {
                      potSize: number;
                      date: string;
                      isWin: boolean;
                      stakes: string;
                    };
                    return (
                      <div className="rounded-lg border border-border/60 bg-card px-3 py-2 shadow-xl text-sm">
                        <p className="font-medium">{d.potSize.toLocaleString()} chips</p>
                        <p className={d.isWin ? 'text-emerald-400' : 'text-red-400'}>
                          {d.isWin ? 'Won' : 'Lost'}
                        </p>
                        <p className="text-muted-foreground">Stakes: {d.stakes}</p>
                        {d.date && (
                          <p className="text-muted-foreground text-xs">
                            {new Date(d.date).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="potSize" radius={[4, 4, 0, 0]}>
                  {filteredBiggestPots.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.isWin ? 'hsl(48, 96%, 53%)' : 'hsl(0, 84%, 60%)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
