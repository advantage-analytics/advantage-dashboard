########## Import Packages ##########
import os
import requests
from supabase import create_client, Client
from dotenv import load_dotenv

########## Create Client ##########
load_dotenv(".env.local")

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(url, key)

########## Python API Script ##########

def get_matches(user_id, year, match_type, result_type):

    url = f"https://app.universaltennis.com/api/v1/player/{user_id}/results"

    # only include 'year' when it's set
    params = {}

    if match_type is not None:
        params["type"] = match_type
    if year is not None:
        params["year"] = year
    if result_type is not None:
        params["resultType"] = result_type

    page = requests.get(url, params=params)
    data = page.json()


    results = []
    for event in data.get('events'):
        if len(event['draws']) == 0:
            source_results = event['results']
        else:
            source_results = event['draws'][0]['results']

        for result in source_results:
            match_record = {
                "id": result['id'],
                "date": result['date'],
                "player1_id": result['players']['winner1']['id'],
                "player1_name": result['players']['winner1']['firstName'] + " " + result['players']['winner1']['lastName'].title(),
                "player2_id": result['players']['loser1']['id'],
                "player2_name": result['players']['loser1']['firstName'] + " " + result['players']['loser1']['lastName'].title(),
                "round": result['round']['name'] if isinstance(result['round'], dict) else result['round'],
                # "round": result['round'],
                "score": result['score']
            }
            results.append(match_record)
    
    return results
    
########### Set Information ##########
year = None  # set to an int when you want to filter by year
match_type = "singles"
result_type = None # sanctioned or myutr

########### Fetch all UTR IDs from Supabase ##########
user_records = supabase.table("users").select("utr_id").not_.is_('utr_id', "null").execute()

# Extract list of UTR IDs
utr_ids = [record["utr_id"] for record in user_records.data]
print(utr_ids)

########## Loop through each UTR ID ##########
all_results = []
for utr_id in utr_ids:
    try:
        user_results = get_matches(utr_id, year, match_type, result_type)
        all_results.extend(user_results)
    except Exception as e:
        print(f"Error fetching matches for UTR ID {utr_id}: {e}")

########## all_results is a list of dicts with "id" as primary key ##########
unique_results = list({r["id"]: r for r in all_results}.values())

########## Insert into Supabase ##########
if unique_results:
    response = (
        supabase.table("matches")
        .upsert(unique_results, on_conflict="id")  # will update if same id already exists
        .execute()
    )
    print(response)
else: 
    print("No match results to insert.")


