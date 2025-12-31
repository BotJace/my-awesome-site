import os
import json
from pathlib import Path

# Get the script directory and data directory
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "public" / "data"
TEAMS_DIR = DATA_DIR / "teams"
OUTPUT_FILE = DATA_DIR / "player_names.json"

player_names = {}

# Scan all team roster files to extract player ID -> name mappings
print("Scanning team roster files...")
team_files = list(TEAMS_DIR.glob("*.json"))
print(f"Found {len(team_files)} team files")

for team_file in team_files:
    try:
        with open(team_file, 'r') as f:
            roster_data = json.load(f)
            
        for player in roster_data:
            player_id = player.get('PLAYER_ID')
            player_name = player.get('PLAYER')
            
            if player_id and player_name:
                # If we already have this player ID with a different name, keep the first one
                # (player names shouldn't change, but just in case)
                if player_id not in player_names:
                    player_names[player_id] = player_name
                    
    except Exception as e:
        print(f"Error processing {team_file.name}: {e}")
        continue

# Save the mapping
with open(OUTPUT_FILE, 'w') as f:
    json.dump(player_names, f, indent=2)

print(f"\n✓ Generated player_names.json with {len(player_names)} player mappings")
print(f"  Saved to: {OUTPUT_FILE}")

