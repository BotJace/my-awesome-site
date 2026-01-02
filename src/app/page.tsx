'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import NbaGraph from "@/components/NbaGraph";

interface PlayerOption {
  id: number;
  name: string;
}

export default function Home() {
  const [playerId, setPlayerId] = useState<number>(2544); // LeBron James default
  const [playerNames, setPlayerNames] = useState<Record<number, string>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showResults, setShowResults] = useState<boolean>(false);
  const [pathMode, setPathMode] = useState<boolean>(false); // Toggle between normal and path mode
  const searchRef = useRef<HTMLDivElement>(null);

  // Load player names mapping
  useEffect(() => {
    const loadPlayerNames = async () => {
      try {
        const response = await fetch('/data/player_names.json');
        if (response.ok) {
          const names = await response.json();
          setPlayerNames(names);
        }
      } catch (error) {
        console.error('Error loading player names:', error);
      }
    };
    loadPlayerNames();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Filter players based on search query
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase();
    const results: PlayerOption[] = [];
    
    for (const [idStr, name] of Object.entries(playerNames)) {
      if (name.toLowerCase().includes(query)) {
        results.push({ id: parseInt(idStr), name });
        if (results.length >= 10) break; // Limit to 10 results
      }
    }
    
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }, [searchQuery, playerNames]);

  const handlePlayerSelect = (playerId: number) => {
    setPlayerId(playerId);
    setSearchQuery('');
    setShowResults(false);
  };

  const currentPlayerName = playerNames[playerId] || `Player ${playerId}`;

  return (
    <div className="w-full h-screen">
      <div className="absolute top-4 left-4 z-10 bg-gray-200 border-2 border-gray-300 p-4 rounded-lg shadow-xl max-w-sm">
        <h1 className="text-2xl font-semibold text-black mb-1">
          All roads lead to LeBron
        </h1>
        <p className="text-sm text-black">
          Teammate network viz incoming
        </p>
        <p className="text-xs text-black mt-2 font-medium">
          Click a player to see their teams. Click a team to see teammates.
        </p>
        
        {/* Player Search */}
        <div ref={searchRef} className="mt-3 relative">
          <label className="block text-xs font-medium text-black mb-1">
            Search Player:
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            placeholder={`Current: ${currentPlayerName}`}
            className="w-full px-3 py-2 text-sm border border-gray-400 rounded bg-white text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          
          {/* Search Results Dropdown */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-400 rounded shadow-lg max-h-60 overflow-y-auto">
              {searchResults.map((player) => (
                <button
                  key={player.id}
                  onClick={() => handlePlayerSelect(player.id)}
                  className="w-full text-left px-3 py-2 text-sm text-black hover:bg-blue-100 transition-colors"
                >
                  {player.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mode Toggle */}
        <div className="mt-3">
          <button
            onClick={() => setPathMode(!pathMode)}
            className={`w-full px-3 py-2 text-xs font-medium rounded transition-colors ${
              pathMode
                ? 'bg-orange-600 text-white'
                : 'bg-gray-300 text-black hover:bg-gray-400'
            }`}
          >
            {pathMode ? 'Path Mode (ON)' : 'Path Mode (OFF)'}
          </button>
        </div>
      </div>
      <NbaGraph initialPlayerId={playerId} pathMode={pathMode} />
    </div>
  );
}
