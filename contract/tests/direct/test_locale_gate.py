from unittest.mock import patch

OTHER = "0x" + "22" * 20
SOURCE = "On December 15, Pro subscribers in Brazil can buy the export add-on for $19."
MATCH = "El 15 de diciembre, los suscriptores Pro en Brasil podrán comprar el complemento de exportación por 19 USD."
DRIFT = MATCH.replace("19", "49")


def create(contract, targets="es"):
    return contract.create_release("Export add-on", "en", SOURCE, targets)


def review(contract, release, locale, copy, verdict):
    from genlayer.gl import nondet

    with patch.object(nondet, "exec_prompt", return_value={"verdict": verdict}):
        return contract.review_translation(release, locale, copy)


def test_creates_releases_with_normalized_targets(locale_gate):
    _, contract = locale_gate
    release = create(contract, "ES, pt-BR")
    assert release == "1"
    assert contract.get_release_count() == 1
    row = contract.get_release(release)
    assert row["source"] == SOURCE
    assert row["status"] == "DRAFT"
    assert row["targets"] == {
        "es": {"attempt": 0, "verdict": "UNREVIEWED"},
        "pt-br": {"attempt": 0, "verdict": "UNREVIEWED"},
    }


def test_invalid_inputs_leave_count_unchanged(locale_gate):
    vm, contract = locale_gate
    for targets, reason in (
        ("ES,es", "distinct"),
        ("en", "cannot be a target"),
        ("es_419", "language-region"),
        ("es,pt,fr,id,de", "distinct"),
    ):
        with vm.expect_revert(reason):
            create(contract, targets)
    with vm.expect_revert("Title"):
        contract.create_release(" ", "en", SOURCE, "es")
    assert contract.get_release_count() == 0


def test_only_publisher_can_modify_release(locale_gate):
    vm, contract = locale_gate
    release = create(contract)
    with vm.prank(OTHER):
        with vm.expect_revert("Only the publisher"):
            contract.review_translation(release, "es", MATCH)
        with vm.expect_revert("Only the publisher"):
            contract.publish_release(release)
    with vm.expect_revert("not a target"):
        contract.review_translation(release, "fr", MATCH)


def test_every_locale_must_match(locale_gate):
    vm, contract = locale_gate
    release = create(contract, "es,pt-br")
    with vm.expect_revert("Every target"):
        contract.publish_release(release)
    assert review(contract, release, "es", MATCH, "MATCH") == 1
    with vm.expect_revert("Every target"):
        contract.publish_release(release)
    assert review(contract, release, "pt-br", "Tradução incompleta.", "INCONCLUSIVE") == 1
    with vm.expect_revert("Every target"):
        contract.publish_release(release)


def test_detected_drift_blocks_then_corrected_copy_can_publish(locale_gate):
    vm, contract = locale_gate
    release = create(contract)
    assert review(contract, release, "es", DRIFT, "MATERIAL_DRIFT") == 1
    with vm.expect_revert("Every target"):
        contract.publish_release(release)
    assert review(contract, release, "es", MATCH, "MATCH") == 2
    contract.publish_release(release)
    assert contract.get_release(release)["status"] == "PUBLISHED"
    assert contract.get_review(release, "es", 1)["verdict"] == "MATERIAL_DRIFT"
    assert contract.get_review(release, "es", 2)["translation"] == MATCH
    with vm.expect_revert("immutable"):
        contract.review_translation(release, "es", DRIFT)
    with vm.expect_revert("immutable"):
        contract.publish_release(release)


def test_new_attempt_replaces_current_match(locale_gate):
    vm, contract = locale_gate
    release = create(contract)
    review(contract, release, "es", MATCH, "MATCH")
    review(contract, release, "es", DRIFT, "MATERIAL_DRIFT")
    with vm.expect_revert("Every target"):
        contract.publish_release(release)


def test_malformed_verdict_is_never_saved(locale_gate):
    vm, contract = locale_gate
    release = create(contract)
    with vm.expect_revert("Invalid consensus verdict"):
        review(contract, release, "es", MATCH, "PASS")
    assert contract.get_release(release)["targets"]["es"]["attempt"] == 0
    with vm.expect_revert("Review not found"):
        contract.get_review(release, "es", 1)


def test_validator_rechecks_evidence_independently(locale_gate):
    from genlayer.gl import nondet

    vm, contract = locale_gate
    release = create(contract)
    review(contract, release, "es", DRIFT, "MATERIAL_DRIFT")
    with patch.object(nondet, "exec_prompt", return_value={"verdict": "MATERIAL_DRIFT"}) as model:
        assert vm.run_validator()
        assert model.call_count == 1
    with patch.object(nondet, "exec_prompt", return_value={"verdict": "MATCH"}):
        assert not vm.run_validator()
