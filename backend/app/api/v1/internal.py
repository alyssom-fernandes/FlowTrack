from fastapi import APIRouter, Depends
from app.core.security import verify_internal_token
from app.core.logging import get_logger

router = APIRouter()
logger = get_logger(__name__)


@router.post("/process-queue", dependencies=[Depends(verify_internal_token)])
async def process_queue():
    """
    Processes pending items in the categorization_queue.
    Called by external cron (cron-job.org) every 5 minutes.
    Protected by X-Internal-Secret header.
    """
    logger.info("Processing categorization queue")
    # TODO: implement worker logic in Phase 2
    return {"status": "ok", "processed": 0}
