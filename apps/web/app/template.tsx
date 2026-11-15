// Re-mounts on every navigation, so each page fades in (P4 shell).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
