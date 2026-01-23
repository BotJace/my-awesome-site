"""
Legacy crawler script - now split into two separate scripts:
- fetch_team_rosters.py: Fetches team roster data
- fetch_player_data.py: Fetches player career data

This file is kept for backward compatibility but now imports and uses the separate scripts.
"""

from fetch_team_rosters import fetch_team_rosters
from fetch_player_data import fetch_player_data


def crawl_nba_network(after_year=2020, current_year=2025):
    """
    Crawls NBA data starting from a specific year.
    Stores results as JSON in the public/data folder.
    This function orchestrates both team roster and player data fetching.
    """
    # First, fetch all team rosters and collect player IDs
    player_ids_to_fetch = fetch_team_rosters(after_year, current_year)
    
    # Then, fetch player career data for all collected player IDs
    fetch_player_data(player_ids_to_fetch)


if __name__ == "__main__":
    crawl_nba_network(after_year=2023)