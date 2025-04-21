from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.schemas.policy import PolicyCreate, PolicyOut
from app.crud.policy import create_policy, get_policies, get_policy_by_id
from app.services.user_service import validate_user_exists

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/policies/", response_model=PolicyOut)
async def create_new_policy(policy: PolicyCreate, db: Session = Depends(get_db)):
    await validate_user_exists(policy.user_id)
    return create_policy(db, policy)

@router.get("/policies/", response_model=list[PolicyOut])
def list_policies(db: Session = Depends(get_db)):
    return get_policies(db)

@router.get("/policies/{policy_id}", response_model=PolicyOut)
def get_policy(policy_id: int, db: Session = Depends(get_db)):
    policy = get_policy_by_id(db, policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy
    
# ── New “external” route ──
@router.post("/policies/external", response_model=PolicyOut)
def create_policy_external(
    policy: PolicyCreate,
    db: Session = Depends(get_db),
):
    """
    Create a new policy without checking that the user exists.
    Intended for external integrations.
    """
    return create_policy(db, policy)