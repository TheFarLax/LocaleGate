"""Create a LocaleGate demo and verify drift, correction and publication on Studionet."""

import json

from genlayer_py.types import TransactionHashVariant, TransactionStatus

from deploy_studionet import ROOT, rpc, studio_client

TITLE = "Export add-on launch"
SOURCE = "On December 15, Pro subscribers in Brazil can buy the export add-on for $19."
CORRECT = "El 15 de diciembre, los suscriptores Pro en Brasil podrán comprar el complemento de exportación por 19 USD."
DRIFT = CORRECT.replace("19", "49")


def main():
    path = ROOT / "deployment_info.json"
    deployment = json.loads(path.read_text(encoding="utf-8"))
    if "demo" in deployment:
        print(json.dumps(deployment["demo"], indent=2))
        return
    address = deployment["contract_address"]
    client = studio_client()
    rpc(client, "sim_fundAccount", [client.local_account.address, 10**20])
    transactions = []

    def write(method, *args):
        tx = client.write_contract(address=address, function_name=method, args=list(args), leader_only=False)
        print(f"{method}: {tx}", flush=True)
        receipt = client.wait_for_transaction_receipt(
            transaction_hash=tx, status=TransactionStatus.FINALIZED, retries=100, full_transaction=True,
        )
        leaders = receipt["consensus_data"]["leader_receipt"]
        leader = leaders[-1] if isinstance(leaders, list) else leaders
        if receipt["status_name"] != "FINALIZED" or receipt["result_name"] != "MAJORITY_AGREE":
            raise RuntimeError(f"{method}: {receipt['status_name']} / {receipt['result_name']}")
        if leader["execution_result"] != "SUCCESS":
            raise RuntimeError(f"{method}: {leader['execution_result']}")
        transactions.append({"method": method, "hash": tx, "status": "FINALIZED"})

    def read(method, *args):
        return client.read_contract(
            address=address, function_name=method, args=list(args),
            transaction_hash_variant=TransactionHashVariant.LATEST_FINAL,
        )

    before = read("get_release_count")
    write("create_release", TITLE, "en", SOURCE, "es")
    for number in range(read("get_release_count"), before, -1):
        release_id = str(number)
        candidate = read("get_release", release_id)
        if candidate["publisher"] == client.local_account.address.lower():
            break
    else:
        raise RuntimeError("Demo release was not found")
    write("review_translation", release_id, "es", DRIFT)
    first = read("get_review", release_id, "es", 1)
    if first["verdict"] != "MATERIAL_DRIFT":
        raise RuntimeError(f"Unexpected first verdict: {first['verdict']}")
    write("review_translation", release_id, "es", CORRECT)
    second = read("get_review", release_id, "es", 2)
    if second["verdict"] != "MATCH":
        raise RuntimeError(f"Unexpected second verdict: {second['verdict']}")
    write("publish_release", release_id)
    if read("get_release", release_id)["status"] != "PUBLISHED":
        raise RuntimeError("Release did not publish")
    deployment["demo"] = {
        "release_id": release_id, "verdicts": [first["verdict"], second["verdict"]],
        "release_status": "PUBLISHED", "transactions": transactions,
    }
    path.write_text(json.dumps(deployment, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(deployment["demo"], indent=2))


if __name__ == "__main__":
    main()
