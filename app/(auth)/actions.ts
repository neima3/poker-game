"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// ── Login ──────────────────────────────────────────────────
export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/lobby");
}

// ── Signup ─────────────────────────────────────────────────
export async function signup(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const username = (formData.get("username") as string).trim();

  // Check username availability
  const { data: existing } = await supabase
    .from("poker_profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (existing) {
    redirect(`/signup?error=${encodeURIComponent("Username is already taken")}`);
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/auth/callback`,
      data: { username, app: "poker" },
    },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/lobby");
}

// ── Guest play ─────────────────────────────────────────────
export async function playAsGuest() {
  const supabase = await createClient();

  // Use anonymous sign-in — no email required, session starts immediately.
  // The DB trigger won't create a poker_profiles row (no app metadata),
  // so we create it explicitly via service role.
  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  const userId = data.user?.id;
  if (!userId) {
    redirect(`/login?error=${encodeURIComponent("Failed to create guest account")}`);
  }

  // UUID-based suffix — zero collision probability on the UNIQUE username column
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const username = `Guest_${suffix}`;

  // Create the profile via service role (bypasses RLS, no trigger dependency)
  const { createServiceClient } = await import("@/lib/supabase/service");
  const admin = createServiceClient();
  const { error: profileError } = await admin.from("poker_profiles").insert({
    id: userId,
    username,
    display_name: username,
    is_guest: true,
    chips: 10000,
  });

  if (profileError) {
    // Clean up the orphaned auth user so it doesn't block future attempts
    await admin.auth.admin.deleteUser(userId);
    redirect(`/login?error=${encodeURIComponent("Failed to create guest profile")}`);
  }

  revalidatePath("/", "layout");
  redirect("/lobby");
}

// ── Logout ─────────────────────────────────────────────────
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
