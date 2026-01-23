import os
import json
import time
from nba_api.stats.endpoints import playercareerstats

# Save paths relative to the script location
# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DATA_DIR = os.path.join(SCRIPT_DIR, "../public/data")
BASE_DATA_DIR = os.path.normpath(BASE_DATA_DIR)  # Normalize the path

os.makedirs(f"{BASE_DATA_DIR}/players", exist_ok=True)

print(f"Data will be saved to: {os.path.abspath(BASE_DATA_DIR)}")
print(f"Players directory: {os.path.abspath(f'{BASE_DATA_DIR}/players')}")


def fetch_player_data(player_ids):
    """
    Fetches and saves player career data for the given player IDs.
    
    Args:
        player_ids: A set or list of player IDs to fetch
    """
    print(f"--- Saving {len(player_ids)} player career paths ---")
    saved_count = 0
    error_count = 0
    skipped_count = 0
    
    for idx, p_id in enumerate(player_ids, 1):
        p_file = f"{BASE_DATA_DIR}/players/{p_id}.json"
        if not os.path.exists(p_file):
            try:
                career = playercareerstats.PlayerCareerStats(player_id=p_id).get_data_frames()[0]
                # Filter out the "TOT" trade summary rows
                career = career[career['TEAM_ABBREVIATION'] != 'TOT']
                career.to_json(p_file, orient='records')
                # Verify file was created
                if os.path.exists(p_file):
                    saved_count += 1
                    if idx % 100 == 0 or idx <= 5:  # Show first 5 and then every 100
                        print(f"  Progress: {idx}/{len(player_ids)} - Saved player {p_id} ({os.path.getsize(p_file)} bytes)")
                else:
                    error_count += 1
                    print(f"  ✗ ERROR: File not created for player {p_id} at {p_file}")
                time.sleep(0.7)
            except Exception as e:
                error_count += 1
                if error_count <= 10:  # Print first 10 errors for debugging
                    print(f"  Error fetching player {p_id}: {e}")
                elif error_count == 11:
                    print(f"  (Suppressing further error messages...)")
                continue
        else:
            skipped_count += 1
    
    print(f"--- Complete: Saved {saved_count}, Skipped {skipped_count}, Errors {error_count} ---")


if __name__ == "__main__":
    # Example: You can pass a list of player IDs here
    # For a full crawl, you would typically get these from fetch_team_rosters.py
    # or from scanning existing team roster files
    print("Usage: This script expects player IDs to be passed programmatically.")
    print("To fetch all players from team rosters, run fetch_team_rosters.py first,")
    print("then extract player IDs from the team roster files.")
    print("\nExample:")
    print("  from fetch_player_data import fetch_player_data")
    print("  player_ids = {1, 2, 3, ...}  # Your player IDs")
    print("  fetch_player_data(player_ids)")
