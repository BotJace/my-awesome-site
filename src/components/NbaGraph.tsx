'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
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
  const [playerNames, setPlayerNames] = useState<Record<number, string>>({});
  const graphRef = useRef<any>(null);

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

  // Initialize with just the player node (fixed at center, immovable)
  useEffect(() => {
    const playerName = playerNames[playerId] || `Player ${playerId}`;
    const playerNode: GraphNode = {
      id: `player-${playerId}`,
      type: 'player',
      label: playerName,
      playerId,
      playerName,
      fx: 0, // Fix at center initially (force graph centers at 0,0) - immovable
      fy: 0,
    };
    setNodes([playerNode]);
    setLinks([]);
    setLoading(false);
  }, [playerId, playerNames]);

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

        // Link player to team-season (so edges are visible when seasons are shown)
        newLinks.push({
          source: `player-${playerId}` as any,
          target: teamSeasonId as any,
          season: record.SEASON_ID,
          teamAbbr: record.TEAM_ABBREVIATION,
        });
      });

      // Add season nodes and links, preserve starting player's fixed position
      setNodes(prevNodes => {
        const existingIds = new Set(prevNodes.map(n => n.id));
        const nodesToAdd = teamSeasonNodes.filter(n => !existingIds.has(n.id));
        // Preserve starting player's fixed position at (0, 0)
        const preservedNodes = prevNodes.map(n => {
          if (n.id === `player-${playerId}`) {
            return { ...n, fx: 0, fy: 0 };
          }
          return n;
        });
        
        return [...preservedNodes, ...nodesToAdd];
      });

      setLinks(prevLinks => {
        // Helper function to normalize link endpoints (handle both strings and objects)
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
      
      // Add teammate nodes and links
      const newNodes: GraphNode[] = [];
      const newLinks: GraphLink[] = [];
      const teamSeasonId = `team-${teamId}-${season}`;

      // Get current nodes to check for existing ones
      const currentNodes = nodes;
      const existingNodeIds = new Set(currentNodes.map(n => n.id));

      rosterData.forEach((teammate) => {
        const teammateNodeId = `player-${teammate.PLAYER_ID}`;
        const isStartingPlayer = teammate.PLAYER_ID === playerId;
        // Use name from roster data (should always be available)
        const teammateName = teammate.PLAYER;
        
        // Add teammate node if it doesn't exist (including the starting player)
        if (!existingNodeIds.has(teammateNodeId)) {
          newNodes.push({
            id: teammateNodeId,
            type: 'player',
            label: teammateName,
            playerId: teammate.PLAYER_ID,
            playerName: teammateName,
          });
          existingNodeIds.add(teammateNodeId); // Track it so we don't add duplicates
        }

        // Link teammate to team-season (use string IDs for consistency)
        // This includes the starting player, so they connect to the team like other players
        newLinks.push({
          source: teammateNodeId as any,
          target: teamSeasonId as any,
          season,
          teamAbbr: teamAbbr,
        });
      });

      // Add new nodes, preserve starting player's fixed position
      setNodes(prevNodes => {
        const existingIds = new Set(prevNodes.map(n => n.id));
        const nodesToAdd = newNodes.filter(n => !existingIds.has(n.id));
        // Preserve starting player's fixed position at (0, 0)
        const preservedNodes = prevNodes.map(n => {
          if (n.id === `player-${playerId}`) {
            return { ...n, fx: 0, fy: 0 };
          }
          return n;
        });
        
        return [...preservedNodes, ...nodesToAdd];
      });

      // Add new links
      setLinks(prevLinks => {
        // Helper function to normalize link endpoints (handle both strings and objects)
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
  }, [playerId, loadedTeamSeasons, nodes]);

  // Collapse (close) a team node by removing its teammates
  const collapseTeamRoster = useCallback((teamId: number, season: string) => {
    const teamSeasonId = `team-${teamId}-${season}`;
    const teamSeasonKey = `${teamId}-${season}`;

    // Calculate updates using functional updates to access current state
    setLinks(prevLinks => {
      const playerNodeId = `player-${playerId}`;
      // Filter out links from teammates to this team-season node
      // But keep the link from starting player to the team
      const filteredLinks = prevLinks.filter(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        // Remove links where the team is the target AND the source is not the starting player
        if (targetId === teamSeasonId && sourceId !== playerNodeId) {
          return false; // Remove teammate -> team links
        }
        // Keep all other links (including starting player -> team links)
        return true;
      });

      // Update nodes based on the filtered links
      setNodes(prevNodes => {
        const teamNodeIds = new Set(
          prevNodes
            .filter(n => n.type === 'team-season')
            .map(n => n.id)
        );

        return prevNodes.filter(node => {
          // Always keep the starting player and team-season nodes
          if (node.id === `player-${playerId}`) return true;
          if (node.type === 'team-season') return true;

          // For other player nodes, check if they still have links to any team nodes
          const hasLinkToTeam = filteredLinks.some(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            return (sourceId === node.id && teamNodeIds.has(targetId)) ||
                   (targetId === node.id && teamNodeIds.has(sourceId));
          });

          return hasLinkToTeam;
        });
      });

      return filteredLinks;
    });

    // Remove from loaded set so it can be expanded again
    setLoadedTeamSeasons(prev => {
      const next = new Set(prev);
      next.delete(teamSeasonKey);
      return next;
    });
  }, [playerId]);

  const handleNodeClick = useCallback((node: any) => {
    const graphNode = node as GraphNode;
    setSelectedNode(graphNode);
    
    // If clicking the main player node, load their last 3 seasons
    if (graphNode.type === 'player' && graphNode.playerId === playerId && !loadedTeamSeasons.size) {
      loadPlayerSeasons(playerId);
    }
    
    // If clicking a team-season node, toggle expansion/collapse
    if (graphNode.type === 'team-season' && graphNode.teamId && graphNode.season) {
      const teamSeasonKey = `${graphNode.teamId}-${graphNode.season}`;
      
      // If already loaded (expanded), collapse it
      if (loadedTeamSeasons.has(teamSeasonKey)) {
        collapseTeamRoster(graphNode.teamId, graphNode.season);
      } else {
        // Otherwise, expand it
        loadTeamRoster(graphNode.teamId, graphNode.season, graphNode.teamAbbr);
      }
    }
  }, [playerId, loadPlayerSeasons, loadTeamRoster, loadedTeamSeasons, collapseTeamRoster]);

  const nodeColor = useCallback((node: any) => {
    const graphNode = node as GraphNode;
    // High contrast colors
    if (graphNode.type === 'player' && graphNode.playerId === playerId) {
      return '#10b981'; // Green for starting player
    }
    return graphNode.type === 'player' ? '#2563eb' : '#dc2626'; // Blue for players, red for teams
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
        ref={graphRef}
        graphData={{ nodes, links }}
        onNodeClick={handleNodeClick}
        onNodeDrag={(node: any) => {
          const graphNode = node as GraphNode;
          // Keep starting player fixed at (0, 0) - prevent dragging
          if (graphNode.playerId === playerId) {
            node.fx = 0;
            node.fy = 0;
            node.x = 0;
            node.y = 0;
          }
        }}
        nodeColor={nodeColor}
        nodeLabel={nodeLabel}
        linkDirectionalArrowLength={0}
        linkCurvature={0}
        linkColor={(link: any) => {
          // Normalize source/target to handle both objects and strings
          const getNodeId = (node: any) => {
            if (typeof node === 'object' && node !== null && 'id' in node) {
              return node.id;
            }
            return String(node);
          };
          const sourceId = getNodeId(link.source);
          const targetId = getNodeId(link.target);
          const playerNodeId = `player-${playerId}`;
          
          // They Rule style: Clean, subtle lines with emphasis on starting player
          if (sourceId === playerNodeId || targetId === playerNodeId) {
            return '#2d3748'; // Dark gray for starting player connections
          }
          return 'rgba(100, 100, 100, 0.5)'; // Subtle gray for other edges
        }}
        linkWidth={(link: any) => {
          // Normalize source/target to handle both objects and strings
          const getNodeId = (node: any) => {
            if (typeof node === 'object' && node !== null && 'id' in node) {
              return node.id;
            }
            return String(node);
          };
          const sourceId = getNodeId(link.source);
          const targetId = getNodeId(link.target);
          const playerNodeId = `player-${playerId}`;
          
          // They Rule style: Thinner, cleaner lines
          if (sourceId === playerNodeId || targetId === playerNodeId) {
            return 2.5; // Slightly thicker for starting player
          }
          return 1; // Thin, clean lines
        }}
        // Edges automatically follow nodes dynamically (this is how force graphs work)
        // Increase node visual size to give each node more space
        nodeRelSize={8} // Larger nodes = more visual spacing
        onEngineTick={() => {
          // Configure force simulation for increased node spacing
          if (graphRef.current) {
            const graph = graphRef.current as any;
            // Configure link distance with a function to maintain fixed distance for starting player -> team edges
            const linkForce = graph.d3Force?.('link');
            if (linkForce) {
              linkForce.distance((link: any) => {
                // Normalize source/target to handle both objects and strings
                const getNodeId = (node: any) => {
                  if (typeof node === 'object' && node !== null && 'id' in node) {
                    return node.id;
                  }
                  return String(node);
                };
                const sourceId = getNodeId(link.source);
                const targetId = getNodeId(link.target);
                const playerNodeId = `player-${playerId}`;
                
                // Fixed distance for edges from starting player to teams - maintain longer distance even when teammates are added
                if (sourceId === playerNodeId || targetId === playerNodeId) {
                  return 200; // Longer, fixed distance for starting player -> team edges (increased from 150)
                }
                // Different distance for teammate -> team edges
                return 80; // Shorter distance for teammate edges
              });
              // Increase link strength (stiffness) for starting player -> team edges to resist compression
              linkForce.strength((link: any) => {
                const getNodeId = (node: any) => {
                  if (typeof node === 'object' && node !== null && 'id' in node) {
                    return node.id;
                  }
                  return String(node);
                };
                const sourceId = getNodeId(link.source);
                const targetId = getNodeId(link.target);
                const playerNodeId = `player-${playerId}`;
                
                // Stronger link for starting player -> team edges to maintain distance
                if (sourceId === playerNodeId || targetId === playerNodeId) {
                  return 1.5; // Higher strength to resist compression
                }
                return 0.5; // Lower strength for teammate edges
              });
            }
            // Increase charge (repulsion) for more spacing between all nodes
            const chargeForce = graph.d3Force?.('charge');
            if (chargeForce) {
              chargeForce.strength(-500); // Increased repulsion
            }
          }
        }}
        cooldownTicks={100}
        backgroundColor="rgba(249, 250, 251, 0)"
        nodeCanvasObjectMode={() => 'after'}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const graphNode = node as GraphNode;
          const label = nodeLabel(graphNode);
          const fontSize = 12 / globalScale;
          // They Rule style: Clean, simple typography
          ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#2d3748'; // Dark gray text
          ctx.fillText(label, graphNode.x || 0, (graphNode.y || 0) + 4);
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
