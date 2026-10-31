import type { Metadata } from "next";
import { ProgramClient } from "@/components/program-client";
export const metadata: Metadata = {
  title: "Program",
  robots: { index: false, follow: false },
};
export default async function ProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; transport?: string }>;
}) {
  const { show, transport } = await searchParams;
  return <ProgramClient showId={show} transportTest={transport === "1"} />;
}
