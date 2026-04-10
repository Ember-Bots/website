import { cn } from "@/lib/utils";

interface TrustBandProps {
  className?: string;
}

export function TrustBand({ className }: TrustBandProps) {
  const partners = [
    { name: "Salesforce", logo: "Salesforce" },
    { name: "AWS", logo: "AWS" },
    { name: "QuickBooks", logo: "QuickBooks" },
    { name: "Stripe", logo: "Stripe" },
    { name: "Google Ads", logo: "Google" },
  ];

  return (
    <section className={cn("w-full py-12 border-y border-obsidian-700 bg-obsidian-800", className)}>
      <div className="max-w-7xl mx-auto px-6">
        <p className="text-center text-obsidian-muted text-sm font-medium tracking-widest uppercase mb-8">
          Trusted Systems Infrastructure
        </p>
        <div className="flex flex-wrap justify-center items-center gap-12 opacity-60">
          {partners.map((p) => (
            <span key={p.name} className="text-xl font-bold text-white hover:text-ember-gold transition-colors">
              {p.logo}
            </span>
          ))}
        </div>
        <div className="mt-8 flex justify-center gap-6">
          <span className="px-3 py-1 border border-ember-gold/30 text-ember-gold text-xs rounded-full">
            SOC2 COMPLIANT
          </span>
          <span className="px-3 py-1 border border-ember-gold/30 text-ember-gold text-xs rounded-full">
            10M+ TASKS AUTOMATED
          </span>
        </div>
      </div>
    </section>
  );
}
