'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import cytoscape, { Core, NodeSingular, EdgeSingular } from 'cytoscape';
import type { GraphNode, GraphLink, PlayerCareerRecord, TeamRosterRecord } from '@/types/nba';

// ===== EASILY CHANGEABLE PLAYER ID =====
const PLAYER_ID = 2544; // LeBron James - Change this to visualize a different player
// =======================================

interface NbaGraphCytoscapeProps {
  initialPlayerId?: number;
}

export default function NbaGraphCytoscape({ initialPlayerId }: NbaGraphCytoscapeProps) {
  // Use prop if provided, otherwise use the constant
  const playerId = initialPlayerId || PLAYER_ID;
  
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loadedTeamSeasons, setLoadedTeamSeasons] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [playerName, setPlayerName] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

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
          source: `player-${playerId}` as any,
          target: teamSeasonId as any,
          season: record.SEASON_ID,
          teamAbbr: record.TEAM_ABBREVIATION,
        });
      });

      // Add season nodes and links, preserve starting player
      setNodes(prevNodes => {
        const existingIds = new Set(prevNodes.map(n => n.id));
        const nodesToAdd = teamSeasonNodes.filter(n => !existingIds.has(n.id));
        return [...prevNodes, ...nodesToAdd];
      });

      setLinks(prevLinks => {
        const getLinkKey = (link: GraphLink) => {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;
          return `${sourceId}-${targetId}`;
        };
        
        const existingLinkKeys = new Set(prevLinks.map(getLinkKey));
        const uniqueNewLinks = newLinks.filter(
          l => !existingLinkKeys.has(getLinkKey(l))
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

      const currentNodes = nodes;
      const existingNodeIds = new Set(currentNodes.map(n => n.id));

      rosterData.forEach((teammate) => {
        const teammateNodeId = `player-${teammate.PLAYER_ID}`;
        
        // Add teammate node if it doesn't exist (including the starting player)
        if (!existingNodeIds.has(teammateNodeId)) {
          newNodes.push({
            id: teammateNodeId,
            type: 'player',
            label: teammate.PLAYER,
            playerId: teammate.PLAYER_ID,
            playerName: teammate.PLAYER,
          });
          existingNodeIds.add(teammateNodeId);
        }

        // Link teammate to team-season
        newLinks.push({
          source: teammateNodeId as any,
          target: teamSeasonId as any,
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
        const getLinkKey = (link: GraphLink) => {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;
          return `${sourceId}-${targetId}`;
        };
        
        const existingLinkKeys = new Set(prevLinks.map(getLinkKey));
        const uniqueNewLinks = newLinks.filter(
          l => !existingLinkKeys.has(getLinkKey(l))
        );
        return [...prevLinks, ...uniqueNewLinks];
      });

      // Mark as loaded
      setLoadedTeamSeasons(prev => new Set([...prev, teamSeasonKey]));
    } catch (error) {
      console.error(`Error loading team roster for ${teamId} ${season}:`, error);
    }
  }, [playerId, playerName, loadedTeamSeasons, nodes]);

  // Initialize Cytoscape instance
  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;

    cyRef.current = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-outline-width': 2,
            'text-outline-color': '#ffffff',
            'color': '#1f2937',
            'font-size': '12px',
            'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            'width': 'data(size)',
            'height': 'data(size)',
            'shape': 'ellipse',
          }
        },
        {
          selector: 'node[type = "player"][isStartingPlayer = true]',
          style: {
            'background-color': '#10b981', // Green for starting player
            'width': 20,
            'height': 20,
          }
        },
        {
          selector: 'node[type = "player"][isStartingPlayer != true]',
          style: {
            'background-color': '#2563eb', // Blue for other players
            'width': 15,
            'height': 15,
          }
        },
        {
          selector: 'node[type = "team-season"]',
          style: {
            'background-color': '#dc2626', // Red for teams
            'width': 15,
            'height': 15,
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1,
            'line-color': 'rgba(100, 100, 100, 0.5)',
            'target-arrow-color': 'transparent',
            'curve-style': 'straight',
          }
        },
        {
          selector: 'edge[isStartingPlayerEdge = true]',
          style: {
            'line-color': '#2d3748',
            'width': 2.5,
          }
        }
      ],
      layout: {
        name: 'cose',
        idealEdgeLength: 150,
        nodeRepulsion: 5000,
        gravity: 0.1,
        componentSpacing: 100,
      },
      userPanningEnabled: true,
      userZoomingEnabled: true,
    });

    // Handle node clicks
    cyRef.current.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeData = node.data();
      
      const graphNode: GraphNode = {
        id: nodeData.id,
        type: nodeData.type,
        label: nodeData.label,
        playerId: nodeData.playerId,
        playerName: nodeData.playerName,
        teamId: nodeData.teamId,
        teamAbbr: nodeData.teamAbbr,
        season: nodeData.season,
      };
      
      setSelectedNode(graphNode);
      
      // If clicking the main player node, load their last 3 seasons
      if (graphNode.type === 'player' && graphNode.playerId === playerId && !loadedTeamSeasons.size) {
        loadPlayerSeasons(playerId);
      }
      
      // If clicking a team-season node, load its roster
      if (graphNode.type === 'team-season' && graphNode.teamId && graphNode.season) {
        loadTeamRoster(graphNode.teamId, graphNode.season, graphNode.teamAbbr);
      }
    });

    // Fix starting player position
    cyRef.current.on('drag', 'node', (evt) => {
      const node = evt.target;
      if (node.data('isStartingPlayer')) {
        node.position({ x: 0, y: 0 });
      }
    });

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [playerId, loadPlayerSeasons, loadTeamRoster, loadedTeamSeasons]);

  // Update Cytoscape graph when nodes or links change
  useEffect(() => {
    if (!cyRef.current) return;

    // Convert nodes to Cytoscape format
    const cyNodes = nodes.map(node => ({
      data: {
        id: node.id,
        label: node.label,
        type: node.type,
        playerId: node.playerId,
        playerName: node.playerName,
        teamId: node.teamId,
        teamAbbr: node.teamAbbr,
        season: node.season,
        isStartingPlayer: node.playerId === playerId,
        size: node.playerId === playerId ? 20 : 15,
      },
      position: node.playerId === playerId ? { x: 0, y: 0 } : undefined,
      locked: node.playerId === playerId, // Lock starting player
    }));

    // Convert links to Cytoscape format
    const cyEdges = links.map(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      const isStartingPlayerEdge = sourceId === `player-${playerId}` || targetId === `player-${playerId}`;
      
      return {
        data: {
          id: `${sourceId}-${targetId}`,
          source: sourceId,
          target: targetId,
          season: link.season,
          teamAbbr: link.teamAbbr,
          isStartingPlayerEdge,
        }
      };
    });

    // Update graph
    cyRef.current.json({ elements: { nodes: cyNodes, edges: cyEdges } });
    
    // Run layout
    cyRef.current.layout({
      name: 'cose',
      idealEdgeLength: 150,
      nodeRepulsion: 5000,
      gravity: 0.1,
      componentSpacing: 100,
    }).run();
  }, [nodes, links, playerId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen relative bg-white">
      <div ref={containerRef} className="w-full h-full" />
      
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

