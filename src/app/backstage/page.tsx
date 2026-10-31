import type { Metadata } from "next";
import { BackstageClient } from "@/components/backstage-client";
export const metadata: Metadata = {
  title: "Your private backstage",
  robots: { index: false, follow: false },
};
export default async function BackstagePage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; invite?: string }>;
}) {
  const { show, invite } = await searchParams;
  return <BackstageClient showId={show} invitation={invite} />;
}
