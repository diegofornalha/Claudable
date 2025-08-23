export default function TerminalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-screen w-screen bg-black overflow-hidden">
      {children}
    </div>
  )
}