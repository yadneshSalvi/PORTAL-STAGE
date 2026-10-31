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
    "A traveling theater for two creators and one curious community. Pass a persistent virtual umbrella between rooms, borrow a little weather, and let your audience help write the scene.",
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
