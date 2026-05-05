import type { ReactNode } from "react";

export function SearchShell(props: { title: string; children: ReactNode }) {
  return (
    <section style={{ fontFamily: "system-ui" }}>
      <h2>{props.title}</h2>
      {props.children}
    </section>
  );
}
