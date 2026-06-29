"""Regression test for finding M5: OAuth client_secret logged in cleartext.

routes/mcp_routes.py used to do::

    logger.info(f"MCP add_server: oauth_file={oauth_file!r}")

where ``oauth_file`` is the raw JSON form field that carries ``client_secret``
(and ``client_id``) in cleartext. That leaked the credential into the logs.

These tests pin the property that the ``add_server`` handler never feeds the
raw ``oauth_file`` value into a logging call. They work purely off the source
AST so they do not require the (heavy) runtime dependencies of the module.
"""
import ast
import os

MCP_ROUTES = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "routes",
    "mcp_routes.py",
)

SECRET_BEARING_NAMES = {"oauth_file"}


def _load_add_server():
    with open(MCP_ROUTES, "r", encoding="utf-8") as fh:
        source = fh.read()
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "add_server":
            return node, source
    raise AssertionError("add_server handler not found in mcp_routes.py")


def _is_logger_call(call: ast.Call) -> bool:
    func = call.func
    return isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name) and func.value.id == "logger"


def _bare_secret_refs(node: ast.AST):
    """Yield FormattedValue/arg nodes that are a *bare* reference to a
    secret-bearing variable (i.e. its raw value would be rendered).

    ``bool(oauth_file)`` / ``oauth_file is not None`` are fine because the raw
    string value never reaches the log output; only a bare ``Name`` (optionally
    via ``!r``/``str()``) leaks the secret.
    """
    for sub in ast.walk(node):
        if isinstance(sub, ast.FormattedValue) and isinstance(sub.value, ast.Name):
            if sub.value.id in SECRET_BEARING_NAMES:
                yield sub.value.id


def test_add_server_never_logs_raw_oauth_file():
    add_server, _source = _load_add_server()
    offenders = []
    for node in ast.walk(add_server):
        if isinstance(node, ast.Call) and _is_logger_call(node):
            for arg in node.args:
                # Bare positional arg: logger.info(oauth_file)
                if isinstance(arg, ast.Name) and arg.id in SECRET_BEARING_NAMES:
                    offenders.append(arg.id)
                # f-string interpolation of the raw value.
                offenders.extend(_bare_secret_refs(arg))
    assert not offenders, (
        "add_server logs the raw oauth_file value (carries client_secret): "
        f"{offenders}"
    )


def test_oauth_file_log_is_presence_only():
    _add_server, source = _load_add_server()
    # The leaky format string must be gone...
    assert "oauth_file={oauth_file!r}" not in source
    assert "oauth_file={oauth_file}" not in source
    # ...and replaced by a presence-only log.
    assert "oauth_file provided={bool(oauth_file)}" in source
