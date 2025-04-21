from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.schemas.document import DocumentCreate, DocumentOut
from app.crud.documents import create_document_sync, get_document, get_all_documents

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/documents/", response_model=DocumentOut)
def generate_document(document: DocumentCreate, db: Session = Depends(get_db)):
    try:
        # Using the synchronous wrapper to perform async operations in our endpoint.
        return create_document_sync(db, document)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/documents/", response_model=list[DocumentOut])
def list_documents(db: Session = Depends(get_db)):
    return get_all_documents(db)

@router.get("/documents/{document_id}", response_model=DocumentOut)
def get_document_by_id(document_id: int, db: Session = Depends(get_db)):
    doc = get_document(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc
