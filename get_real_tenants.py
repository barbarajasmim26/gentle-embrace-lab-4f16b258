import requests

SUPABASE_URL = "https://qvnfifgnadxmevatwdxm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2bmZpZmduYWR4bWV2YXR3ZHhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyOTc2MDMsImV4cCI6MjA5MTg3MzYwM30.1YwWepWgR28-Nl59vChEQi1S8cUsngcv-LvNVjNiRsw"

def get_data(table, select="*"):
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}"
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    r = requests.get(url, headers=headers)
    if r.status_code != 200:
        print(f"Erro ao acessar {table}: {r.status_code}")
        return []
    return r.json()

tenants = get_data("tenants", "id,name,status")
documents = get_data("documents", "tenant_id,category")

active_tenants = [t for t in tenants if t.get("status") == "active"]
tenant_ids_with_contracts = {d["tenant_id"] for d in documents if d.get("category") == "contract"}

missing = [t["name"] for t in active_tenants if t["id"] not in tenant_ids_with_contracts]

print("--- INQUILINOS ATIVOS ENCONTRADOS ---")
for t in sorted([t["name"] for t in active_tenants]):
    print(f"- {t}")

print("\n--- INQUILINOS SEM CONTRATO VINCULADO ---")
if missing:
    for name in sorted(missing):
        print(f"- {name}")
else:
    print("Todos possuem contrato.")
