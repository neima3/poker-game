"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Spade } from "lucide-react";

// Preview cards for the hero fan
const HERO_CARDS = [
  { rank: 'A', suit: '♠', color: '#1a1a1a' },
  { rank: 'K', suit: '♥', color: '#dc2626' },
  { rank: 'Q', suit: '♦', color: '#dc2626' },
  { rank: 'J', suit: '♣', color: '#1a1a1a' },
  { rank: '10', suit: '♠', color: '#1a1a1a' },
];

const cardRotations = [-18, -9, 0, 9, 18];
const cardTranslateY = [8, 3, 0, 3, 8];

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 py-12 overflow-hidden">

      {/* Ambient background glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-green-900/20 blur-[120px]" />
        <div className="absolute top-1/2 left-1/4 w-[300px] h-[300px] rounded-full bg-yellow-900/10 blur-[100px]" />
      </div>

      <motion.div
        className="relative flex flex-col items-center gap-10 z-10"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      >

        {/* Animated card fan */}
        <motion.div
          className="flex items-end justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          style={{ height: 100 }}
        >
          {HERO_CARDS.map((card, i) => (
            <motion.div
              key={i}
              className="relative cursor-default"
              style={{
                marginLeft: i === 0 ? 0 : -22,
                zIndex: i === 2 ? 5 : i < 2 ? i : 4 - i,
              }}
              initial={{ opacity: 0, y: 30, rotate: 0 }}
              animate={{ opacity: 1, y: cardTranslateY[i], rotate: cardRotations[i] }}
              transition={{
                delay: 0.1 + i * 0.07,
                type: 'spring',
                stiffness: 280,
                damping: 22,
              }}
              whileHover={{ y: cardTranslateY[i] - 12, zIndex: 10, transition: { duration: 0.15 } }}
            >
              <div
                className="relative flex flex-col items-start justify-between rounded-lg p-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.5)] select-none"
                style={{
                  width: 54,
                  height: 76,
                  background: '#f9f9f9',
                  border: '1px solid #e0e0e0',
                }}
              >
                {/* Top rank + suit */}
                <div style={{ color: card.color, fontSize: 13, fontWeight: 900, lineHeight: 1 }}>
                  <div>{card.rank}</div>
                  <div style={{ fontSize: 10 }}>{card.suit}</div>
                </div>
                {/* Center suit watermark */}
                <div style={{
                  color: card.color,
                  fontSize: 22,
                  fontWeight: 900,
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%,-50%)',
                  opacity: 0.08,
                  pointerEvents: 'none',
                }}>
                  {card.suit}
                </div>
                {/* Bottom rank + suit (rotated) */}
                <div style={{
                  color: card.color,
                  fontSize: 13,
                  fontWeight: 900,
                  lineHeight: 1,
                  transform: 'rotate(180deg)',
                  alignSelf: 'flex-end',
                }}>
                  <div>{card.rank}</div>
                  <div style={{ fontSize: 10 }}>{card.suit}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-felt text-white shadow-lg shadow-green-900/40">
              <Spade className="h-6 w-6" />
            </div>
            <h1 className="text-5xl font-black tracking-tighter">
              Poker<span className="text-gold">App</span>
            </h1>
          </div>
          <p className="text-sm font-medium text-muted-foreground tracking-widest uppercase">
            No-Limit Texas Hold&apos;em
          </p>
        </div>

        {/* Tagline */}
        <p className="max-w-sm text-center text-base text-muted-foreground leading-relaxed">
          Real-time multiplayer poker. Start with{' '}
          <span className="font-bold text-gold">10,000 chips</span> and climb the leaderboard.
        </p>

        {/* CTA buttons */}
        <motion.div
          className="flex flex-col gap-3 sm:flex-row"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          <Button
            asChild
            size="lg"
            className="min-w-[180px] h-12 text-base font-black tracking-widest bg-gradient-to-r from-felt to-felt-dark text-white hover:from-green-700 hover:to-felt-dark shadow-lg shadow-green-900/30 border border-green-700/30"
          >
            <Link href="/lobby">
              <Spade className="mr-2 h-4 w-4" />
              Play Now
            </Link>
          </Button>

          <Button
            asChild
            size="lg"
            variant="outline"
            className="min-w-[180px] h-12 text-base font-semibold border-white/15 hover:border-white/30 hover:bg-white/5"
          >
            <Link href="/login">Sign In</Link>
          </Button>
        </motion.div>

        {/* Stats row */}
        <motion.div
          className="mt-2 grid grid-cols-3 gap-8 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          {[
            { value: '2–9', label: 'Players' },
            { value: 'NL', label: "Hold'em" },
            { value: 'Free', label: 'To Play' },
          ].map(({ value, label }) => (
            <div key={label} className="flex flex-col gap-1">
              <div className="text-3xl font-black text-white tracking-tight">{value}</div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-widest">{label}</div>
            </div>
          ))}
        </motion.div>

      </motion.div>
    </div>
  );
}
