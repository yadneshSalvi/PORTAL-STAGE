import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/400-italic.css";
import "@fontsource/fraunces/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PORTAL STAGE — Different rooms. One impossible stage.",
    template: "%s · PORTAL STAGE",
  },
  description:
    "A live theater for a creator, a partner or illustrated Audience Room, and a curious community. Pass a persistent prop between rooms and let Twitch choices shape two original stories.",
  applicationName: "PORTAL STAGE",
  robots: { index: true, follow: true },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
