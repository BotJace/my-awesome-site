import os
import json
import time
from nba_api.stats.endpoints import commonallplayers, commonteamroster

# Save paths relative to the script location
# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DATA_DIR = os.path.join(SCRIPT_DIR, "../public/data")
BASE_DATA_DIR = os.path.normpath(BASE_DATA_DIR)  # Normalize the path

os.makedirs(f"{BASE_DATA_DIR}/teams", exist_ok=True)

print(f"Data will be saved to: {os.path.abspath(BASE_DATA_DIR)}")
print(f"Teams directory: {os.path.abspath(f'{BASE_DATA_DIR}/teams')}")


def fetch_team_rosters(after_year=2000, current_year=2025):
    """
    Fetches and saves team rosters for each season.
    Returns a set of player IDs found across all seasons.
    """
    player_ids_to_fetch = set()

    for year in range(after_year, current_year + 1):
        season_str = f"{year}-{str(year+1)[-2:]}"
        print(f"--- Processing {season_str} ---")
        
        try:
            # 1. Get all players for this season to find the teams
            all_players = commonallplayers.CommonAllPlayers(
                is_only_current_season=0, season=season_str
            ).get_data_frames()[0]
            
            # Filter unique Team IDs (excluding Free Agents / ID 0)
            valid_teams = all_players[all_players['TEAM_ID'] != 0]['TEAM_ID'].unique()
            
            # 2. Save Roster for each Team in this Season
            for team_id in valid_teams:
                team_file = f"{BASE_DATA_DIR}/teams/{team_id}_{season_str}.json"
                if not os.path.exists(team_file):
                    print(f"  Fetching Roster: Team {team_id} ({season_str})")
                    try:
                        roster = commonteamroster.CommonTeamRoster(team_id=team_id, season=season_str).get_data_frames()[0]
                        roster.to_json(team_file, orient='records')
                        # Verify file was created
                        if os.path.exists(team_file):
                            print(f"    ✓ Saved to {team_file} ({os.path.getsize(team_file)} bytes)")
                        else:
                            print(f"    ✗ ERROR: File not created at {team_file}")
                        time.sleep(0.8) # Critical rate limit buffer
                    except Exception as e:
                        print(f"    ✗ Error saving team {team_id}: {e}")

            # Build a list of player IDs to get career paths later
            player_ids_to_fetch.update(all_players['PERSON_ID'].tolist())

        except Exception as e:
            print(f"  Error in {season_str}: {e}")
    
    return player_ids_to_fetch


if __name__ == "__main__":
    fetch_team_rosters(after_year=2000)
