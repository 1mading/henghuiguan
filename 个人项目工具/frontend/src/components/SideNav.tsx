import type { PageId } from "../nav";
import { NAV_ITEMS } from "../nav";

export function SideNav({
  page,
  onChange,
}: {
  page: PageId;
  onChange: (id: PageId) => void;
}) {
  return (
    <aside className="glass flex h-full w-[220px] shrink-0 flex-col rounded-none border-y-0 border-l-0 border-r border-[color:var(--glass-border)] px-3 py-4">
      <div className="mb-6 px-2">
        <div className="display text-base font-semibold leading-snug tracking-wide">
          <span className="neon-text">棱镜</span>项目工作台
        </div>
        <p className="mt-1 text-[11px] text-[color:var(--muted)]">Prism · 本地多项目管理</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = page === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                active
                  ? "bg-[color:var(--neon-dim)] text-[color:var(--neon)] shadow-[0_0_20px_rgba(61,220,106,0.16)]"
                  : "text-[color:var(--muted)] hover:bg-white/5 hover:text-[color:var(--text)]"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-3 rounded-2xl border border-[color:var(--glass-border)] bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--neon-dim)] text-xs text-[color:var(--neon)]">
            WY
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm">本地用户</div>
            <div className="truncate text-[11px] text-[color:var(--muted)]">Private Workspace</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
