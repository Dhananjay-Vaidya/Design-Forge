"""BR-006: the scoring engine must have zero dependency on FastAPI/SQLAlchemy or the AI layer.
Port of backend/tests/scoring/test_purity.py, forbidden-prefix list adjusted to this stack."""

import ast
import inspect

from app.domain.scoring import engine


def test_engine_module_has_no_framework_or_ai_imports():
    source = inspect.getsource(engine)
    tree = ast.parse(source)
    imported_modules = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_modules.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_modules.append(node.module)

    forbidden_prefixes = ("fastapi", "sqlalchemy", "app.ai", "app.repositories", "app.api")
    violations = [m for m in imported_modules if m.startswith(forbidden_prefixes)]
    assert violations == [], f"Scoring engine must stay pure; found imports: {violations}"
