from fastapi import APIRouter

from app.api.v1 import (
    accounts,
    transactions,
    imports,
    goals,
    investments,
    categories,
    budgets,
    analytics,
    insights,
    audit,
    internal,
)

router = APIRouter()
router.include_router(accounts.router)
router.include_router(transactions.router)
router.include_router(imports.router)
router.include_router(goals.router)
router.include_router(investments.router)
router.include_router(categories.router)
router.include_router(budgets.router)
router.include_router(analytics.router)
router.include_router(insights.router)
router.include_router(audit.router)

internal_router = APIRouter()
internal_router.include_router(internal.router)
