'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import type { GraphNode, GraphLink, PlayerCareerRecord, TeamRosterRecord } from '@/types/nba';

// ===== EASILY CHANGEABLE PLAYER ID =====
const PLAYER_ID = 2544; // LeBron James - Change this to visualize a different player
// =======================================

interface NbaGraphSigmaProps {
  initialPlayerId?: number;
}

export default function NbaGraphSigma({ initialPlayerId }: NbaGraphSigmaProps) {
  // Use prop if provided, otherwise use the constant
  const playerId = initialPlayerId || PLAYER_ID;
  
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loadedTeamSeasons, setLoadedTeamSeasons] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [playerName, setPlayerName] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);

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

      // Add season nodes and links
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
        
        // Add teammate node if it doesn't exist
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

  // Initialize Sigma instance
  useEffect(() => {
    if (!containerRef.current || sigmaRef.current) return;

    // Create graphology graph
    const graph = new Graph();
    graphRef.current = graph;

    // Initialize Sigma
    sigmaRef.current = new Sigma(graph, containerRef.current, {
      renderLabels: true,
      labelFont: '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      labelColor: { attribute: 'labelColor' },
      labelSize: 12,
      labelWeight: 'normal',
      defaultNodeColor: '#718096',
      defaultEdgeColor: 'rgba(100, 100, 100, 0.5)',
      minCameraRatio: 0.1,
      maxCameraRatio: 10,
    });

    // Handle node clicks
    sigmaRef.current.on('clickNode', ({ node }) => {
      const nodeData = graph.getNodeAttributes(node);
      
      const graphNode: GraphNode = {
        id: nodeData.id,
        type: nodeData.nodeType || nodeData.type, // Use nodeType from graph, fallback to type
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

    // Fix starting player position - use downNode event to prevent dragging
    sigmaRef.current.on('downNode', (event: { node: string }) => {
      const node = event.node;
      if (graph.getNodeAttribute(node, 'isStartingPlayer')) {
        // Reset position if starting player is moved
        graph.setNodeAttribute(node, 'x', 0);
        graph.setNodeAttribute(node, 'y', 0);
        graph.setNodeAttribute(node, 'fixed', true);
        sigmaRef.current?.refresh();
      }
    });

    return () => {
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
      if (graphRef.current) {
        graphRef.current.clear();
        graphRef.current = null;
      }
    };
  }, [playerId, loadPlayerSeasons, loadTeamRoster, loadedTeamSeasons]);

  // Update Sigma graph when nodes or links change
  useEffect(() => {
    if (!sigmaRef.current || !graphRef.current) return;

    const graph = graphRef.current;
    const sigma = sigmaRef.current;

    // Clear existing graph
    graph.clear();

    // Add nodes
    nodes.forEach(node => {
      const isStartingPlayer = node.playerId === playerId;
      const nodeColor = isStartingPlayer 
        ? '#10b981' // Green for starting player
        : node.type === 'player' 
          ? '#2563eb' // Blue for other players
          : '#dc2626'; // Red for teams

      graph.addNode(node.id, {
        label: node.label,
        size: isStartingPlayer ? 20 : 15,
        color: nodeColor,
        x: isStartingPlayer ? 0 : undefined,
        y: isStartingPlayer ? 0 : undefined,
        fixed: isStartingPlayer,
        nodeType: node.type, // Use nodeType instead of type to avoid conflict with Sigma's internal type system
        playerId: node.playerId,
        playerName: node.playerName,
        teamId: node.teamId,
        teamAbbr: node.teamAbbr,
        season: node.season,
        isStartingPlayer,
        labelColor: '#1f2937',
      });
    });

    // Add edges
    links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      const isStartingPlayerEdge = sourceId === `player-${playerId}` || targetId === `player-${playerId}`;
      
      const edgeId = `${sourceId}-${targetId}`;
      if (!graph.hasEdge(edgeId)) {
        graph.addEdge(sourceId, targetId, {
          size: isStartingPlayerEdge ? 2.5 : 1,
          color: isStartingPlayerEdge ? '#2d3748' : 'rgba(100, 100, 100, 0.5)',
          season: link.season,
          teamAbbr: link.teamAbbr,
          isStartingPlayerEdge,
        });
      }
    });

    // Initialize positions for nodes that don't have them
    graph.forEachNode((node) => {
      if (graph.getNodeAttribute(node, 'x') === undefined) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 100 + Math.random() * 200;
        graph.setNodeAttribute(node, 'x', Math.cos(angle) * radius);
        graph.setNodeAttribute(node, 'y', Math.sin(angle) * radius);
      }
    });

    // Run simple force-directed layout
    const runLayout = () => {
      const iterations = 150;
      const k = 150; // Ideal edge length
      const repulsion = 5000;
      const damping = 0.8;
      
      for (let i = 0; i < iterations; i++) {
        graph.forEachNode((node) => {
          if (graph.getNodeAttribute(node, 'fixed')) return;
          
          let fx = 0;
          let fy = 0;
          
          // Repulsion from other nodes
          graph.forEachNode((otherNode) => {
            if (node === otherNode || graph.getNodeAttribute(otherNode, 'fixed')) return;
            
            const x1 = graph.getNodeAttribute(node, 'x') || 0;
            const y1 = graph.getNodeAttribute(node, 'y') || 0;
            const x2 = graph.getNodeAttribute(otherNode, 'x') || 0;
            const y2 = graph.getNodeAttribute(otherNode, 'y') || 0;
            
            const dx = x1 - x2;
            const dy = y1 - y2;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = repulsion / (dist * dist);
            
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          });
          
          // Attraction along edges
          graph.forEachEdge(node, (edge, attributes, source, target) => {
            const otherNode = source === node ? target : source;
            const x1 = graph.getNodeAttribute(node, 'x') || 0;
            const y1 = graph.getNodeAttribute(node, 'y') || 0;
            const x2 = graph.getNodeAttribute(otherNode, 'x') || 0;
            const y2 = graph.getNodeAttribute(otherNode, 'y') || 0;
            
            const dx = x2 - x1;
            const dy = y2 - y1;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (dist - k) * 0.1;
            
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          });
          
          // Update position with damping
          const currentX = graph.getNodeAttribute(node, 'x') || 0;
          const currentY = graph.getNodeAttribute(node, 'y') || 0;
          graph.setNodeAttribute(node, 'x', currentX + fx * 0.1 * damping);
          graph.setNodeAttribute(node, 'y', currentY + fy * 0.1 * damping);
        });
      }
      
      sigma.refresh();
    };
    
    // Run layout after a short delay to ensure graph is ready
    setTimeout(runLayout, 50);
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

