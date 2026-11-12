import { PHASES } from "@iyw/core";

/** The five phases as road-stud bars: done in ink, the current one in green, the rest waiting. */
export function Rail({ at, complete = false }: { at: number; complete?: boolean }) {
  return (
    <ol class="rail" aria-label="Interview progress">
      {PHASES.map((p, i) => {
        const state = complete || i < at ? "done" : i === at ? "on" : "";
        return (
          <li key={p.id} class={state} aria-current={state === "on" ? "step" : undefined}>
            <span class="bar">
              <i />
            </span>
            <span class="num">{String(i + 1).padStart(2, "0")}</span>
            <span class="name">{p.title}</span>
          </li>
        );
      })}
    </ol>
  );
}
