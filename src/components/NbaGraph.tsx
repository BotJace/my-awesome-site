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
  pathMode?: boolean;
}

export default function NbaGraph({ initialPlayerId, pathMode = false }: NbaGraphProps) {
  // Use prop if provided, otherwise use the constant
  const playerId = initialPlayerId || PLAYER_ID;
  
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loadedTeamSeasons, setLoadedTeamSeasons] = useState<Set<string>>(new Set());
  const [expandedPlayers, setExpandedPlayers] = useState<Set<number>>(new Set()); // Track which players have had their teams expanded
  const [clickedPlayers, setClickedPlayers] = useState<Set<number>>(new Set()); // Track all clicked players for orange color
  const [lastClickedTeamSeasonId, setLastClickedTeamSeasonId] = useState<string | null>(null); // Track the most recently expanded team for highlighting and collapse restriction
  const [pathNodes, setPathNodes] = useState<Set<string>>(new Set()); // Track nodes in the current path (path mode)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [playerNames, setPlayerNames] = useState<Record<number, string>>({});
  const graphRef = useRef<any>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  
  // Keep refs in sync with state
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    linksRef.current = links;
  }, [links]);

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

  // Initialize with just the player node
  useEffect(() => {
    const playerName = playerNames[playerId] || `Player ${playerId}`;
    const playerNode: GraphNode = {
      id: `player-${playerId}`,
      type: 'player',
      label: playerName,
      playerId,
      playerName,
    };
    setNodes([playerNode]);
    setLinks([]);
    setExpandedPlayers(new Set()); // Reset expanded players when starting player changes
    setLoadedTeamSeasons(new Set()); // Reset loaded team seasons
    setClickedPlayers(new Set()); // Reset clicked players
    setLastClickedTeamSeasonId(null); // Reset last clicked team
    setPathNodes(new Set([`player-${playerId}`])); // Initialize path with starting player
    setLoading(false);
  }, [playerId, playerNames]);

  // Load player's seasons (works for any player, not just starting player)
  const loadPlayerSeasons = useCallback(async (targetPlayerId: number) => {
    // Skip if this player has already been expanded
    if (expandedPlayers.has(targetPlayerId)) {
      return;
    }

    try {
      const response = await fetch(`/data/players/${targetPlayerId}.json`);
      if (!response.ok) throw new Error(`Failed to load player ${targetPlayerId}`);
      
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

      // Get current nodes to check which team-seasons already exist
      setNodes(prevNodes => {
        const existingTeamSeasonIds = new Set(
          prevNodes
            .filter(n => n.type === 'team-season')
            .map(n => n.id)
        );

        // Create team-season nodes (only for ones that don't already exist)
        const teamSeasonNodes: GraphNode[] = [];

        uniqueSeasons.forEach((record) => {
          const teamSeasonId = `team-${record.TEAM_ID}-${record.SEASON_ID}`;
          
          // Skip if this team-season is already visualized
          if (!existingTeamSeasonIds.has(teamSeasonId)) {
            teamSeasonNodes.push({
              id: teamSeasonId,
              type: 'team-season',
              label: `${record.TEAM_ABBREVIATION} ${record.SEASON_ID}`,
              teamId: record.TEAM_ID,
              teamAbbr: record.TEAM_ABBREVIATION,
              season: record.SEASON_ID,
            });
          }
        });

        // Add new team-season nodes
        const existingIds = new Set(prevNodes.map(n => n.id));
        const nodesToAdd = teamSeasonNodes.filter(n => !existingIds.has(n.id));
        
        return [...prevNodes, ...nodesToAdd];
      });

      // Add links (separate from nodes update to avoid nested state updates)
      setLinks(prevLinks => {
        // Helper function to normalize link endpoints (handle both strings and objects)
        const getLinkKey = (link: GraphLink) => {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;
          return `${sourceId}-${targetId}`;
        };
        
        const existingLinkKeys = new Set(prevLinks.map(getLinkKey));
        
        // Create links for all unique seasons
        const newLinks: GraphLink[] = [];
        uniqueSeasons.forEach((record) => {
          const teamSeasonId = `team-${record.TEAM_ID}-${record.SEASON_ID}`;
          newLinks.push({
            source: `player-${targetPlayerId}` as any,
            target: teamSeasonId as any,
            season: record.SEASON_ID,
            teamAbbr: record.TEAM_ABBREVIATION,
          });
        });
        
        const uniqueNewLinks = newLinks.filter(
          l => !existingLinkKeys.has(getLinkKey(l))
        );
        return [...prevLinks, ...uniqueNewLinks];
      });

      // Mark this player as expanded
      setExpandedPlayers(prev => new Set([...prev, targetPlayerId]));
    } catch (error) {
      console.error(`Error loading player ${targetPlayerId} seasons:`, error);
    }
  }, [playerId, expandedPlayers]);

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

      // Add new nodes
      setNodes(prevNodes => {
        const existingIds = new Set(prevNodes.map(n => n.id));
        const nodesToAdd = newNodes.filter(n => !existingIds.has(n.id));
        return [...prevNodes, ...nodesToAdd];
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
      
      // Set as the most recently expanded team
      setLastClickedTeamSeasonId(teamSeasonId);
    } catch (error) {
      console.error(`Error loading team roster for ${teamId} ${season}:`, error);
    }
  }, [playerId, loadedTeamSeasons, nodes]);

  // Collapse all teams except the specified one (path mode: collapse sibling teams from same parent player)
  const collapseSiblingTeams = useCallback((keepTeamSeasonId: string) => {
    const prevNodes = nodesRef.current;
    const prevLinks = linksRef.current;
    
    // Find the parent player of the clicked team
    let parentPlayerNodeId: string | null = null;
    for (const link of prevLinks) {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      if (sourceId.startsWith('player-') && targetId === keepTeamSeasonId) {
        parentPlayerNodeId = sourceId;
        break;
      }
      if (targetId.startsWith('player-') && sourceId === keepTeamSeasonId) {
        parentPlayerNodeId = targetId;
        break;
      }
    }

    // Identify which team-season nodes to keep: clicked team + teams in path
    const teamsToKeep = new Set<string>();
    teamsToKeep.add(keepTeamSeasonId); // Keep the clicked team
    pathNodes.forEach(nodeId => {
      if (nodeId.startsWith('team-')) teamsToKeep.add(nodeId); // Keep teams in the path
    });

    // Filter nodes: remove team-season nodes that aren't in teamsToKeep, but keep all player nodes
    const filteredNodes = prevNodes.filter(node => {
      if (node.type === 'player') return true; // Always keep all player nodes
      if (node.type === 'team-season') {
        return teamsToKeep.has(node.id); // Only keep teams in teamsToKeep
      }
      return true;
    });

    // Filter links: only keep links where both endpoints exist in filteredNodes
    const filteredLinks = prevLinks.filter(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      const sourceExists = filteredNodes.some(n => n.id === sourceId);
      const targetExists = filteredNodes.some(n => n.id === targetId);
      return sourceExists && targetExists;
    });

    // Update both states
    setNodes(filteredNodes);
    setLinks(filteredLinks);

    // Update loadedTeamSeasons: keep only the specified team and teams in the path
    setLoadedTeamSeasons(prev => {
      const newSet = new Set<string>();
      const keepKey = keepTeamSeasonId.replace('team-', '');
      if (prev.has(keepKey)) newSet.add(keepKey);
      pathNodes.forEach(nodeId => {
        if (nodeId.startsWith('team-')) {
          const key = nodeId.replace('team-', '');
          if (prev.has(key)) newSet.add(key);
        }
      });
      return newSet;
    });
  }, [playerId, pathNodes]);

  // Collapse other players connected to the same team as the clicked player (path mode)
  const collapseSiblingPlayers = useCallback((keepPlayerId: number) => {
    const keepPlayerNodeId = `player-${keepPlayerId}`;
    const prevNodes = nodesRef.current;
    const prevLinks = linksRef.current;
    
    // Find which team(s) the clicked player is connected to
    const teamsConnectedToPlayer = new Set<string>();
    prevLinks.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      if (sourceId === keepPlayerNodeId && targetId.startsWith('team-')) {
        teamsConnectedToPlayer.add(targetId);
      }
      if (targetId === keepPlayerNodeId && sourceId.startsWith('team-')) {
        teamsConnectedToPlayer.add(sourceId);
      }
    });

    // Find other players connected to the same teams (these should be collapsed)
    const playersToKeep = new Set<string>();
    playersToKeep.add(keepPlayerNodeId); // Always keep the clicked player
    pathNodes.forEach(nodeId => {
      if (nodeId.startsWith('player-')) playersToKeep.add(nodeId); // Keep players in the path
    });
    // Also keep the starting player
    playersToKeep.add(`player-${playerId}`);

    // Identify which team-season nodes to keep: teams connected to clicked player + teams in path
    const teamsToKeep = new Set<string>();
    teamsConnectedToPlayer.forEach(teamId => teamsToKeep.add(teamId)); // Keep teams from clicked player
    pathNodes.forEach(nodeId => {
      if (nodeId.startsWith('team-')) teamsToKeep.add(nodeId); // Keep teams in the path
    });

    // Filter nodes: keep only players in playersToKeep, keep teams in teamsToKeep
    const filteredNodes = prevNodes.filter(node => {
      if (node.type === 'player') {
        return playersToKeep.has(node.id); // Only keep players in playersToKeep
      }
      if (node.type === 'team-season') {
        return teamsToKeep.has(node.id); // Only keep teams in teamsToKeep
      }
      return true;
    });

    // Filter links: only keep links where both endpoints exist in filteredNodes
    const filteredLinks = prevLinks.filter(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      const sourceExists = filteredNodes.some(n => n.id === sourceId);
      const targetExists = filteredNodes.some(n => n.id === targetId);
      return sourceExists && targetExists;
    });

    // Update both states
    setNodes(filteredNodes);
    setLinks(filteredLinks);

    // Update expandedPlayers: keep only the kept player and players in the path
    setExpandedPlayers(prev => {
      const newSet = new Set<number>();
      if (prev.has(keepPlayerId)) newSet.add(keepPlayerId);
      pathNodes.forEach(nodeId => {
        if (nodeId.startsWith('player-')) {
          const pid = parseInt(nodeId.replace('player-', ''));
          if (prev.has(pid)) newSet.add(pid);
        }
      });
      return newSet;
    });
  }, [playerId, pathNodes]);

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
    
    // If this was the most recently expanded team, clear it
    setLastClickedTeamSeasonId(prev => prev === teamSeasonId ? null : prev);
  }, [playerId]);

  const handleNodeClick = useCallback((node: any) => {
    const graphNode = node as GraphNode;
    setSelectedNode(graphNode);
    
    if (pathMode) {
      // Path mode: collapse siblings at the same level
      if (graphNode.type === 'player' && graphNode.playerId) {
        const playerNodeId = `player-${graphNode.playerId}`;
        // Add to clicked players set
        setClickedPlayers(prev => new Set([...prev, graphNode.playerId!]));
        // Add to path
        setPathNodes(prev => new Set([...prev, playerNodeId]));
        // Collapse all other players' teams first
        collapseSiblingPlayers(graphNode.playerId);
        // Then load this player's teams
        loadPlayerSeasons(graphNode.playerId);
      }
      
      if (graphNode.type === 'team-season' && graphNode.teamId && graphNode.season) {
        const teamSeasonKey = `${graphNode.teamId}-${graphNode.season}`;
        const teamSeasonId = `team-${graphNode.teamId}-${graphNode.season}`;
        
        // Add to path
        setPathNodes(prev => new Set([...prev, teamSeasonId]));
        // Collapse all other teams from the same parent player first
        collapseSiblingTeams(teamSeasonId);
        // Then load this team's roster
        loadTeamRoster(graphNode.teamId, graphNode.season, graphNode.teamAbbr);
      }
    } else {
      // Normal mode: original behavior
      if (graphNode.type === 'player' && graphNode.playerId) {
        // Add to clicked players set (all clicked players will be orange)
        setClickedPlayers(prev => new Set([...prev, graphNode.playerId!]));
        loadPlayerSeasons(graphNode.playerId);
      }
      
      // If clicking a team-season node, toggle expansion/collapse
      if (graphNode.type === 'team-season' && graphNode.teamId && graphNode.season) {
        const teamSeasonKey = `${graphNode.teamId}-${graphNode.season}`;
        const teamSeasonId = `team-${graphNode.teamId}-${graphNode.season}`;
        
        // If already loaded (expanded), only collapse if it's the most recently expanded team
        if (loadedTeamSeasons.has(teamSeasonKey)) {
          if (lastClickedTeamSeasonId === teamSeasonId) {
            collapseTeamRoster(graphNode.teamId, graphNode.season);
          }
        } else {
          // Otherwise, expand it
          loadTeamRoster(graphNode.teamId, graphNode.season, graphNode.teamAbbr);
        }
      }
    }
  }, [pathMode, loadPlayerSeasons, loadTeamRoster, loadedTeamSeasons, collapseTeamRoster, lastClickedTeamSeasonId, collapseSiblingPlayers, collapseSiblingTeams]);

  const nodeColor = useCallback((node: any) => {
    const graphNode = node as GraphNode;
    // High contrast colors
    if (graphNode.type === 'player' && graphNode.playerId === playerId) {
      return '#10b981'; // Green for starting player (always green, even if clicked)
    }
    if (graphNode.type === 'player' && graphNode.playerId && clickedPlayers.has(graphNode.playerId)) {
      return '#f97316'; // Orange for all clicked players
    }
    if (graphNode.type === 'team-season' && graphNode.id === lastClickedTeamSeasonId) {
      return '#f59e0b'; // Amber/yellow for most recently clicked team node
    }
    return graphNode.type === 'player' ? '#2563eb' : '#dc2626'; // Blue for players, red for teams
  }, [playerId, clickedPlayers, lastClickedTeamSeasonId]);

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
          
          // Check if this is an edge from a player to a team-season
          const isPlayerToTeam = sourceId.startsWith('player-') && targetId.startsWith('team-');
          const isTeamToPlayer = targetId.startsWith('player-') && sourceId.startsWith('team-');
          
          // Make edges from players to team-seasons thicker (for all clicked players)
          if (isPlayerToTeam || isTeamToPlayer) {
            return 3; // Thicker for player-to-season edges
          }
          
          const playerNodeId = `player-${playerId}`;
          // Keep starting player edges slightly thicker (but player-to-season edges are handled above)
          if (sourceId === playerNodeId || targetId === playerNodeId) {
            return 2.5;
          }
          
          return 1; // Thin, clean lines for other edges
        }}
        // Edges automatically follow nodes dynamically (this is how force graphs work)
        nodeRelSize={8}
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
