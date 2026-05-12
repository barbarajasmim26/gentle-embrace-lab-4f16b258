import requests

SUPABASE_URL = "https://qvnfifgnadxmevatwdxm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2bmZpZmduYWR4bWV2YXR3ZHhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyOTc2MDMsImV4cCI6MjA5MTg3MzYwM30.1YwWepWgR28-Nl59vChEQi1S8cUsngcv-LvNVjNiRsw"

def search_tenant(name):
    url = f"{SUPABASE_URL}/rest/v1/tenants?name=ilike.*{name}*&select=*"
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    r = requests.get(url, headers=headers)
    return r.json()

print("Resultado da busca:", search_tenant("Adones"))
