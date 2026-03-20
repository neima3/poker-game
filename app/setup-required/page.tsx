import { validateEnv } from "@/lib/env";
import { Spade, AlertTriangle, CheckCircle2, Terminal } from "lucide-react";

export default function SetupRequiredPage() {
  const env = validateEnv();
  const missing = env.isValid ? [] : env.missing;

  const steps = [
    {
      step: 1,
      title: "Create a Supabase project",
      detail: (
        <>
          Go to{" "}
          <span className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">
            supabase.com
          </span>{" "}
          and create a new project. Note your project&apos;s URL and API keys.
        </>
      ),
    },
    {
      step: 2,
      title: "Run the database schema",
      detail: (
        <>
          In the Supabase SQL editor, run the full schema from{" "}
          <span className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">
            lib/supabase/schema.sql
          </span>
          . Then apply the migrations in{" "}
          <span className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">
            supabase/migrations/
          </span>{" "}
          in date order. See{" "}
          <span className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">
            SETUP.md
          </span>{" "}
          for full details.
        </>
      ),
    },
    {
      step: 3,
      title: "Create .env.local",
      detail: (
        <>
          Copy{" "}
          <span className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">
            .env.example
          </span>{" "}
          to{" "}
          <span className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">
            .env.local
          </span>{" "}
          and fill in your Supabase credentials.
        </>
      ),
    },
    {
      step: 4,
      title: "Restart the dev server",
      detail: (
        <>
          Run{" "}
          <span className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">
            npm run dev
          </span>{" "}
          again — the app will load normally once the env vars are present.
        </>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1a6b3c] text-white shadow-lg">
            <Spade className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              PokerApp — Setup Required
            </h1>
            <p className="text-sm text-gray-400">
              Supabase environment variables are not configured
            </p>
          </div>
        </div>

        {/* Missing vars banner */}
        {missing.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-300 mb-1">
                Missing environment variables
              </p>
              <ul className="space-y-1">
                {missing.map((v) => (
                  <li key={v} className="font-mono text-xs text-amber-200">
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Required .env.local block */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-300">
            <Terminal className="h-4 w-4" />
            Required: <code className="font-mono">.env.local</code>
          </div>
          <pre className="text-xs text-green-300 bg-black/40 rounded-lg p-4 overflow-x-auto leading-relaxed">
{`# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# App Configuration
PORT=3018
NEXT_PUBLIC_APP_URL=http://localhost:3018`}
          </pre>
          <p className="text-xs text-gray-500">
            Find your keys in the Supabase dashboard under{" "}
            <strong className="text-gray-400">Project Settings → API</strong>.
          </p>
        </div>

        {/* Setup steps */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Setup Steps
          </h2>
          {steps.map(({ step, title, detail }) => (
            <div
              key={step}
              className="flex gap-4 rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1a6b3c] text-white text-xs font-bold">
                {step}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs text-gray-400 leading-relaxed">{detail}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Already configured? */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex gap-3">
          <CheckCircle2 className="h-5 w-5 text-gray-500 mt-0.5 shrink-0" />
          <p className="text-xs text-gray-400 leading-relaxed">
            Already configured? Make sure your{" "}
            <code className="font-mono bg-white/10 px-1 py-0.5 rounded">.env.local</code>{" "}
            is in the project root (same folder as{" "}
            <code className="font-mono bg-white/10 px-1 py-0.5 rounded">package.json</code>
            ) and restart the dev server. Next.js only reads{" "}
            <code className="font-mono bg-white/10 px-1 py-0.5 rounded">.env.local</code>{" "}
            at startup.
          </p>
        </div>

        {/* Link to SETUP.md */}
        <p className="text-center text-xs text-gray-500">
          Full database schema, RLS policies, and Supabase Auth setup →{" "}
          <span className="font-mono text-gray-400">SETUP.md</span>
        </p>
      </div>
    </div>
  );
}
