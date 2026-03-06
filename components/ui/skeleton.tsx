import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-white/5',
        className
      )}
      {...props}
    />
  );
}

export function TableCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-card p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-8 w-full rounded-lg" />
    </div>
  );
}

export function LobbySkeletons() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <TableCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Skeleton for the profile stats page */
export function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton for a player seat */
export function PlayerSeatSkeleton() {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-1">
        <Skeleton className="w-8 h-11 rounded-md" />
        <Skeleton className="w-8 h-11 rounded-md" />
      </div>
      <div className="rounded-xl bg-black/30 border border-white/5 p-2 flex flex-col items-center gap-1">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-2.5 w-16 mt-1" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}

export { Skeleton };
