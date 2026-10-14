"""Primeira camada da categorização: regras fixas para comerciantes conhecidos.

Custo zero e resposta imediata. O que não casar aqui vai para o cache de
comerciantes e, por fim, para o Claude Haiku (ver claude_api.py e a ADR 0004).
As mesmas regras rodam na demonstração do navegador (frontend/src/demo/backend.ts).
"""
import re

# (padrão, categoria padrão, confiança)
RULES: list[tuple[re.Pattern, str, float]] = [
    (re.compile(r"mercad|supermerc|zaffari|carrefour|hortifruti|p[aã]o de a[cç]|atacad|assa[ií]", re.I), "Alimentação", 0.94),
    (re.compile(r"ifood|burger|restaur|padaria|lanch|pizza|caf[eé]", re.I), "Alimentação", 0.91),
    (re.compile(r"uber|\b99\b|t[aá]xi|shell|posto|ipiranga|combust|estacion", re.I), "Transporte", 0.95),
    (re.compile(r"drogasil|raia|farm[aá]c|droga|cl[ií]nic|consulta", re.I), "Saúde", 0.92),
    (re.compile(r"livrar|curso|alura|udemy|escola", re.I), "Educação", 0.9),
    (re.compile(r"netflix|spotify|prime|globoplay|disney|assinatura", re.I), "Assinaturas", 0.97),
    (re.compile(r"cinema|cinemark|steam|show|ingresso", re.I), "Lazer", 0.88),
    (re.compile(r"renner|riachuelo|zara|c&a|roupa", re.I), "Vestuário", 0.9),
]


def match_rule(description: str) -> tuple[str, float] | None:
    """Nome da categoria padrão e a confiança da regra, ou None se nenhuma casar."""
    for pattern, category, confidence in RULES:
        if pattern.search(description or ""):
            return category, confidence
    return None
