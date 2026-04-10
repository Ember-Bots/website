'use client';
import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";

export function Hero() {
  const containerRef = useRef(null);

  useEffect(() => {
    // Basic Hero reveal animation
    const ctx = gsap.context(() => {
      gsap.from(".hero-text", {
        y: 100,
        opacity: 0,
        duration: 1.2,
        ease: "power4.out",
        stagger: 0.2
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={containerRef} className="relative h-[80vh] flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-ember-gold/10 via-obsidian-900 to-obsidian-900" />
      <h1 className="hero-text text-8xl font-bold tracking-tighter text-white z-10">
        INTELLIGENT <br />
        <span className="text-ember-gold">WORKFLOW SYSTEMS</span>
      </h1>
      <p className="hero-text mt-6 text-xl text-obsidian-muted max-w-2xl text-center z-10">
        Enterprise-grade automation designed for the operational drag of small business.
      </p>
    </section>
  );
}
