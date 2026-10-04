"""Explainer (FX-05), snapshot payload (BR-007) and snapshot diff (FX-04): pure-domain tests."""

import json
from decimal import Decimal

from app.domain import diff, explain, sensitivity, snapshot
from app.domain.scoring import engine

D = Decimal
MIN, MAX = D(1), D(10)


# ---- shared fixture: the hand-checked A/B decision (see test_sensitivity) ----------------------


def engine_inputs(a_x=9, a_y=3, b_x=4, b_y=8, wx=2, wy=1):
    alternatives = [
        engine.AlternativeInput("A", "Option A"),
        engine.AlternativeInput("B", "Option B"),
    ]
    criteria = [
        engine.CriterionInput("X", D(wx), "benefit", True),
        engine.CriterionInput("Y", D(wy), "benefit", True),
    ]
    scores = [
        engine.ScoreCellInput("A", "X", D(a_x)),
        engine.ScoreCellInput("A", "Y", D(a_y)),
        engine.ScoreCellInput("B", "X", D(b_x)),
        engine.ScoreCellInput("B", "Y", D(b_y)),
    ]
    return alternatives, criteria, scores, {"X": "Salary", "Y": "Growth"}


def ranked(**kwargs):
    alternatives, criteria, scores, names = engine_inputs(**kwargs)
    result = engine.calculate_ranking(alternatives, criteria, scores, score_min=MIN, score_max=MAX)
    report = sensitivity.analyze(
        alternatives, criteria, scores, names, score_min=MIN, score_max=MAX
    )
    return result, names, report


# ---- explainer ---------------------------------------------------------------------------------


def test_explanation_states_exactly_what_the_ranking_says():
    result, names, report = ranked()
    e = explain.explain(result, names, report.weight_flips, report.score_flips)
    assert e.headline == "Option A ranks first with 66.7 points, 18.5 ahead of Option B."
    assert [(d.criterion, f"{d.points:.1f}", f"{d.share_percent:.1f}") for d in e.drivers] == [
        ("Salary", "59.3", "66.7"),
        ("Growth", "7.4", "33.3"),
    ]
    assert [(x.criterion, f"{x.points:.1f}") for x in e.ahead_on] == [("Salary", "37.0")]
    assert [(x.criterion, f"{x.points:.1f}") for x in e.behind_on] == [("Growth", "-18.5")]
    assert "comfortable" in e.stability
    # Growth and Salary tie on distance; the flip list orders ties by name, so Growth leads.
    assert e.flip_hint == (
        "The weight on Growth would need to rise from 33% to 50% of the total "
        "for Option B to take the lead."
    )
    assert e.text == (
        f"{e.headline} It leads mainly on Salary (+37.0). "
        f"It trails Option B on Growth (-18.5). {e.stability} {e.flip_hint}"
    )


def test_a_close_call_is_labelled_as_one():
    result, names, report = ranked(a_x=6, a_y=6, b_x=6, b_y=5)
    e = explain.explain(result, names, report.weight_flips, report.score_flips)
    assert "close call" in e.stability and "under 5 points" in e.stability


def test_decreasing_weight_flips_read_naturally():
    result, names, report = ranked()
    salary = next(f for f in report.weight_flips if f.name == "Salary")
    e = explain.explain(result, names, [salary], [])
    assert "would need to fall from 67% to 50%" in e.flip_hint


def test_with_no_weight_flip_it_falls_back_to_a_score_flip_then_to_a_plain_statement():
    result, names, report = ranked()
    e = explain.explain(result, names, [], report.score_flips)
    assert e.flip_hint.startswith(
        "Option A's Salary score would need to move by at least 2.6 points"
    )
    none = explain.explain(result, names, [], [])
    assert (
        none.flip_hint
        == "No single weight or score change within the scale would change the leader."
    )


def test_a_single_driver_and_no_trailing_clause_when_the_leader_is_ahead_everywhere():
    result, names, report = ranked(a_x=9, a_y=9, b_x=2, b_y=2)
    e = explain.explain(result, names, [], [])
    assert e.behind_on == []
    assert "trails" not in e.text
    assert explain._join([]) == "" and explain._join(["one"]) == "one"
    assert explain._join(["a", "b", "c"]) == "a, b and c"


# ---- snapshot payload --------------------------------------------------------------------------


def payload_parts(**kwargs):
    alternatives, criteria, scores, names = engine_inputs(**kwargs)
    result = engine.calculate_ranking(alternatives, criteria, scores, score_min=MIN, score_max=MAX)
    return {
        "decision": {"title": "T", "context": None, "category": "Career", "deadline": "2026-12-01"},
        "alternatives": [
            {"id": "A", "name": "Option A", "description": None, "position": 0},
            {"id": "B", "name": "Option B", "description": "b", "position": 1},
        ],
        "criteria": [
            {
                "id": "X",
                "name": "Salary",
                "weight": D("2.000"),
                "direction": "benefit",
                "is_active": True,
                "position": 0,
            },
            {
                "id": "Y",
                "name": "Growth",
                "weight": D("1.500"),
                "direction": "benefit",
                "is_active": True,
                "position": 1,
            },
        ],
        "scores": [
            {"alternative_id": s.alternative_id, "criterion_id": s.criterion_id, "score": s.score}
            for s in scores
        ],
        "ranking": result,
    }


def test_payload_is_plain_json_with_normalised_numbers():
    payload = snapshot.build_payload(**payload_parts())
    json.dumps(payload)  # no Decimals or other non-JSON types
    assert payload["schema"] == snapshot.SCHEMA_VERSION
    assert payload["decision"] == {
        "title": "T",
        "context": "",
        "category": "Career",
        "deadline": "2026-12-01",
    }
    assert [c["weight"] for c in payload["criteria"]] == [
        "2",
        "1.5",
    ]  # 2.000 -> "2", 1.500 -> "1.5"
    assert payload["alternatives"][0]["description"] == ""
    assert payload["ranking"]["order"][0] == {
        "alternative_id": "A",
        "name": "Option A",
        "rank": 1,
        "points": "66.667",
    }
    assert payload["ranking"]["method"] == engine.CALCULATION_METHOD_VERSION
    assert payload["ranking"]["leader_stable"] is True


def test_an_unrankable_snapshot_stores_no_ranking():
    parts = payload_parts()
    parts["ranking"] = None
    assert snapshot.build_payload(**parts)["ranking"] is None


# ---- diff --------------------------------------------------------------------------------------


def make(**changes):
    parts = payload_parts(**changes.pop("engine", {}))
    parts.update(changes)
    return snapshot.build_payload(**parts)


def test_identical_snapshots_have_no_differences():
    result = diff.compare(make(), make())
    assert result["summary"] == ["Leader unchanged: Option A.", "No other differences."]
    assert not any(result[k] for k in ("decision_changes", "alternatives", "criteria", "scores"))
    assert result["ranking"]["leader_changed"] is False
    assert all(m["rank_delta"] == 0 and m["points_delta"] == 0 for m in result["ranking"]["moves"])


def test_a_score_edit_that_flips_the_leader_is_reported_end_to_end():
    before = make()
    after = make(engine={"a_x": 3, "b_x": 9})  # swap who is strong on Salary
    result = diff.compare(before, after)
    assert result["ranking"]["leader_changed"] is True
    assert (result["ranking"]["leader_before"], result["ranking"]["leader_after"]) == (
        "Option A",
        "Option B",
    )
    assert result["summary"][0] == "Leader changed from Option A to Option B."
    assert "2 scores changed." in result["summary"]
    cells = {
        (s["alternative"], s["criterion"]): (s["before"], s["after"]) for s in result["scores"]
    }
    assert cells == {("Option A", "Salary"): (9.0, 3.0), ("Option B", "Salary"): (4.0, 9.0)}
    move_b = next(m for m in result["ranking"]["moves"] if m["name"] == "Option B")
    assert move_b["rank_before"] == 2 and move_b["rank_after"] == 1 and move_b["rank_delta"] == 1
    assert move_b["points_delta"] > 0
    assert [m["name"] for m in result["ranking"]["moves"]] == ["Option B", "Option A"]  # new order


def test_weight_changes_report_shares_including_indirect_shifts():
    a = make()
    parts = payload_parts()
    parts["criteria"][0]["weight"] = D("4")  # Salary 2 -> 4; Growth's SHARE shifts without an edit
    b = snapshot.build_payload(**parts)
    changes = {c["name"]: c for c in diff.compare(a, b)["criteria"]}
    assert changes["Salary"]["kind"] == "changed"
    assert changes["Salary"]["changes"] == [{"field": "weight", "before": "2", "after": "4"}]
    assert (
        round(changes["Salary"]["share_before"], 1) == 57.1
        and round(changes["Salary"]["share_after"], 1) == 72.7
    )
    assert changes["Growth"]["changes"] == []  # own fields untouched, but its share moved
    assert changes["Growth"]["share_before"] > changes["Growth"]["share_after"]
    assert diff.compare(a, b)["summary"][1] == "2 criteria changed."


def test_added_removed_and_renamed_items_are_matched_by_id_not_name():
    a = make()
    parts = payload_parts()
    parts["alternatives"][0]["name"] = "Renamed A"
    parts["alternatives"] = parts["alternatives"][:1] + [
        {"id": "C", "name": "Option C", "description": "", "position": 2}
    ]
    parts["criteria"] = [
        {**parts["criteria"][0], "name": "Pay", "direction": "cost", "is_active": False},
        {
            "id": "Z",
            "name": "New",
            "weight": D("1"),
            "direction": "benefit",
            "is_active": True,
            "position": 2,
        },
    ]
    parts["scores"] = []
    parts["ranking"] = None
    b = snapshot.build_payload(**parts)
    result = diff.compare(a, b)

    kinds = {(x["kind"], x["name"]): x.get("before_name") for x in result["alternatives"]}
    assert kinds == {
        ("renamed", "Renamed A"): "Option A",
        ("added", "Option C"): None,
        ("removed", "Option B"): None,
    }
    crit = {(c["kind"], c["name"]): c for c in result["criteria"]}
    assert {k for k in crit} == {("changed", "Pay"), ("added", "New"), ("removed", "Growth")}
    assert {f["field"] for f in crit[("changed", "Pay")]["changes"]} == {
        "name",
        "direction",
        "is_active",
    }
    assert (
        crit[("added", "New")]["share_before"] is None
        and crit[("added", "New")]["share_after"] == 100.0
    )
    assert crit[("removed", "Growth")]["share_after"] is None
    assert result["score_cells_removed"] == 4 and result["score_cells_added"] == 0
    assert result["ranking"]["available_after"] is False
    assert result["ranking"]["leader_changed"] is False
    assert result["summary"][0].startswith("A ranking is not available")
    assert "options" in " ".join(result["summary"]) and "criteria changed" in " ".join(
        result["summary"]
    )


def test_decision_field_edits_and_cell_additions_are_reported():
    a = make()
    parts = payload_parts()
    parts["decision"]["title"] = "New title"
    parts["decision"]["deadline"] = None
    b = snapshot.build_payload(**parts)
    changes = {c["field"]: c for c in diff.compare(a, b)["decision_changes"]}
    assert changes["title"] == {"field": "title", "before": "T", "after": "New title"}
    assert changes["deadline"] == {"field": "deadline", "before": "2026-12-01", "after": None}
    assert "Decision details were edited." in diff.compare(a, b)["summary"]

    fewer = payload_parts()
    fewer["scores"] = fewer["scores"][:2]
    smaller = snapshot.build_payload(**fewer)
    assert diff.compare(smaller, a)["score_cells_added"] == 2


def test_a_zero_total_weight_does_not_divide_by_zero():
    parts = payload_parts()
    for c in parts["criteria"]:
        c["is_active"] = False
    b = snapshot.build_payload(**{**parts, "ranking": None})
    assert diff.compare(b, b)["criteria"] == []
    assert diff._shares(b) == {}
