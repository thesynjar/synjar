import { Link } from 'react-router-dom';

export function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <nav className="flex items-center justify-between p-6">
        <div className="text-2xl font-bold">Synjar</div>
        <div className="flex gap-4">
          <Link
            to="/login"
            className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
          >
            Log in
          </Link>
          <Link
            to="/login"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>

      <main className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-5xl font-bold mb-6">
          Memory for AI
        </h1>
        <p className="text-xl text-slate-300 max-w-2xl mb-12">
          Self-hosted RAG backend. Build knowledge bases for AI with full data
          control. Connect your documents, get intelligent answers.
        </p>
        <div className="flex gap-4">
          <Link
            to="/login"
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-lg font-semibold transition-colors"
          >
            Start Free
          </Link>
          <a
            href="https://docs.synjar.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-4 border border-slate-600 hover:border-slate-500 rounded-lg text-lg font-semibold transition-colors"
          >
            Documentation
          </a>
        </div>
      </main>

      <section className="px-6 py-24">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
          <FeatureCard
            title="Self-Hosted"
            description="Full control over your data. Deploy on your infrastructure."
          />
          <FeatureCard
            title="RAG Backend"
            description="Retrieval-Augmented Generation for accurate, contextual AI responses."
          />
          <FeatureCard
            title="Easy Integration"
            description="REST API and SDKs for seamless integration with your apps."
          />
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700">
      <h3 className="text-xl font-semibold mb-3">{title}</h3>
      <p className="text-slate-400">{description}</p>
    </div>
  );
}
