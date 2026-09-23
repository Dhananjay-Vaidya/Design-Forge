"""BR-006: the scoring engine must have zero dependency on Django or the AI layer."""

import ast
import inspect

from apps.scoring import engine


def test_engine_module_has_no_django_or_ai_imports():
    source = inspect.getsource(engine)
    tree = ast.parse(source)
    imported_modules = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_modules.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_modules.append(node.module)

    forbidden_prefixes = ("django", "apps.ai", "apps.decisions", "rest_framework")
    violations = [m for m in imported_modules if m.startswith(forbidden_prefixes)]
    assert violations == [], f"Scoring engine must stay pure; found imports: {violations}"
