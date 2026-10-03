import sys
sys.path.append("/Users/salonisidheshwar/Desktop/dataone/DataOne-main 2/backend")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import SessionLocal
from app.models.db_connection import DBConnection

db = SessionLocal()
conns = db.query(DBConnection).filter(DBConnection.type == "databricks").all()
for c in conns:
    print(f"ID: {c.id}, Name: {c.name}, Config: {c.config}")
