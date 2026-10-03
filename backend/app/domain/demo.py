"""Sample decision content for demo mode (FX-20). Pure data; the numbers are fixed so the demo is
reproducible and deliberately a close call, which shows off the sensitivity features."""

TITLE = "Which job offer should I accept? (sample)"
CONTEXT = (
    "A sample decision so you can explore DecisionForge. Edit anything, or reset it from the "
    "banner to start over."
)
CATEGORY = "Sample"
TEMPLATE_ID = "builtin:job-offer"

# One row per option, one score (1-10) per criterion in the job-offer template's order:
# salary, growth, balance, commute (cost: higher = longer), culture, security.
OPTIONS: tuple[tuple[str, str, tuple[int, ...]], ...] = (
    (
        "Offer A — established company",
        "Strong pay and stability, slower growth.",
        (8, 5, 7, 6, 6, 9),
    ),
    ("Offer B — scale-up", "Fast learning and great team, less secure.", (6, 9, 5, 3, 8, 4)),
    ("Offer C — agency", "Decent pay, long commute and demanding hours.", (7, 6, 4, 8, 7, 5)),
)
