export function PlaceholderPage({ title, desc }: { title: string; desc: string }) {
  return (
    <section className="glass rounded-[28px] p-8">
      <p className="text-xs tracking-[0.22em] text-[color:var(--muted)]">COMING SOON</p>
      <h1 className="display mt-2 text-3xl font-semibold">{title}</h1>
      <p className="mt-3 max-w-xl text-sm text-[color:var(--muted)]">{desc}</p>
    </section>
  );
}
