import "./globals.css";
import Shell from "@/components/Shell";
export const metadata = { title: "CrowdSpark Growth Center", description: "Festival attendee growth dashboard, campaign manager and AI copilot." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Shell>{children}</Shell></body></html>;
}
