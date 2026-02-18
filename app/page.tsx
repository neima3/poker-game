"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Spade, LogIn } from "lucide-react";

const suits = ["♠", "♥", "♦", "♣"];

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-24">
      {/* Floating suit symbols */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {suits.map((suit, i) => (
          <motion.span
            key={suit}
            className="absolute text-6xl opacity-[0.04] select-none"
            style={{
              left: `${20 + i * 20}%`,
              top: `${15 + (i % 2) * 40}%`,
            }}
            animate={{
              y: [0, -20, 0],
              rotate: [0, 10, -10, 0],
            }}
            transition={{
              duration: 6 + i,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.5,
            }}
          >
            {suit}
          </motion.span>
        ))}
      </div>

      <motion.div
        className="relative flex flex-col items-center gap-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-felt text-white shadow-lg">
            <Spade className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight">
              Poker<span className="text-gold">App</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Texas Hold&apos;em
            </p>
          </div>
        </div>

        {/* Tagline */}
        <p className="max-w-md text-center text-lg text-muted-foreground">
          No-limit Texas Hold&apos;em with real-time multiplayer.
          Start with <span className="font-semibold text-gold">10,000 chips</span> and
          play your way to the top.
        </p>

        {/* Action buttons */}
        <motion.div
          className="flex flex-col gap-3 sm:flex-row"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <Button
            asChild
            size="lg"
            className="min-w-[160px] bg-felt text-white hover:bg-felt-dark"
          >
            <Link href="/lobby">
              <Spade className="mr-2 h-4 w-4" />
              Play Now
            </Link>
          </Button>

          <Button asChild size="lg" variant="outline" className="min-w-[160px]">
            <Link href="/login">
              <LogIn className="mr-2 h-4 w-4" />
              Login
            </Link>
          </Button>
        </motion.div>

        {/* Table stakes preview */}
        <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm text-muted-foreground">
          <div>
            <div className="text-2xl font-bold text-foreground">2-9</div>
            <div>Players</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">10</div>
            <div>Blind Levels</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">NL</div>
            <div>Hold&apos;em</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
