// Placeholder home page. The dashboard (uploader, player, skill tabs,
// pose overlay and pro comparison) is built in Phase 3.
export default function Home() {
  return (
    <main className="container py-16">
      <h1 className="text-3xl font-semibold tracking-tight">TT Analyzer</h1>
      <p className="mt-2 text-muted-foreground">
        Upload a match to cut out dead time, tag every stroke and compare your technique with the pros.
      </p>
    </main>
  );
}
