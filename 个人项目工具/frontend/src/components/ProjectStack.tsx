import { motion } from "framer-motion";
import type { Project } from "../lib/types";

export function ProjectStack({
  projects,
  activeId,
  onSelect,
}: {
  projects: Project[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const list = projects.slice(0, 6);
  const activeIndex = Math.max(
    0,
    list.findIndex((p) => p.id === activeId),
  );

  return (
    <div className="relative isolate h-[220px] w-full overflow-hidden rounded-2xl">
      <div className="relative h-full w-full" style={{ perspective: "1200px" }}>
        {list.map((project, index) => {
          const active = project.id === activeId;
          const offset = index - activeIndex;
          const abs = Math.abs(offset);

          return (
            <motion.button
              key={project.id}
              type="button"
              onClick={() => onSelect(project.id)}
              className={`absolute left-1/2 top-1/2 w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-3xl px-4 py-4 text-left ${
                active ? "neon-btn border-transparent" : "glass"
              }`}
              style={{ zIndex: active ? 5 : Math.max(1, 4 - abs) }}
              animate={{
                x: offset * 64,
                y: abs * 3,
                rotateY: offset * -12,
                scale: active ? 1.04 : Math.max(0.82, 0.95 - abs * 0.05),
                opacity: abs > 2 ? 0 : active ? 1 : Math.max(0.5, 0.92 - abs * 0.16),
              }}
              transition={{ type: "spring", stiffness: 280, damping: 28 }}
            >
              <div className="mb-2 flex items-center justify-between text-[10px] opacity-80">
                <span>项目文档</span>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: active ? "#ffffff" : project.color }}
                />
              </div>
              <div className="display text-base font-semibold leading-snug">
                {project.name}
              </div>
              <div
                className={`mt-4 text-3xl font-semibold ${
                  active ? "text-white" : "text-[color:var(--neon)]"
                }`}
              >
                {Math.round(project.progress)}%
              </div>
              <div
                className={`mt-1 text-[11px] ${
                  active ? "text-white/85" : "text-[color:var(--muted)]"
                }`}
              >
                完成度
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
