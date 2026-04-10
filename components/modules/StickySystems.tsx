import { cn } from "@/lib/utils";

const systems = [
  { id: "attract", title: "Attract", description: "Monitor ads, flag underperformers, and maximize lead volume." },
  { id: "capture", title: "Capture & Convert", description: "AI-driven intake, lead logging, and intelligent routing." },
  { id: "operate", title: "Operate & Retain", description: "Automated invoicing, payment sync, and workflow management." }
];

export function StickySystems() {
  return (
    <section className="relative py-32 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-32">
        {/* Sticky Sidebar */}
        <div className="relative">
          <div className="sticky top-32 space-y-8">
            <h2 className="text-5xl font-bold tracking-tighter text-white">Proven Workflow<br /><span className="text-ember-gold">Systems</span></h2>
            <p className="text-obsidian-muted">Deployable infrastructure, not custom builds.</p>
          </div>
        </div>

        {/* Scrolling Modules */}
        <div className="space-y-48">
          {systems.map((system) => (
            <div key={system.id} className="min-h-[50vh] flex flex-col justify-center border-l border-obsidian-700 pl-8 hover:border-ember-gold transition-colors duration-500">
              <h3 className="text-3xl font-bold text-white mb-6">{system.title}</h3>
              <p className="text-lg text-obsidian-muted leading-relaxed">{system.description}</p>
              <div className="mt-8 h-48 bg-obsidian-800 rounded-lg border border-obsidian-700 flex items-center justify-center text-ember-gold/20 font-mono text-xs">
                [ARCHITECTURE DIAGRAM: {system.id.toUpperCase()}]
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
