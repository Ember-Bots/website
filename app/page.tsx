import { Hero } from "@/components/modules/Hero";
import { TrustBand } from "@/components/modules/TrustBand";
import { StickySystems } from "@/components/modules/StickySystems";
import { OurStory } from "@/components/modules/OurStory";
import { Footer } from "@/components/modules/Footer";

export default function Home() {
  return (
    <main>
      <Hero />
      <TrustBand />
      <StickySystems />
      <OurStory />
      <Footer />
    </main>
  );
}
