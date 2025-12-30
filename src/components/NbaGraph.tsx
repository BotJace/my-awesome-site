'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { GraphNode, GraphLink, PlayerCareerRecord, TeamRosterRecord } from '@/types/nba';

// Dynamically import ForceGraph2D with SSR disabled (it uses window object)
const ForceGraph2D = dynamic(
  () => import('react-force-graph-2d'),
  { ssr: false }
);

// ===== EASILY CHANGEABLE PLAYER ID =====
const PLAYER_ID = 2544; // LeBron James - Change this to visualize a different player
// =======================================

interface NbaGraphProps {
  initialPlayerId?: number;
}

export default function NbaGraph({ initialPlayerId }: NbaGraphProps) {
  // Use prop if provided, otherwise use the constant
  const playerId = initialPlayerId || PLAYER_ID;
  
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loadedTeamSeasons, setLoadedTeamSeasons] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [playerName, setPlayerName] = useState<string>('');

  // Initialize with just the player node
  useEffect(() => {
    const playerNode: GraphNode = {
      id: `player-${playerId}`,
      type: 'player',
      label: `Player ${playerId}`,
      playerId,
    };
    setNodes([playerNode]);
    setLinks([]);
    setLoading(false);
  }, [playerId]);

  // Load player's last 3 seasons when player node is clicked
  const loadPlayerSeasons = useCallback(async (playerId: number) => {
    try {
      const response = await fetch(`/data/players/${playerId}.json`);
      if (!response.ok) throw new Error(`Failed to load player ${playerId}`);
      
      const careerData: PlayerCareerRecord[] = await response.json();
      
      // Get unique seasons, sorted by most recent, take last 3
      const uniqueSeasons = Array.from(
        new Map(
          careerData.map(record => [
            `${record.TEAM_ID}-${record.SEASON_ID}`,
            record
          ])
        ).values()
      )
        .sort((a, b) => b.SEASON_ID.localeCompare(a.SEASON_ID))
        .slice(0, 3); // Last 3 seasons only

      // Create team-season nodes
      const teamSeasonNodes: GraphNode[] = [];
      const newLinks: GraphLink[] = [];

      uniqueSeasons.forEach((record) => {
        const teamSeasonId = `team-${record.TEAM_ID}-${record.SEASON_ID}`;
        
        teamSeasonNodes.push({
          id: teamSeasonId,
          type: 'team-season',
          label: `${record.TEAM_ABBREVIATION} ${record.SEASON_ID}`,
          teamId: record.TEAM_ID,
          teamAbbr: record.TEAM_ABBREVIATION,
          season: record.SEASON_ID,
        });

        // Link player to team-season
        newLinks.push({
          source: `player-${playerId}`,
          target: teamSeasonId,
          season: record.SEASON_ID,
          teamAbbr: record.TEAM_ABBREVIATION,
        });
      });

      // Add season nodes and links
      setNodes(prevNodes => {
        const existingIds = new Set(prevNodes.map(n => n.id));
        const nodesToAdd = teamSeasonNodes.filter(n => !existingIds.has(n.id));
        return [...prevNodes, ...nodesToAdd];
      });

      setLinks(prevLinks => {
        const existingLinkKeys = new Set(
          prevLinks.map(l => `${String(l.source)}-${String(l.target)}`)
        );
        const uniqueNewLinks = newLinks.filter(
          l => !existingLinkKeys.has(`${String(l.source)}-${String(l.target)}`)
        );
        return [...prevLinks, ...uniqueNewLinks];
      });
    } catch (error) {
      console.error('Error loading player seasons:', error);
    }
  }, [playerId]);

  // Load team roster when season node is clicked
  const loadTeamRoster = useCallback(async (teamId: number, season: string, teamAbbr?: string) => {
    const teamSeasonKey = `${teamId}-${season}`;
    
    // Skip if already loaded
    if (loadedTeamSeasons.has(teamSeasonKey)) {
      return;
    }

    try {
      const response = await fetch(`/data/teams/${teamId}_${season}.json`);
      if (!response.ok) throw new Error(`Failed to load team ${teamId} for ${season}`);
      
      const rosterData: TeamRosterRecord[] = await response.json();
      
      // Get player name from roster if we don't have it yet
      if (!playerName && rosterData.length > 0) {
        const mainPlayer = rosterData.find(p => p.PLAYER_ID === playerId);
        if (mainPlayer) {
          setPlayerName(mainPlayer.PLAYER);
          // Update player node label
          setNodes(prevNodes => 
            prevNodes.map(n => 
              n.id === `player-${playerId}` 
                ? { ...n, label: mainPlayer.PLAYER, playerName: mainPlayer.PLAYER }
                : n
            )
          );
        }
      }
      
      // Add teammate nodes and links
      const newNodes: GraphNode[] = [];
      const newLinks: GraphLink[] = [];
      const teamSeasonId = `team-${teamId}-${season}`;

      // Get current nodes to check for existing ones
      const currentNodes = nodes;
      const existingNodeIds = new Set(currentNodes.map(n => n.id));

      rosterData.forEach((teammate) => {
        const teammateNodeId = `player-${teammate.PLAYER_ID}`;
        
        // Skip the main player (they're already in the graph)
        if (teammate.PLAYER_ID === playerId) {
          return;
        }
        
        // Add teammate node if it doesn't exist
        if (!existingNodeIds.has(teammateNodeId)) {
          newNodes.push({
            id: teammateNodeId,
            type: 'player',
            label: teammate.PLAYER,
            playerId: teammate.PLAYER_ID,
            playerName: teammate.PLAYER,
          });
          existingNodeIds.add(teammateNodeId); // Track it so we don't add duplicates
        }

        // Link teammate to team-season
        newLinks.push({
          source: teammateNodeId,
          target: teamSeasonId,
          season,
          teamAbbr: teamAbbr,
        });
      });

      // Add new nodes
      setNodes(prevNodes => {
        const existingIds = new Set(prevNodes.map(n => n.id));
        const nodesToAdd = newNodes.filter(n => !existingIds.has(n.id));
        return [...prevNodes, ...nodesToAdd];
      });

      // Add new links
      setLinks(prevLinks => {
        const existingLinkKeys = new Set(
          prevLinks.map(l => `${String(l.source)}-${String(l.target)}`)
        );
        const uniqueNewLinks = newLinks.filter(
          l => !existingLinkKeys.has(`${String(l.source)}-${String(l.target)}`)
        );
        return [...prevLinks, ...uniqueNewLinks];
      });

      // Mark as loaded
      setLoadedTeamSeasons(prev => new Set([...prev, teamSeasonKey]));
    } catch (error) {
      console.error(`Error loading team roster for ${teamId} ${season}:`, error);
    }
  }, [playerId, playerName, loadedTeamSeasons, nodes]);

  const handleNodeClick = useCallback((node: any) => {
    const graphNode = node as GraphNode;
    setSelectedNode(graphNode);
    
    // If clicking the main player node, load their last 3 seasons
    if (graphNode.type === 'player' && graphNode.playerId === playerId && !loadedTeamSeasons.size) {
      loadPlayerSeasons(playerId);
    }
    
    // If clicking a team-season node, load its roster
    if (graphNode.type === 'team-season' && graphNode.teamId && graphNode.season) {
      loadTeamRoster(graphNode.teamId, graphNode.season, graphNode.teamAbbr);
    }
  }, [playerId, loadPlayerSeasons, loadTeamRoster, loadedTeamSeasons]);

  const nodeColor = useCallback((node: any) => {
    const graphNode = node as GraphNode;
    if (graphNode.type === 'player' && graphNode.playerId === playerId) {
      return '#10b981'; // Green for main player
    }
    return graphNode.type === 'player' ? '#2563eb' : '#dc2626'; // Bright blue for players, bright red for seasons
  }, [playerId]);

  const nodeLabel = useCallback((node: any) => {
    const graphNode = node as GraphNode;
    return graphNode.label || graphNode.id;
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen relative bg-white">
      <ForceGraph2D
        graphData={{ nodes, links }}
        onNodeClick={handleNodeClick}
        nodeColor={nodeColor}
        nodeLabel={nodeLabel}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.15}
        linkColor={() => 'rgba(100, 100, 100, 0.6)'}
        backgroundColor="rgba(249, 250, 251, 0)"
        nodeCanvasObjectMode={() => 'after'}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const graphNode = node as GraphNode;
          const label = nodeLabel(graphNode);
          const fontSize = 14 / globalScale;
          ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Add text shadow for better visibility
          ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
          ctx.shadowBlur = 4;
          ctx.fillStyle = '#1f2937'; // Dark gray for better contrast
          ctx.fillText(label, graphNode.x || 0, (graphNode.y || 0) + 5);
          
          // Reset shadow
          ctx.shadowBlur = 0;
        }}
      />
      
      {selectedNode && (
        <div className="absolute top-4 right-4 bg-gray-200 border-2 border-gray-300 p-4 rounded-lg shadow-xl max-w-sm z-10">
          <h3 className="font-semibold text-lg mb-2 text-black">{selectedNode.label}</h3>
          {selectedNode.type === 'player' && (
            <div className="text-sm text-black">
              <p className="font-medium">Player ID: <span className="font-normal">{selectedNode.playerId}</span></p>
              {selectedNode.playerId === playerId && (
                <p className="mt-2 text-xs text-blue-600 font-medium">Click to see last 3 seasons</p>
              )}
            </div>
          )}
          {selectedNode.type === 'team-season' && (
            <div className="text-sm text-black">
              <p className="font-medium">Team: <span className="font-normal">{selectedNode.teamAbbr}</span></p>
              <p className="font-medium">Season: <span className="font-normal">{selectedNode.season}</span></p>
              <p className="mt-2 text-xs text-blue-600 font-medium">Click to see teammates</p>
            </div>
          )}
          <button
            onClick={() => setSelectedNode(null)}
            className="mt-3 px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
