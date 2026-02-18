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

  const guestNum = Math.floor(Math.random() * 90000) + 10000;
  const username = `Guest_${guestNum}`;

  // Sign up with a random email/password so Supabase creates a user row
  // This triggers our handle_new_user() DB function with is_guest=true
  const { error } = await supabase.auth.signUp({
    email: `${username.toLowerCase()}@guest.pokerapp.internal`,
    password: crypto.randomUUID(),
    options: {
      data: { username, is_guest: true, app: "poker" },
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
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
