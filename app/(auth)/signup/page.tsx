import Link from "next/link";
import { Spade, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { signup, playAsGuest } from "@/app/(auth)/actions";

interface SignupPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const errorMsg = params.error;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-felt">
          <Spade className="h-6 w-6 text-white" />
        </div>
        <CardTitle className="text-2xl">Create account</CardTitle>
        <CardDescription>
          Start with <span className="text-gold font-semibold">10,000 chips</span> for free
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {decodeURIComponent(errorMsg)}
          </div>
        )}

        <form action={signup} className="space-y-3">
          <Input
            name="username"
            type="text"
            placeholder="Username"
            required
            minLength={3}
            maxLength={20}
            pattern="[a-zA-Z0-9_]+"
            title="Letters, numbers, and underscores only"
            autoComplete="username"
          />
          <Input
            name="email"
            type="email"
            placeholder="Email address"
            required
            autoComplete="email"
          />
          <Input
            name="password"
            type="password"
            placeholder="Password (min 8 characters)"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <SubmitButton pendingText="Creating account…" className="w-full bg-felt text-white hover:bg-felt-dark">
            Create Account
          </SubmitButton>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <form action={playAsGuest}>
          <SubmitButton variant="outline" pendingText="Setting up guest…" className="w-full">
            Play as Guest
          </SubmitButton>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-gold hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
