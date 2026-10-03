"""
Built-in decision templates (FX-01). A pure, immutable catalogue: criteria, default weights and
direction for common decisions. Cloning one produces ordinary Criterion rows, so everything
downstream (scoring, ranking, snapshots) is unaware a template was involved. No AI, no I/O.

Weights use a 1–5 importance scale; they are relative and normalised by the engine (BR-004).
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

Direction = Literal["benefit", "cost"]
BENEFIT: Direction = "benefit"
COST: Direction = "cost"


@dataclass(frozen=True)
class TemplateCriterion:
    name: str
    weight: Decimal
    direction: Direction
    description: str = ""


@dataclass(frozen=True)
class TemplateDef:
    slug: str
    name: str
    description: str
    category: str
    title_hint: str
    criteria: tuple[TemplateCriterion, ...]
    option_hints: tuple[str, ...] = ()


def _c(name: str, weight: int, direction: Direction, description: str = "") -> TemplateCriterion:
    return TemplateCriterion(name, Decimal(weight), direction, description)


BUILTIN_TEMPLATES: tuple[TemplateDef, ...] = (
    TemplateDef(
        slug="job-offer",
        name="Job offer",
        description="Compare offers on pay, growth, balance and the day-to-day reality of the role.",
        category="Career",
        title_hint="Which job offer should I accept?",
        criteria=(
            _c("Salary and benefits", 5, BENEFIT, "Total compensation, not just base pay."),
            _c("Growth and learning", 4, BENEFIT, "Scope to build skills and advance."),
            _c("Work-life balance", 4, BENEFIT, "Hours, flexibility and remote options."),
            _c("Commute time", 3, COST, "Door-to-door time on a typical day."),
            _c("Team and culture", 3, BENEFIT, "People you would work with and how they work."),
            _c("Job security", 3, BENEFIT, "Company stability and role durability."),
        ),
    ),
    TemplateDef(
        slug="rent-vs-buy",
        name="Rent vs buy",
        description="Weigh the cost, flexibility and long-term outcome of renting against buying.",
        category="Housing",
        title_hint="Should we rent or buy?",
        criteria=(
            _c("Monthly cost", 4, COST, "Rent or mortgage plus running costs."),
            _c("Upfront cost", 4, COST, "Deposit, fees and moving costs."),
            _c("Flexibility", 3, BENEFIT, "Ease of moving if plans change."),
            _c("Long-term financial outcome", 4, BENEFIT, "Expected position after 5–10 years."),
            _c("Maintenance burden", 2, COST, "Time and money spent on repairs and upkeep."),
            _c("Stability and control", 3, BENEFIT, "Security of tenure and freedom to modify."),
        ),
        option_hints=("Keep renting", "Buy a home"),
    ),
    TemplateDef(
        slug="vendor-selection",
        name="Vendor or tool selection",
        description="Choose between suppliers, platforms or tools against fit, cost and risk.",
        category="Business",
        title_hint="Which vendor should we choose?",
        criteria=(
            _c("Total cost", 4, COST, "Licences, usage, support and migration."),
            _c("Fit to requirements", 5, BENEFIT, "Coverage of must-have needs."),
            _c("Ease of integration", 3, BENEFIT, "Effort to connect to existing systems."),
            _c("Support and reliability", 4, BENEFIT, "Track record, SLAs and responsiveness."),
            _c(
                "Security and compliance", 4, BENEFIT, "Certifications, data handling, audit trail."
            ),
            _c("Lock-in risk", 3, COST, "How hard it is to leave later."),
        ),
    ),
    TemplateDef(
        slug="university-course",
        name="University or course",
        description="Compare programmes on quality, cost and where they lead.",
        category="Education",
        title_hint="Which programme fits best?",
        criteria=(
            _c("Programme quality", 5, BENEFIT, "Curriculum, teaching and reputation."),
            _c("Total cost", 4, COST, "Fees plus living costs over the whole programme."),
            _c("Career outcomes", 4, BENEFIT, "Placement, network and earning prospects."),
            _c("Location and lifestyle", 3, BENEFIT, "Where you would live and how."),
            _c("Support and community", 2, BENEFIT, "Mentoring, peers and student services."),
            _c("Workload fit", 2, BENEFIT, "Whether the pace suits your life."),
        ),
    ),
    TemplateDef(
        slug="hiring-candidate",
        name="Hiring a candidate",
        description="Score finalists consistently against the same criteria.",
        category="Business",
        title_hint="Which candidate should we hire?",
        criteria=(
            _c("Relevant skills", 5, BENEFIT, "Demonstrated ability for the core of the role."),
            _c("Values and culture fit", 4, BENEFIT, "How they work with others."),
            _c("Communication", 4, BENEFIT, "Clarity in writing and conversation."),
            _c("Growth potential", 3, BENEFIT, "Capacity to take on more over time."),
            _c("Relevant experience", 3, BENEFIT, "Depth in similar settings."),
            _c("Salary expectation", 3, COST, "Cost relative to the budget."),
        ),
    ),
    TemplateDef(
        slug="big-purchase",
        name="Big purchase",
        description="Decide between products where price, quality and ownership cost all matter.",
        category="Purchase",
        title_hint="Which one should I buy?",
        criteria=(
            _c("Price", 4, COST, "Purchase price after discounts."),
            _c("Quality and durability", 5, BENEFIT, "Build quality and expected lifespan."),
            _c("Features", 3, BENEFIT, "Capabilities you will actually use."),
            _c("Running costs", 3, COST, "Energy, consumables and servicing."),
            _c("Warranty and support", 3, BENEFIT, "Coverage and ease of getting help."),
            _c("Resale value", 2, BENEFIT, "What it will fetch later."),
        ),
    ),
)

_BY_SLUG = {t.slug: t for t in BUILTIN_TEMPLATES}
BUILTIN_PREFIX = "builtin:"


def get_builtin(template_id: str) -> TemplateDef | None:
    """Accepts `builtin:<slug>`; anything else (including a bare slug) is not a built-in id."""
    if not template_id.startswith(BUILTIN_PREFIX):
        return None
    return _BY_SLUG.get(template_id.removeprefix(BUILTIN_PREFIX))
