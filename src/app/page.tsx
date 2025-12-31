'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import NbaGraph from "@/components/NbaGraph";
import NbaGraphCytoscape from "@/components/NbaGraphCytoscape";

// Dynamically import Sigma component with SSR disabled (it uses WebGL)
const NbaGraphSigma = dynamic(
  () => import("@/components/NbaGraphSigma"),
  { ssr: false }
);

export default function Home() {
  const [graphType, setGraphType] = useState<'force' | 'cytoscape' | 'sigma'>('force');

  return (
    <div className="w-full h-screen">
      <div className="absolute top-4 left-4 z-10 bg-gray-200 border-2 border-gray-300 p-4 rounded-lg shadow-xl">
        <h1 className="text-2xl font-semibold text-black mb-1">
          This is Jason's cool idea
        </h1>
        <p className="text-sm text-black">
          Teammate network viz incoming
        </p>
        <p className="text-xs text-black mt-2 font-medium">
          Click a player to see their teams. Click a team to see teammates.
        </p>
        <div className="mt-3 flex gap-2 flex-wrap">
          <button
            onClick={() => setGraphType('force')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              graphType === 'force'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-300 text-black hover:bg-gray-400'
            }`}
          >
            Force Graph
          </button>
          <button
            onClick={() => setGraphType('cytoscape')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              graphType === 'cytoscape'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-300 text-black hover:bg-gray-400'
            }`}
          >
            Cytoscape
          </button>
          <button
            onClick={() => setGraphType('sigma')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              graphType === 'sigma'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-300 text-black hover:bg-gray-400'
            }`}
          >
            Sigma
          </button>
        </div>
      </div>
      {graphType === 'force' && <NbaGraph initialPlayerId={2544} />}
      {graphType === 'cytoscape' && <NbaGraphCytoscape initialPlayerId={2544} />}
      {graphType === 'sigma' && <NbaGraphSigma initialPlayerId={2544} />}
    </div>
  );
}
