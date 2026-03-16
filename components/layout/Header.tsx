import Link from "next/link";
import { Coins, LogIn, LogOut, User, ChevronDown, Shield, Trophy, History, Target } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export async function Header() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { username: string; chips: number; is_guest: boolean; is_admin: boolean } | null = null;

  if (user) {
    const { data } = await supabase
      .from("poker_profiles")
      .select("username, chips, is_guest, is_admin")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">
            Poker<span className="text-gold">App</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {profile ? (
            <>
              {/* Chip balance */}
              <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-sm">
                <Coins className="h-4 w-4 text-gold" />
                <span className="font-medium tabular-nums">
                  {profile.chips.toLocaleString()}
                </span>
              </div>

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-1.5"
                  >
                    <User className="h-4 w-4" />
                    <span className="max-w-[120px] truncate text-sm">
                      {profile.username}
                    </span>
                    {profile.is_guest && (
                      <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Guest
                      </span>
                    )}
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link href="/profile">
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/history">
                      <History className="mr-2 h-4 w-4" />
                      Hand History
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/achievements">
                      <Target className="mr-2 h-4 w-4" />
                      Achievements
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/leaderboard">
                      <Trophy className="mr-2 h-4 w-4" />
                      Leaderboard
                    </Link>
                  </DropdownMenuItem>
                  {profile.is_admin && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="text-gold">
                        <Shield className="mr-2 h-4 w-4" />
                        Admin Panel
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {profile.is_guest && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/signup" className="text-gold">
                          Create Account
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <form action={logout} className="w-full">
                      <button
                        type="submit"
                        className="flex w-full items-center text-destructive"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                      </button>
                    </form>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">
                  <LogIn className="mr-1.5 h-4 w-4" />
                  Sign In
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="bg-felt text-white hover:bg-felt-dark"
              >
                <Link href="/signup">Create Account</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
