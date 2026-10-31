import { Suspense } from "react";
import type { Metadata } from "next";
import { StudioClient } from "@/components/studio-client";
import { LoadingScreen } from "@/components/ui";
export const metadata: Metadata = {
  title: "The director’s studio",
  robots: { index: false, follow: false },
};
export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  return (
    <Suspense fallback={<LoadingScreen />}>
      <StudioClient showId={show} />
    </Suspense>
  );
}
