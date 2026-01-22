import type { GraphNode, GraphLink } from '@/types/nba';

interface PathModeHelpers {
  nodesRef: React.MutableRefObject<GraphNode[]>;
  linksRef: React.MutableRefObject<GraphLink[]>;
  setNodes: React.Dispatch<React.SetStateAction<GraphNode[]>>;
  setLinks: React.Dispatch<React.SetStateAction<GraphLink[]>>;
  pathNodes: Set<string>;
  setPathNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
  setLoadedTeamSeasons: React.Dispatch<React.SetStateAction<Set<string>>>;
  setExpandedPlayers: React.Dispatch<React.SetStateAction<Set<number>>>;
  playerId: number;
}

/**
 * Collapse all teams except the specified one (path mode: collapse sibling teams from same parent player)
 */
export function collapseSiblingTeams(
  keepTeamSeasonId: string,
  helpers: PathModeHelpers
) {
  const { nodesRef, linksRef, setNodes, setLinks, pathNodes, setLoadedTeamSeasons, playerId } = helpers;
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
}

/**
 * Collapse other players connected to the same team as the clicked player (path mode)
 */
export function collapseSiblingPlayers(
  keepPlayerId: number,
  helpers: PathModeHelpers
) {
  const { nodesRef, linksRef, setNodes, setLinks, pathNodes, setExpandedPlayers, playerId } = helpers;
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

  // Identify which player nodes to keep: clicked player + players in path + starting player
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
}
