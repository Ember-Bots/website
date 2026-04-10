import { cn } from "@/lib/utils";

export function Footer() {
  return (
    <footer className="py-16 border-t border-obsidian-700 bg-obsidian-900">
      <div className="max-w-7xl mx-auto px-6 text-center">
        <h2 className="text-4xl font-bold tracking-tighter text-white mb-8">
          Ready to remove the <span className="text-ember-gold">operational drag?</span>
        </h2>
        <a href="#contact" className="inline-block px-8 py-4 bg-ember-gold text-obsidian-900 font-bold hover:bg-ember-hover transition-all">
          BOOK A WORKFLOW AUDIT
        </a>
        <p className="mt-12 text-obsidian-muted text-sm">
          © 2026 Ember Bots. All systems engineered in Dallas, TX.
        </p>
      </div>
    </footer>
  );
}
