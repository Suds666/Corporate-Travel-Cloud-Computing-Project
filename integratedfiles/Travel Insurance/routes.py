from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta

from app.schemas import QuoteCreate, QuoteOut
from app.models import Quote
from app.logic import calculate_premium
from app.db import SessionLocal

router = APIRouter()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/quotes", response_model=QuoteOut)
def generate_quote(quote_data: QuoteCreate, db: Session = Depends(get_db)):
    premium = calculate_premium(quote_data)
    expiry = datetime.utcnow() + timedelta(hours=24)

    new_quote = Quote(
        user_id=quote_data.user_id,
        insurance_type=quote_data.insurance_type,
        destination=quote_data.destination,
        start_date=quote_data.start_date,
        end_date=quote_data.end_date,
        age=quote_data.age,
        pre_existing_conditions=quote_data.pre_existing_conditions,
        coverage_amount=quote_data.coverage_amount,
        calculated_premium=premium,
        quote_expiry=expiry
    )

    db.add(new_quote)
    db.commit()
    db.refresh(new_quote)

    return new_quote

@router.get("/quotes/{user_id}", response_model=List[QuoteOut])
def get_user_quotes(user_id: str, db: Session = Depends(get_db)):
    quotes = db.query(Quote).filter(Quote.user_id == user_id).all()
    if not quotes:
        raise HTTPException(status_code=404, detail="No quotes found for this user.")
    return quotes
