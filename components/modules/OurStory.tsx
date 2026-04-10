export function OurStory() {
  return (
    <section className="py-32 px-6 border-t border-obsidian-700">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-4xl font-bold tracking-tighter text-white mb-12">
          Built by <span className="text-ember-gold">Operators</span>
        </h2>
        <div className="grid md:grid-cols-2 gap-12">
          <div className="space-y-4">
            <h3 className="text-2xl font-bold text-white">Amber Rice</h3>
            <p className="text-obsidian-muted">CEO & Co-Founder</p>
            <p className="text-sm leading-relaxed text-obsidian-muted">
              Amber spent years watching service businesses bleed time to manual follow-ups and data entry. Ember Bots was built to close the gap between enterprise-level automation and the small business owner.
            </p>
          </div>
          <div className="space-y-4">
            <h3 className="text-2xl font-bold text-white">Steve Ward</h3>
            <p className="text-obsidian-muted">CRO & Co-Founder</p>
            <p className="text-sm leading-relaxed text-obsidian-muted">
              With a background in revenue growth, Steve realized that most operational drag isn't a strategy problem—it's an infrastructure problem. He designs the systems that help you scale.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
