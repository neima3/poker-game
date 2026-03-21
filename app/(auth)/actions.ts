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
  const { createServiceClient } = await import("@/lib/supabase/service");
  const admin = createServiceClient();

  // UUID-based suffix — zero collision probability on the UNIQUE username column
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const username = `Guest_${suffix}`;
  // Use a real TLD so Supabase email validation always accepts it
  const email = `${username.toLowerCase()}@guest.pokerapp.com`;
  const password = crypto.randomUUID();

  // Create user via admin API with email_confirm:true — this works regardless
  // of the project's email-confirmation setting and bypasses the DB trigger
  // (no app metadata passed), so no trigger-side profile creation happens.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    redirect(`/login?error=${encodeURIComponent(createError.message)}`);
  }

  const userId = created.user?.id;
  if (!userId) {
    redirect(`/login?error=${encodeURIComponent("Failed to create guest account")}`);
  }

  // Create the profile via service role (bypasses RLS, no trigger dependency)
  const { error: profileError } = await admin.from("poker_profiles").insert({
    id: userId,
    username,
    display_name: username,
    is_guest: true,
    chips: 10000,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    redirect(`/login?error=${encodeURIComponent("Failed to create guest profile")}`);
  }

  // Sign in with the credentials we just created so the browser gets a session
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    await admin.auth.admin.deleteUser(userId);
    redirect(`/login?error=${encodeURIComponent(signInError.message)}`);
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
