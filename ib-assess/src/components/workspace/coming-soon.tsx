import { Construction } from "lucide-react";

export function ComingSoon({ title, step, points }: { title: string; step: number; points: string[] }) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="mt-6 rounded-lg border border-dashed p-6">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Construction className="h-4 w-4 text-amber-500" /> Planned for build step {step}
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
