import { Skeleton } from '@/components/ui/skeleton';

/** docs/05-design-system.md §3.3 — skeletons, because the layout is known. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-5 px-4 pt-6 lg:px-8">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-5 w-24" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
    </div>
  );
}
